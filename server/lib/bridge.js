// Cookie bridge for the OmniPost Connector extension: the logins you already have in your everyday
// browser are copied into the OmniPost browser profile, so you don't have to sign in a second time.
import { acquire, release } from './browser.js';
import google from '../platforms/google.js';
import instagram from '../platforms/instagram.js';
import tiktok from '../platforms/tiktok.js';

/** Which cookies belong to which login. YouTube's session lives on both google.com and youtube.com. */
export const GROUPS = {
  google: ['google.com', 'youtube.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
};
const groupOf = (domain) => {
  const d = String(domain || '').replace(/^\./, '').toLowerCase();
  return Object.keys(GROUPS).find((g) => GROUPS[g].some((s) => d === s || d.endsWith(`.${s}`))) || null;
};

// A group is only imported when it really carries a login, so we never wipe a working session for nothing.
const SIGNED_IN = { google: google.isLoggedIn, instagram: instagram.isLoggedIn, tiktok: tiktok.isLoggedIn };

const SAME_SITE = { no_restriction: 'None', lax: 'Lax', strict: 'Strict' };

/** chrome.cookies.Cookie → Playwright cookie. Returns null for anything outside the allowed sites. */
function convert(c) {
  if (!c || typeof c.name !== 'string' || typeof c.value !== 'string' || typeof c.domain !== 'string') return null;
  if (!groupOf(c.domain) || c.name.length > 256 || c.value.length > 8192) return null;
  const path = typeof c.path === 'string' && c.path.startsWith('/') ? c.path : '/';
  const out = {
    name: c.name,
    value: c.value,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    expires: c.session || !c.expirationDate ? -1 : Math.round(Number(c.expirationDate)),
  };
  const sameSite = SAME_SITE[c.sameSite];
  if (sameSite && (sameSite !== 'None' || out.secure)) out.sameSite = sameSite;
  // Host-only cookies (incl. __Host- ones) must be set by URL, the others by domain.
  if (c.hostOnly) out.url = `https://${c.domain.replace(/^\./, '')}${path}`;
  else Object.assign(out, { domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`, path });
  return out;
}

/**
 * Replace the OmniPost browser's cookies for the given groups with the ones sent by the extension.
 * Returns { groups: [...groups that received cookies], restore() } — restore() puts the old cookies back.
 */
export async function importCookies(raw, only = Object.keys(GROUPS)) {
  if (!Array.isArray(raw) || raw.length > 5000) throw new Error('Invalid cookie list from the extension.');
  const byGroup = {};
  const signedIn = only.filter((g) => SIGNED_IN[g](raw.filter((c) => groupOf(c?.domain) === g).map((c) => ({ ...c, domain: String(c.domain) }))));
  for (const c of raw) {
    const g = groupOf(c?.domain);
    if (!g || !signedIn.includes(g)) continue;
    const pc = convert(c);
    if (pc) (byGroup[g] ||= []).push(pc);
  }
  const groups = Object.keys(byGroup);
  if (!groups.length) return { groups, restore: async () => {} };

  const ctx = await acquire();
  try {
    const old = (await ctx.cookies()).filter((c) => groups.includes(groupOf(c.domain)));
    const wipe = async (c, list = groups) => {
      for (const g of list) for (const d of GROUPS[g]) await c.clearCookies({ domain: new RegExp(`(^|\\.)${d.replace('.', '\\.')}$`) });
    };
    await wipe(ctx);
    for (const g of groups) {
      // One bad cookie must not sink the rest.
      try { await ctx.addCookies(byGroup[g]); } catch {
        for (const c of byGroup[g]) await ctx.addCookies([c]).catch(() => {});
      }
    }
    // restore(['tiktok']) puts back the previous cookies of just those groups (default: all imported ones).
    const restore = async (list = groups) => {
      const c2 = await acquire();
      try {
        await wipe(c2, list);
        const back = old.filter((c) => list.includes(groupOf(c.domain)));
        if (back.length) await c2.addCookies(back).catch(() => {});
      } finally { release(); }
    };
    return { groups, restore };
  } finally {
    release();
  }
}

/** The platforms whose login arrived with a group. */
export const PLATFORMS_FOR = { google: ['youtube'], instagram: ['instagram'], tiktok: ['tiktok'] };
