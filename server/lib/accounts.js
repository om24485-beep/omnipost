// Connecting accounts (user signs in inside the OmniPost browser window) and syncing their video feeds.
import { acquire, release, isRunning, withPage, clearCookies } from './browser.js';
import { db } from './db.js';
import { emit, createTask, updateTask } from './events.js';
import { sleep } from './util.js';
import { platforms } from '../platforms/index.js';

/**
 * Opens the platform's sign-in page in a visible browser window and waits until the session cookie appears.
 * Never types credentials: the user signs in themselves. Then reads the public profile of the signed-in account.
 */
export async function runLoginFlow(def, { onStatus = () => {}, isCanceled = () => false, timeout = 10 * 60e3 } = {}) {
  onStatus('Opening a secure sign-in window…');
  const ctx = await acquire({ headed: true });
  let loginPage = null;
  try {
    let cookies = await ctx.cookies();
    if (!def.isLoggedIn(cookies)) {
      loginPage = await ctx.newPage();
      await loginPage.goto(def.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await loginPage.bringToFront().catch(() => {});
      onStatus(`Sign in to ${def.name} in the browser window that just opened`);
      const deadline = Date.now() + timeout;
      for (;;) {
        await sleep(1500);
        if (isCanceled()) throw new Error('Canceled');
        if (!isRunning() || loginPage.isClosed()) throw new Error('The sign-in window was closed before you finished.');
        cookies = await ctx.cookies();
        if (def.isLoggedIn(cookies)) break;
        if (Date.now() > deadline) throw new Error('Sign-in timed out. Please try again.');
      }
    }
    onStatus('Signed in — reading your profile…');
    const page = await ctx.newPage();
    try {
      return await def.profile(page, cookies);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await loginPage?.close().catch(() => {});
    release();
  }
}

const publishAccounts = () => { db.save(); emit('accounts', db.data.accounts); };

export function connectPlatform(pid, { silent = false } = {}) {
  const def = platforms[pid];
  const task = createTask('connect', { platform: pid, silent, status: 'waiting' });
  (async () => {
    try {
      const profile = await runLoginFlow(def, {
        onStatus: (message) => updateTask(task, { message }),
        isCanceled: () => task.canceled,
        timeout: silent ? 30000 : 10 * 60e3,
      });
      db.data.accounts[pid] = { ...profile, platform: pid, connectedAt: Date.now(), needsReconnect: false };
      publishAccounts();
      updateTask(task, { status: 'done', message: 'Connected' });
      syncFeed(pid).catch(() => {});
    } catch (e) {
      updateTask(task, { status: 'error', error: e.message });
    }
  })();
  return task;
}

export async function disconnectPlatform(pid, { signOut = false } = {}) {
  delete db.data.accounts[pid];
  delete db.data.feeds[pid];
  publishAccounts();
  emit('feed', { platform: pid });
  if (signOut) {
    const domain = { youtube: /youtube\.com$/, instagram: /instagram\.com$/, tiktok: /tiktok\.com$/ }[pid];
    if (domain) await clearCookies(domain).catch(() => {});
  }
}

const syncing = new Set();
export const syncingPlatforms = () => [...syncing];

export async function syncFeed(pid) {
  const account = db.data.accounts[pid];
  if (!account || syncing.has(pid)) return;
  syncing.add(pid);
  emit('feed', { platform: pid, syncing: true });
  try {
    const items = await platforms[pid].feed(account, { withPage });
    db.data.feeds[pid] = { items, syncedAt: Date.now(), error: null };
    if (account.needsReconnect) { account.needsReconnect = false; publishAccounts(); }
  } catch (e) {
    db.data.feeds[pid] = { items: db.data.feeds[pid]?.items || [], syncedAt: Date.now(), error: e.message };
    if (e.code === 'NEEDS_LOGIN') { account.needsReconnect = true; publishAccounts(); }
  } finally {
    syncing.delete(pid);
    db.save();
    emit('feed', { platform: pid, syncing: false });
  }
}
