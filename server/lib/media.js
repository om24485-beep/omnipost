// Media library: probing, thumbnails, platform-safe transcoding and 9:16 conversion — all via local ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG, run, ffmpeg } from './tools.js';
import { MEDIA_DIR, THUMB_DIR } from './paths.js';
import { db } from './db.js';
import { emit } from './events.js';
import { uid } from './util.js';

export const mediaPath = (m) => path.join(MEDIA_DIR, m.file);
export const findMedia = (id) => db.data.media.find((m) => m.id === id);
const publish = () => { db.save(); emit('media', db.data.media); };

export async function probe(file) {
  const { err } = await run(FFMPEG, ['-hide_banner', '-i', file], { allowFail: true });
  const d = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = err.match(/Stream #[^\n]*?Video: ([a-z0-9_]+)[^\n]*?, (\d{2,5})x(\d{2,5})/i);
  const a = err.match(/Stream #[^\n]*?Audio: ([a-z0-9_]+)/i);
  const rot = err.match(/rotation of (-?\d+(?:\.\d+)?) degrees/) || err.match(/rotate\s*:\s*(-?\d+)/);
  let width = v ? +v[2] : null;
  let height = v ? +v[3] : null;
  if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) [width, height] = [height, width];
  return {
    duration: d ? (+d[1]) * 3600 + (+d[2]) * 60 + (+d[3]) : null,
    vcodec: v?.[1]?.toLowerCase() || null,
    acodec: a?.[1]?.toLowerCase() || null,
    width,
    height,
  };
}

async function makeThumb(file, duration) {
  const name = `${path.basename(file).replace(/\.[^.]+$/, '')}.jpg`;
  const out = path.join(THUMB_DIR, name);
  const ss = duration && duration > 2 ? Math.min(duration * 0.1, 3) : 0;
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(ss), '-i', file, '-frames:v', '1',
    '-vf', 'scale=540:-2', '-q:v', '4', out], { allowFail: true });
  return fs.existsSync(out) ? name : null;
}

export async function addMedia(file, { name, source } = {}) {
  const info = await probe(file);
  if (!info.vcodec) {
    fs.rmSync(file, { force: true });
    throw new Error('That file has no video stream.');
  }
  const m = {
    id: uid(10),
    name: name || path.basename(file),
    file: path.basename(file),
    size: fs.statSync(file).size,
    ...info,
    thumb: await makeThumb(file, info.duration),
    source: source || { type: 'upload' },
    createdAt: Date.now(),
  };
  db.data.media.unshift(m);
  publish();
  return m;
}

export function removeMedia(id) {
  const i = db.data.media.findIndex((m) => m.id === id);
  if (i < 0) return false;
  const [m] = db.data.media.splice(i, 1);
  fs.rmSync(mediaPath(m), { force: true });
  if (m.thumb) fs.rmSync(path.join(THUMB_DIR, m.thumb), { force: true });
  publish();
  return true;
}

const isCompatible = (m) => /\.mp4$/i.test(m.file) && m.vcodec === 'h264' && (!m.acodec || m.acodec === 'aac');

/** Instagram & TikTok are picky: make sure the file is H.264/AAC MP4 (re-encodes in place if needed). */
export async function ensureCompatible(m, onProgress) {
  if (isCompatible(m)) return m;
  const src = mediaPath(m);
  const outName = `${m.file.replace(/\.[^.]+$/, '')}-h264.mp4`;
  const out = path.join(MEDIA_DIR, outName);
  await ffmpeg(['-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { duration: m.duration, onProgress });
  fs.rmSync(src, { force: true });
  Object.assign(m, await probe(out), { file: outName, size: fs.statSync(out).size });
  publish();
  return m;
}

/** Reframe any video to 1080x1920 with a blurred fill — perfect for Shorts, Reels and TikTok. */
export async function makeVertical(m, onProgress) {
  const outName = `${uid(8)}-vertical.mp4`;
  const out = path.join(MEDIA_DIR, outName);
  const filter = '[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:6[bg];'
    + '[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]';
  await ffmpeg(['-i', mediaPath(m), '-filter_complex', filter, '-map', '[v]', '-map', '0:a:0?', '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out],
  { duration: m.duration, onProgress });
  return addMedia(out, { name: `${m.name.replace(/\.[^.]+$/, '')} (9:16).mp4`, source: { ...m.source, derivedFrom: m.id } });
}
