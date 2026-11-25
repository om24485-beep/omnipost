// Posting queue: one post -> many platforms, run one at a time through the real browser, with scheduling and retries.
import path from 'node:path';
import { db } from './db.js';
import { emit } from './events.js';
import { withPage } from './browser.js';
import { ensureCompatible, findMedia, mediaPath } from './media.js';
import { DEBUG_DIR } from './paths.js';
import { uid } from './util.js';
import { platforms } from '../platforms/index.js';

const publish = (job) => { db.save(); emit('job', job); };

function textFor(job, pid) {
  const o = job.perPlatform?.[pid] || {};
  const base = String(o.caption ?? job.caption ?? '').trim();
  const tags = (job.tags || []).map((t) => `#${String(t).replace(/^#/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1);
  const missing = tags.filter((t) => !base.toLowerCase().includes(t.toLowerCase()));
  return [base, missing.join(' ')].filter(Boolean).join('\n\n');
}

function payloadFor(job, pid, media) {
  const limits = platforms[pid].limits || {};
  const caption = textFor(job, pid).slice(0, limits.caption || 2200);
  const firstLine = caption.split('\n').find((l) => l.trim()) || '';
  const rawTitle = (job.perPlatform?.[pid]?.title ?? job.title ?? '').trim() || firstLine || media.name.replace(/\.[^.]+$/, '');
  return {
    file: mediaPath(media),
    title: rawTitle.replace(/[<>]/g, '').slice(0, limits.title || 100),
    description: caption.replace(/[<>]/g, ''),
    caption,
    visibility: job.visibility || 'public',
  };
}

export function createJob(input) {
  const media = findMedia(input.mediaId);
  if (!media) throw new Error('Pick a video first.');
  const targets = [...new Set(input.platforms || [])].filter((p) => platforms[p]);
  if (!targets.length) throw new Error('Choose at least one platform.');
  const missing = targets.filter((p) => !db.data.accounts[p]);
  if (missing.length) throw new Error(`Connect ${missing.map((p) => platforms[p].name).join(', ')} first.`);
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt).getTime() : null;
  if (scheduledAt !== null && Number.isNaN(scheduledAt)) throw new Error('Invalid schedule time.');
  const job = {
    id: uid(10),
    mediaId: media.id,
    title: String(input.title || '').slice(0, 300),
    caption: String(input.caption || '').slice(0, 5000),
    tags: (input.tags || []).map(String).slice(0, 30),
    perPlatform: input.perPlatform || {},
    visibility: ['public', 'unlisted', 'private'].includes(input.visibility) ? input.visibility : 'public',
    scheduledAt,
    status: 'queued',
    createdAt: Date.now(),
    targets: targets.map((platform) => ({ platform, status: 'queued', step: '', url: null, error: null })),
  };
  db.data.jobs.unshift(job);
  publish(job);
  kick();
  return job;
}

function finalize(job) {
  const s = job.targets.map((t) => t.status);
  if (s.some((x) => x === 'queued' || x === 'running')) job.status = s.includes('running') ? 'running' : 'queued';
  else if (s.every((x) => x === 'done')) job.status = 'done';
  else if (s.every((x) => x === 'canceled')) job.status = 'canceled';
  else if (s.some((x) => x === 'done')) job.status = 'partial';
  else job.status = 'failed';
}

async function runTarget(job, target, media) {
  const def = platforms[target.platform];
  const account = db.data.accounts[target.platform];
  if (!account) {
    Object.assign(target, { status: 'failed', error: `${def.name} is not connected.` });
    return;
  }
  Object.assign(target, { status: 'running', error: null, step: 'Starting', startedAt: Date.now() });
  publish(job);
  let lastEmit = 0;
  const step = (msg) => {
    target.step = msg;
    if (Date.now() - lastEmit > 400) { lastEmit = Date.now(); emit('job', job); }
  };
  try {
    const result = await withPage(async (page) => {
      try {
        return await def.upload(page, payloadFor(job, target.platform, media), { step, account });
      } catch (e) {
        const shot = `${job.id}-${target.platform}.png`;
        await page.screenshot({ path: path.join(DEBUG_DIR, shot) }).then(() => { target.debugShot = shot; }).catch(() => {});
        throw e;
      }
    }, { headed: db.data.settings.showBrowser });
    Object.assign(target, { status: 'done', url: result?.url || account.profileUrl || null, step: 'Published', finishedAt: Date.now() });
  } catch (e) {
    Object.assign(target, { status: 'failed', error: e.message.split('\n')[0].slice(0, 400), step: '' });
    if (e.code === 'NEEDS_LOGIN') {
      account.needsReconnect = true;
      emit('accounts', db.data.accounts);
    }
  }
}

async function runJob(job) {
  job.status = 'running';
  publish(job);
  const media = findMedia(job.mediaId);
  if (!media) {
    for (const t of job.targets) if (t.status === 'queued') Object.assign(t, { status: 'failed', error: 'The video was deleted from your library.' });
  } else {
    if (job.targets.some((t) => t.status === 'queued' && t.platform !== 'youtube')) {
      try {
        await ensureCompatible(media, (pct) => {
          for (const t of job.targets) if (t.status === 'queued') t.step = `Optimizing video ${Math.round(pct)}%`;
          emit('job', job);
        });
      } catch (e) {
        for (const t of job.targets) if (t.status === 'queued') Object.assign(t, { status: 'failed', error: `Could not convert video: ${e.message}` });
      }
    }
    for (const t of job.targets) {
      if (t.status === 'queued') await runTarget(job, t, media);
      publish(job);
    }
  }
  finalize(job);
  publish(job);
}

let running = false;
export async function kick() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const now = Date.now();
      const next = [...db.data.jobs].reverse().find((j) => (j.status === 'queued' || j.status === 'running')
        && (!j.scheduledAt || j.scheduledAt <= now) && j.targets.some((t) => t.status === 'queued'));
      if (!next) break;
      await runJob(next);
    }
  } finally {
    running = false;
  }
}

export function retryJob(job, platform) {
  for (const t of job.targets) {
    if ((t.status === 'failed' || t.status === 'canceled') && (!platform || t.platform === platform)) {
      Object.assign(t, { status: 'queued', error: null, step: '', debugShot: undefined });
    }
  }
  job.scheduledAt = null;
  finalize(job);
  publish(job);
  kick();
}

export function cancelJob(job) {
  for (const t of job.targets) if (t.status === 'queued') t.status = 'canceled';
  finalize(job);
  publish(job);
}

/** Anything that was mid-upload when the app stopped is marked as interrupted. */
export function recoverJobs() {
  for (const job of db.data.jobs) {
    let touched = false;
    for (const t of job.targets) {
      if (t.status === 'running') { Object.assign(t, { status: 'failed', error: 'Interrupted — OmniPost was closed during the upload.' }); touched = true; }
    }
    if (touched || job.status === 'running') finalize(job);
  }
  db.save();
}

setInterval(kick, 15000).unref();
