import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import express from 'express';
import multer from 'multer';
import { db } from './lib/db.js';
import { DATA_DIR, DEBUG_DIR, MEDIA_DIR, THUMB_DIR, WEB_DIST } from './lib/paths.js';
import { bus, emit, createTask, updateTask, getTask, listTasks } from './lib/events.js';
import { inspect, download, ytdlpVersion, updateYtDlp, autoUpdateYtDlp, ytdlp, FFMPEG } from './lib/tools.js';
import { addMedia, ensureCompatible, findMedia, makeVertical, removeMedia } from './lib/media.js';
import { browserState, closeBrowser, findBrowser, withCookieRetry } from './lib/browser.js';
import { createJob, retryJob, cancelJob, recoverJobs, kick } from './lib/jobs.js';
import { connectPlatform, disconnectPlatform, runLoginFlow, syncFeed, syncingPlatforms } from './lib/accounts.js';
import { acceptGoogleUser, currentUser, endSession, issueSession, requireAuth, verifyGoogleIdToken } from './lib/auth.js';
import { isHttpUrl, safeName, uid } from './lib/util.js';
import { platforms, platformMeta } from './platforms/index.js';
import google from './platforms/google.js';

const PORT = Number(process.env.PORT) || 5170;
const DEV = process.argv.includes('--dev');
const app = express();
app.disable('x-powered-by');

// Local-only app: refuse requests whose Host isn't loopback (blocks DNS-rebinding attacks).
app.use((req, res, next) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return res.status(403).send('Forbidden host');
  next();
});
app.use(express.json({ limit: '2mb' }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (!res.headersSent) res.status(e.status || 400).json({ error: e.message || String(e) });
});

// ------------------------------------------------------------------ public: auth
app.get('/api/me', (req, res) => res.json({
  user: currentUser(req),
  hasOwner: !!db.data.owner,
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  browserFound: !!findBrowser(),
}));

const flows = new Map();
app.post('/api/auth/google/start', (req, res) => {
  const flow = { id: uid(24), status: 'waiting', message: 'Opening a secure Google sign-in window…', createdAt: Date.now() };
  flows.set(flow.id, flow);
  res.json({ flowId: flow.id });
  runLoginFlow(google, { onStatus: (m) => { flow.message = m; } })
    .then((profile) => {
      const err = acceptGoogleUser(profile);
      if (err) Object.assign(flow, { status: 'error', error: err });
      else {
        Object.assign(flow, { status: 'done' });
        // The same Google session usually signs YouTube in too — connect it quietly.
        if (!db.data.accounts.youtube) connectPlatform('youtube', { silent: true });
      }
    })
    .catch((e) => Object.assign(flow, { status: 'error', error: e.message }));
});

app.get('/api/auth/google/flow/:id', (req, res) => {
  const flow = flows.get(req.params.id);
  if (!flow) return res.status(404).json({ error: 'Sign-in expired. Try again.' });
  if (flow.status === 'done' && !flow.consumed) {
    flow.consumed = true;
    issueSession(res);
  }
  if (flow.status !== 'waiting') setTimeout(() => flows.delete(flow.id), 60e3);
  res.json({ status: flow.status, message: flow.message, error: flow.error || null });
});

app.post('/api/auth/google/idtoken', wrap(async (req, res) => {
  const profile = await verifyGoogleIdToken(req.body?.credential);
  const err = acceptGoogleUser(profile);
  if (err) return res.status(403).json({ error: err });
  issueSession(res);
  res.json({ user: db.data.owner });
}));

app.post('/api/auth/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });

// ------------------------------------------------------------------ everything below needs a session
app.use('/api', requireAuth);
app.use('/files', requireAuth);
app.use('/files/media', express.static(MEDIA_DIR, { maxAge: '1h' }));
app.use('/files/thumbs', express.static(THUMB_DIR, { maxAge: '7d' }));
app.use('/files/debug', express.static(DEBUG_DIR));

app.get('/api/bootstrap', (req, res) => res.json({
  user: db.data.owner,
  platforms: platformMeta(),
  accounts: db.data.accounts,
  media: db.data.media,
  jobs: db.data.jobs.slice(0, 200),
  settings: db.data.settings,
  tasks: listTasks(),
}));

app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n');
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  bus.on('event', send);
  req.on('close', () => { clearInterval(ping); bus.off('event', send); });
});

// ------------------------------------------------------------------ accounts & feed
app.post('/api/accounts/:pid/connect', wrap(async (req, res) => {
  if (!platforms[req.params.pid]) throw new Error('Unknown platform');
  res.json({ taskId: connectPlatform(req.params.pid).id });
}));

app.delete('/api/accounts/:pid', wrap(async (req, res) => {
  await disconnectPlatform(req.params.pid, { signOut: req.query.signout === '1' });
  res.json({ ok: true });
}));

app.get('/api/feed', (req, res) => res.json({ feeds: db.data.feeds, syncing: syncingPlatforms() }));

app.post('/api/feed/sync', (req, res) => {
  const list = req.body?.platform ? [req.body.platform] : Object.keys(db.data.accounts);
  for (const p of list) syncFeed(p).catch(() => {});
  res.json({ ok: true });
});

// ------------------------------------------------------------------ tasks
app.get('/api/tasks/:id', (req, res) => {
  const t = getTask(req.params.id);
  return t ? res.json(t) : res.status(404).json({ error: 'Task not found' });
});
app.post('/api/tasks/:id/cancel', (req, res) => {
  const t = getTask(req.params.id);
  if (t) t.canceled = true;
  res.json({ ok: true });
});

// ------------------------------------------------------------------ repost engine (yt-dlp)
app.post('/api/inspect', wrap(async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!isHttpUrl(url)) throw new Error('Paste a full link that starts with http(s)://');
  res.json(await withCookieRetry(url, (cookies) => inspect(url, { cookies })));
}));

const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

app.post('/api/media/import', wrap(async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!isHttpUrl(url)) throw new Error('Invalid link');
  const info = req.body?.info || {};
  const task = createTask('import', { url, title: clip(info.title, 200), thumbnail: clip(info.thumbnail, 2000) });
  res.json({ taskId: task.id });
  try {
    updateTask(task, { message: 'Starting download…' });
    const file = await withCookieRetry(url, (cookies) => download(url, {
      cookies,
      onProgress: (pct, speed, eta) => updateTask(task, { percent: pct * 0.9, message: `Downloading${speed ? ` · ${speed}` : ''}${eta ? ` · ${eta} left` : ''}` }),
    }));
    updateTask(task, { percent: 90, message: 'Adding to your library…' });
    const m = await addMedia(file, {
      name: `${clip(info.title, 120) || path.basename(file)}.mp4`,
      source: {
        type: 'import',
        url,
        title: clip(info.title, 300),
        uploader: clip(info.uploader, 120),
        uploaderUrl: clip(info.uploaderUrl, 500),
        platform: clip(info.platform, 40),
        description: clip(info.description, 3000),
      },
    });
    await ensureCompatible(m, (pct) => updateTask(task, { percent: 90 + pct * 0.1, message: 'Optimizing for every platform…' }));
    updateTask(task, { status: 'done', percent: 100, message: 'Ready', mediaId: m.id });
  } catch (e) {
    updateTask(task, { status: 'error', error: e.message });
  }
}));

// ------------------------------------------------------------------ media library
const upload = multer({
  storage: multer.diskStorage({
    destination: MEDIA_DIR,
    filename: (req, file, cb) => cb(null, `${uid(8)}-${safeName(Buffer.from(file.originalname, 'latin1').toString('utf8'))}`),
  }),
  limits: { fileSize: 8 * 1024 ** 3 },
  fileFilter: (req, file, cb) => cb(null, /^video\//.test(file.mimetype) || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.originalname)),
});

app.post('/api/media/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new Error('Choose a video file (mp4, mov, webm, mkv…).');
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json(await addMedia(req.file.path, { name, source: { type: 'upload' } }));
}));

app.post('/api/media/:id/vertical', wrap(async (req, res) => {
  const m = findMedia(req.params.id);
  if (!m) throw new Error('Video not found');
  const task = createTask('vertical', { mediaId: m.id, title: m.name });
  res.json({ taskId: task.id });
  makeVertical(m, (pct) => updateTask(task, { percent: pct, message: 'Reframing to 9:16…' }))
    .then((v) => updateTask(task, { status: 'done', percent: 100, mediaId: v.id, message: 'Ready' }))
    .catch((e) => updateTask(task, { status: 'error', error: e.message }));
}));

app.delete('/api/media/:id', (req, res) => res.json({ ok: removeMedia(req.params.id) }));

// ------------------------------------------------------------------ posting
app.get('/api/jobs', (req, res) => res.json(db.data.jobs.slice(0, 200)));
app.post('/api/jobs', wrap(async (req, res) => res.json(createJob(req.body || {}))));

const jobOr404 = (req) => {
  const job = db.data.jobs.find((j) => j.id === req.params.id);
  if (!job) throw Object.assign(new Error('Post not found'), { status: 404 });
  return job;
};
app.post('/api/jobs/:id/retry', wrap(async (req, res) => { const j = jobOr404(req); retryJob(j, req.body?.platform); res.json(j); }));
app.post('/api/jobs/:id/cancel', wrap(async (req, res) => { const j = jobOr404(req); cancelJob(j); res.json(j); }));
app.delete('/api/jobs/:id', wrap(async (req, res) => {
  const j = jobOr404(req);
  if (j.status === 'running') throw new Error('This post is uploading right now.');
  db.data.jobs = db.data.jobs.filter((x) => x !== j);
  db.save();
  emit('job:removed', { id: j.id });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ settings & system
app.patch('/api/settings', (req, res) => {
  const { showBrowser, autoCredit } = req.body || {};
  if (typeof showBrowser === 'boolean') db.data.settings.showBrowser = showBrowser;
  if (typeof autoCredit === 'boolean') db.data.settings.autoCredit = autoCredit;
  db.save();
  emit('settings', db.data.settings);
  res.json(db.data.settings);
});

app.get('/api/system', wrap(async (req, res) => res.json({
  browser: browserState(),
  ytdlp: await ytdlpVersion(),
  ffmpeg: !!FFMPEG && fs.existsSync(FFMPEG),
  dataDir: DATA_DIR,
})));

app.post('/api/system/update-ytdlp', wrap(async (req, res) => res.json({ ytdlp: await updateYtDlp() })));

// Thumbnails / video from Instagram & TikTok CDNs refuse cross-site embedding, so stream them through us.
const PROXY_HOSTS = [/\.cdninstagram\.com$/, /\.fbcdn\.net$/, /\.tiktokcdn(-[a-z]+)?\.com$/, /\.ibyteimg\.com$/, /\.byteimg\.com$/,
  /\.ytimg\.com$/, /\.ggpht\.com$/, /\.googleusercontent\.com$/, /\.tiktokv\.com$/, /\.muscdn\.com$/];
app.get('/api/proxy', wrap(async (req, res) => {
  const u = new URL(String(req.query.u || ''));
  if (u.protocol !== 'https:' || !PROXY_HOSTS.some((r) => r.test(`.${u.hostname}`))) return res.status(403).end();
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  const r = await fetch(u, { headers: req.headers.range ? { range: req.headers.range } : {}, signal: ctrl.signal });
  res.status(r.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = r.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('cache-control', 'private, max-age=86400');
  if (!r.body) return res.end();
  Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}));

// ------------------------------------------------------------------ web app
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|files).*/, (req, res) => res.sendFile(path.join(WEB_DIST, 'index.html'), { headers: { 'cache-control': 'no-cache' } }));
} else {
  app.get('/', (req, res) => res.send('Web UI not built yet. Run <code>npm run build</code> (or <code>npm run dev</code>).'));
}

// ------------------------------------------------------------------ start
recoverJobs();
app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${DEV ? 5173 : PORT}`;
  console.log(`\n  OmniPost is running → ${url}\n  CLI: npm run cli -- help\n`);
  if (!DEV && !process.env.NO_OPEN) {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
  ytdlp().then(autoUpdateYtDlp).catch((e) => console.warn('[omnipost] yt-dlp unavailable:', e.message));
  kick();
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    db.flush();
    await closeBrowser().catch(() => {});
    process.exit(0);
  });
}
