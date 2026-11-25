#!/usr/bin/env node
// OmniPost CLI — drive the running app from a terminal, scripts, cron or AI agents.
// Every command supports --json for machine-readable output.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../server/lib/paths.js';

const BASE = process.env.OMNIPOST_URL || `http://127.0.0.1:${process.env.PORT || 5170}`;
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
  } else pos.push(a);
}
const JSON_OUT = !!flags.json;
const out = (human, data) => console.log(JSON_OUT ? JSON.stringify(data, null, 2) : human);
const progress = (msg) => { if (!JSON_OUT) process.stderr.write(`\r\x1b[2K${msg}`); };

function token() {
  try { return fs.readFileSync(path.join(DATA_DIR, 'cli-token'), 'utf8').trim(); } catch { return ''; }
}

async function api(method, p, body, form) {
  let r;
  try {
    r = await fetch(BASE + p, {
      method,
      headers: { 'x-omnipost-token': token(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error('OmniPost is not running. Start it with `npm start` first.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitTask(id) {
  for (;;) {
    const t = await api('GET', `/api/tasks/${id}`);
    progress(`${t.message || t.status} ${t.percent ? `${Math.round(t.percent)}%` : ''}`);
    if (t.status === 'done') { progress(''); return t; }
    if (t.status === 'error') { progress(''); throw new Error(t.error); }
    await sleep(1000);
  }
}
async function waitJob(id) {
  for (;;) {
    const jobs = await api('GET', '/api/jobs');
    const j = jobs.find((x) => x.id === id);
    progress(j.targets.map((t) => `${t.platform}: ${t.status}${t.step ? ` (${t.step})` : ''}`).join(' | '));
    if (!['queued', 'running'].includes(j.status)) { progress(''); return j; }
    await sleep(2000);
  }
}

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const ALIASES = { yt: 'youtube', ig: 'instagram', tt: 'tiktok' };
const platformsFlag = () => list(flags.to).map((p) => ALIASES[p] || p);

async function uploadFile(file) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(file));
  return api('POST', '/api/media/upload', null, form);
}

async function createPost(mediaId, extra = {}) {
  const job = await api('POST', '/api/jobs', {
    mediaId,
    platforms: platformsFlag(),
    title: flags.title,
    caption: flags.caption ?? extra.caption,
    tags: list(flags.tags),
    visibility: flags.visibility,
    scheduledAt: flags.at,
  });
  const final = flags.wait ? await waitJob(job.id) : job;
  out(`Post ${final.id}: ${final.status}\n${final.targets.map((t) => `  ${t.platform.padEnd(10)} ${t.status}${t.url ? `  ${t.url}` : ''}${t.error ? `  ${t.error}` : ''}`).join('\n')}`, final);
}

const commands = {
  async status() {
    const [b, sys] = await Promise.all([api('GET', '/api/bootstrap'), api('GET', '/api/system')]);
    out([
      `Signed in as: ${b.user?.email || '(nobody yet)'}`,
      `Accounts:     ${Object.values(b.accounts).map((a) => `${a.platform}=@${a.username}${a.needsReconnect ? ' (reconnect!)' : ''}`).join(', ') || 'none'}`,
      `Library:      ${b.media.length} videos`,
      `Posts:        ${b.jobs.length}`,
      `yt-dlp:       ${sys.ytdlp || 'not installed'}   browser: ${sys.browser.executable || 'NOT FOUND'}`,
    ].join('\n'), { ...b, system: sys });
  },
  async accounts() {
    const b = await api('GET', '/api/bootstrap');
    out(Object.values(b.accounts).map((a) => `${a.platform.padEnd(10)} @${a.username}  ${a.displayName}`).join('\n') || 'No accounts connected.', b.accounts);
  },
  async connect() {
    const p = ALIASES[pos[1]] || pos[1];
    const { taskId } = await api('POST', `/api/accounts/${p}/connect`);
    progress('Sign in inside the browser window that opened…');
    await waitTask(taskId);
    out(`Connected ${p}.`, { ok: true });
  },
  async feed() {
    if (flags.refresh) { await api('POST', '/api/feed/sync', pos[1] ? { platform: ALIASES[pos[1]] || pos[1] } : {}); await sleep(4000); }
    const { feeds } = await api('GET', '/api/feed');
    const items = Object.values(feeds).flatMap((f) => f.items).filter((i) => !pos[1] || i.platform === (ALIASES[pos[1]] || pos[1]));
    out(items.map((i) => `${i.platform.padEnd(10)} ${String(i.views ?? '-').padStart(9)} views  ${i.title.slice(0, 60)}  ${i.url}`).join('\n') || 'Feed is empty.', items);
  },
  async inspect() {
    const info = await api('POST', '/api/inspect', { url: pos[1] });
    if (info.kind === 'collection') out(`${info.title} — ${info.entries.length} videos\n${info.entries.map((e) => `  ${e.title.slice(0, 70)}  ${e.url}`).join('\n')}`, info);
    else out(`${info.title}\nby ${info.uploader} · ${info.platform} · ${Math.round(info.duration || 0)}s · ${info.views ?? '?'} views\n${info.url}`, info);
  },
  async import() {
    const info = await api('POST', '/api/inspect', { url: pos[1] });
    const { taskId } = await api('POST', '/api/media/import', { url: info.url || pos[1], info });
    const t = await waitTask(taskId);
    out(`Imported → media id ${t.mediaId}`, t);
    return { task: t, info };
  },
  async post() {
    const target = pos[1];
    const mediaId = fs.existsSync(target) ? (await uploadFile(target)).id : target;
    await createPost(mediaId);
  },
  async repost() {
    const info = await api('POST', '/api/inspect', { url: pos[1] });
    const { taskId } = await api('POST', '/api/media/import', { url: info.url || pos[1], info });
    const t = await waitTask(taskId);
    const credit = info.uploader ? `\n\nCredit: ${info.uploader} — ${info.url}` : '';
    await createPost(t.mediaId, { caption: `${info.title}${credit}` });
  },
  async library() {
    const b = await api('GET', '/api/bootstrap');
    out(b.media.map((m) => `${m.id}  ${String(Math.round(m.duration || 0)).padStart(5)}s  ${m.width}x${m.height}  ${m.name}`).join('\n') || 'Library is empty.', b.media);
  },
  async jobs() {
    const jobs = await api('GET', '/api/jobs');
    out(jobs.map((j) => `${j.id}  ${j.status.padEnd(8)} ${j.targets.map((t) => `${t.platform}:${t.status}`).join(' ')}  ${(j.title || j.caption || '').slice(0, 40)}`).join('\n') || 'No posts yet.', jobs);
  },
  help() {
    console.log(`OmniPost CLI   (app must be running: npm start)

  status                          Who is signed in, accounts, tools
  accounts                        List connected accounts
  connect <youtube|instagram|tiktok>
  feed [platform] [--refresh]     All your videos in one list
  inspect <url>                   Metadata for any video / channel / profile URL
  import <url>                    Download a video into the library
  post <file|mediaId> --to yt,ig,tt [--title T] [--caption C] [--tags a,b] [--visibility public|unlisted|private] [--at ISO] [--wait]
  repost <url> --to yt,ig,tt [same options]     Import + post with credit
  library                         List library videos
  jobs                            List posts and their per-platform status

  Add --json to any command for machine-readable output.`);
  },
};

const cmd = commands[pos[0]] || commands.help;
Promise.resolve(cmd()).catch((e) => {
  progress('');
  if (JSON_OUT) console.log(JSON.stringify({ error: e.message }));
  else console.error(`✖ ${e.message}`);
  process.exit(1);
});
