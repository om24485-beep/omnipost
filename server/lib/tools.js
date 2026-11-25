// External engines: yt-dlp (downloads/metadata from 1800+ sites) and ffmpeg (bundled via ffmpeg-static).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { BIN_DIR, MEDIA_DIR } from './paths.js';
import { uid } from './util.js';

export const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

function lineSplitter(onLine) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.search(/[\r\n]/)) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  };
}

function cleanError(stderr) {
  const lines = String(stderr).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errs = lines.filter((l) => /^ERROR:/i.test(l)).map((l) => l.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, ''));
  return (errs.length ? errs : lines.slice(-3)).join('\n').slice(0, 600);
}

/** Spawn a process (no shell), collect output, optionally stream lines. */
export function run(cmd, args, { onLine, allowFail = false, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    const outLines = onLine ? lineSplitter(onLine) : null;
    const errLines = onLine ? lineSplitter(onLine) : null;
    p.stdout.on('data', (d) => { out += d; outLines?.(String(d)); });
    p.stderr.on('data', (d) => { err += d; errLines?.(String(d)); });
    const timer = timeout ? setTimeout(() => p.kill(), timeout) : null;
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || allowFail) resolve({ code, out, err });
      else reject(new Error(cleanError(err) || `${path.basename(cmd)} exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------- yt-dlp
const ASSET = process.platform === 'win32' ? 'yt-dlp.exe'
  : process.platform === 'darwin' ? 'yt-dlp_macos'
  : process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const LOCAL = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';

let ytdlpPath = null;
let locating = null;

export function ytdlp() {
  if (ytdlpPath) return Promise.resolve(ytdlpPath);
  locating ??= locate().then((p) => (ytdlpPath = p)).finally(() => { locating = null; });
  return locating;
}

async function locate() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (fs.existsSync(LOCAL)) return LOCAL;
  try { await run('yt-dlp', ['--version']); return 'yt-dlp'; } catch { /* not on PATH */ }
  await installYtDlp();
  return LOCAL;
}

/** Download the official yt-dlp release binary and verify it against the published SHA-256 sums. */
async function installYtDlp() {
  console.log('[omnipost] Installing yt-dlp from the official GitHub release…');
  const [bin, sums] = await Promise.all([fetch(RELEASES + ASSET), fetch(RELEASES + 'SHA2-256SUMS')]);
  if (!bin.ok || !sums.ok) throw new Error('Could not download yt-dlp from GitHub. Check your internet connection.');
  const buf = Buffer.from(await bin.arrayBuffer());
  const expected = (await sums.text()).split('\n').map((l) => l.trim().split(/\s+/)).find(([, name]) => name === ASSET)?.[0];
  const actual = crypto.createHash('sha256').update(buf).digest('hex');
  if (!expected || expected !== actual) throw new Error('yt-dlp checksum mismatch — refusing to install it.');
  fs.writeFileSync(`${LOCAL}.part`, buf, { mode: 0o755 });
  fs.renameSync(`${LOCAL}.part`, LOCAL);
}

export async function ytdlpVersion() {
  try { return (await run(await ytdlp(), ['--version'])).out.trim(); } catch { return null; }
}

export async function updateYtDlp() {
  const current = await ytdlp();
  if (current === LOCAL) await installYtDlp();
  else await run(current, ['-U'], { allowFail: true });
  return ytdlpVersion();
}

/** Keep the bundled yt-dlp fresh — sites change constantly. */
export function autoUpdateYtDlp() {
  try {
    if (Date.now() - fs.statSync(LOCAL).mtimeMs > 7 * 24 * 3600e3) updateYtDlp().catch(() => {});
  } catch { /* not installed locally */ }
}

const BASE_ARGS = ['--ignore-config', '--no-warnings'];

function pickThumb(e) {
  const list = e.thumbnails;
  if (!list?.length) return e.thumbnail || null;
  return [...list].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)) || (b.preference || 0) - (a.preference || 0))[0].url;
}

export function normalizeInfo(j) {
  const isYT = /youtube/i.test(j.extractor_key || j.extractor || '');
  if (j._type === 'playlist' || Array.isArray(j.entries)) {
    return {
      kind: 'collection',
      title: j.title || j.uploader || 'Collection',
      uploader: j.uploader || j.channel || null,
      url: j.webpage_url || j.original_url,
      entries: (j.entries || []).filter(Boolean).map((e) => ({
        id: e.id,
        url: /^https?:/.test(e.url || '') ? e.url : (e.webpage_url || e.original_url || e.url),
        title: e.title || 'Untitled',
        thumbnail: pickThumb(e) || (isYT && e.id ? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg` : null),
        duration: e.duration ?? null,
        views: e.view_count ?? null,
        timestamp: e.timestamp ? e.timestamp * 1000 : null,
      })),
    };
  }
  return {
    kind: 'video',
    id: j.id,
    url: j.webpage_url || j.original_url,
    title: j.title || j.fulltitle || 'Untitled',
    description: j.description || '',
    uploader: j.uploader || j.channel || j.uploader_id || null,
    uploaderUrl: j.uploader_url || j.channel_url || null,
    platform: (j.extractor_key || j.extractor || '').replace(/:.*/, ''),
    thumbnail: j.thumbnail || pickThumb(j),
    duration: j.duration ?? null,
    views: j.view_count ?? null,
    likes: j.like_count ?? null,
    width: j.width ?? null,
    height: j.height ?? null,
    timestamp: j.timestamp ? j.timestamp * 1000 : null,
    tags: (j.tags || []).slice(0, 15),
  };
}

/** Metadata for a video, or a flat list for a channel / profile / playlist URL. */
export async function inspect(url, { cookies, limit = 60 } = {}) {
  const args = [...BASE_ARGS, '-J', '--flat-playlist', '--no-playlist', '--playlist-end', String(limit),
    '--extractor-args', 'youtubetab:approximate_date'];
  if (cookies) args.push('--cookies', cookies);
  args.push('--', url);
  const { out } = await run(await ytdlp(), args, { timeout: 180000 });
  return normalizeInfo(JSON.parse(out));
}

/** Download a single video as an MP4 (H.264 preferred) into the media folder. Returns the file path. */
export async function download(url, { cookies, onProgress } = {}) {
  const tmpl = path.join(MEDIA_DIR, `${uid(8)}-%(id).40B.%(ext)s`);
  const args = [...BASE_ARGS, '--no-playlist', '--newline', '--progress', '--quiet', '--restrict-filenames',
    '--progress-template', 'download:OMNI|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '-f', 'bv*[vcodec^=avc1][height<=1920]+ba[ext=m4a]/bv*[vcodec^=avc1]+ba/b[ext=mp4]/bv*+ba/b',
    '--merge-output-format', 'mp4', '--ffmpeg-location', FFMPEG,
    '-o', tmpl, '--print', 'after_move:OMNIFILE|%(filepath)s'];
  if (cookies) args.push('--cookies', cookies);
  args.push('--', url);
  let file = null;
  await run(await ytdlp(), args, {
    timeout: 60 * 60e3,
    onLine(line) {
      if (line.startsWith('OMNIFILE|')) file = line.slice(9).trim();
      else if (line.startsWith('OMNI|')) {
        const [, pct, speed, eta] = line.split('|');
        onProgress?.(parseFloat(pct) || 0, speed?.trim(), eta?.trim());
      }
    },
  });
  if (!file || !fs.existsSync(file)) throw new Error('Download finished but the file could not be found.');
  return file;
}

/** Run ffmpeg with machine-readable progress (0-100). */
export function ffmpeg(args, { duration, onProgress } = {}) {
  return run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-nostats', ...args], {
    timeout: 3 * 60 * 60e3,
    onLine(line) {
      const m = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m && duration && onProgress) onProgress(Math.min(99, (((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) / duration) * 100));
    },
  });
}
