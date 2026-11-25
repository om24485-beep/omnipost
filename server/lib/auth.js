// App sign-in. The first Google account that signs in becomes the workspace owner.
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { DATA_DIR } from './paths.js';
import { uid } from './util.js';

const COOKIE = 'omnipost_session';
const TTL = 30 * 24 * 3600e3;
const TOKEN_FILE = path.join(DATA_DIR, 'cli-token');

/** Local token so the CLI (and AI agents) can drive OmniPost without a browser session. */
export const CLI_TOKEN = (() => {
  try {
    const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    if (t.length >= 32) return t;
  } catch { /* create */ }
  const t = uid(40);
  fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
  return t;
})();

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  const s = token && db.data.sessions[token];
  if (s && s.exp > Date.now()) return db.data.owner;
  return null;
}

export function requireAuth(req, res, next) {
  if (req.get('x-omnipost-token') === CLI_TOKEN || currentUser(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

export function issueSession(res) {
  const token = uid(40);
  const now = Date.now();
  for (const [k, s] of Object.entries(db.data.sessions)) if (s.exp < now) delete db.data.sessions[k];
  db.data.sessions[token] = { exp: now + TTL };
  db.save();
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
}

export function endSession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) { delete db.data.sessions[token]; db.save(); }
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

const mask = (email) => email.replace(/^(.).*?(.)@/, '$1•••$2@');

/** Returns null when accepted, or an error message. */
export function acceptGoogleUser(profile) {
  const owner = db.data.owner;
  if (!owner) {
    db.data.owner = { ...profile, createdAt: Date.now() };
  } else if (owner.email.toLowerCase() === profile.email.toLowerCase()) {
    Object.assign(owner, { name: profile.name || owner.name, avatar: profile.avatar || owner.avatar });
  } else {
    return `This OmniPost workspace belongs to ${mask(owner.email)}. Sign in with that Google account.`;
  }
  db.save();
  return null;
}

/** Optional official "Sign in with Google" button (needs a free GOOGLE_CLIENT_ID; no secret). */
export async function verifyGoogleIdToken(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured.');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', body: new URLSearchParams({ id_token: String(credential) }) });
  const t = await r.json();
  if (!r.ok || t.aud !== clientId || String(t.email_verified) !== 'true' || !t.email) throw new Error('Google sign-in could not be verified.');
  return { email: t.email, name: t.name || t.email.split('@')[0], avatar: t.picture || null };
}
