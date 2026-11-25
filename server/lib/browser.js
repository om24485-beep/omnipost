// One real Chrome / Edge / Brave with its own OmniPost profile, controlled over CDP.
// The user signs in to Google, YouTube, Instagram and TikTok themselves in this normal window — no API keys.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { PROFILE_DIR, TMP_DIR } from './paths.js';
import { Mutex, sleep, uid } from './util.js';

const S = { proc: null, browser: null, context: null, headless: false, active: 0, lastUsed: Date.now() };
const lock = new Mutex();
const PORT_FILE = path.join(PROFILE_DIR, 'DevToolsActivePort');

export function findBrowser() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  const c = [];
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) {
      c.push(path.join(r, 'Google/Chrome/Application/chrome.exe'),
        path.join(r, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(r, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(r, 'Chromium/Application/chrome.exe'));
    }
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    c.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/snap/bin/chromium', '/usr/bin/microsoft-edge', '/usr/bin/brave-browser');
  }
  return c.find((p) => fs.existsSync(p)) || null;
}

function reset() {
  S.proc = null;
  S.browser = null;
  S.context = null;
}

function adopt(browser, proc, headless) {
  browser.on('disconnected', () => { if (S.browser === browser) reset(); });
  Object.assign(S, { proc, browser, context: browser.contexts()[0], headless });
}

/** A browser from a previous run may still be open on our profile — reuse it instead of fighting the profile lock. */
async function tryReuseExisting() {
  try {
    const port = fs.readFileSync(PORT_FILE, 'utf8').split('\n')[0].trim();
    if (!port) return false;
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 3000 });
    const { userAgent } = await (await browser.newBrowserCDPSession()).send('Browser.getVersion');
    adopt(browser, null, /Headless/i.test(userAgent));
    return true;
  } catch {
    return false;
  }
}

async function launch(headless) {
  if (await tryReuseExisting()) {
    if (headless || !S.headless) return;
    await closeBrowser();
  }
  const exe = findBrowser();
  if (!exe) throw new Error('No Chromium-based browser found. Install Google Chrome, Microsoft Edge or Brave (or set BROWSER_PATH).');
  fs.rmSync(PORT_FILE, { force: true });
  const args = [`--user-data-dir=${PROFILE_DIR}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--lang=en-US', '--hide-crash-restore-bubble', '--window-size=1280,900'];
  if (headless) args.push('--headless=new');
  args.push('about:blank');
  const proc = spawn(exe, args, { stdio: 'ignore', windowsHide: headless });
  let exited = false;
  proc.on('exit', () => { exited = true; if (S.proc === proc) reset(); });
  let port = '';
  const deadline = Date.now() + 25000;
  while (!port && Date.now() < deadline) {
    try { port = fs.readFileSync(PORT_FILE, 'utf8').split('\n')[0].trim(); } catch { /* not yet */ }
    if (!port && exited) throw new Error('The browser closed right after starting. Close any window using the OmniPost profile and try again.');
    if (!port) await sleep(150);
  }
  if (!port) { proc.kill(); throw new Error('Timed out waiting for the browser to start.'); }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  adopt(browser, proc, headless);
}

export async function closeBrowser() {
  const { browser, proc } = S;
  reset();
  if (browser) {
    try { await (await browser.newBrowserCDPSession()).send('Browser.close'); } catch { /* already gone */ }
    try { await browser.close(); } catch { /* ignore */ }
  }
  if (proc && proc.exitCode === null) {
    await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(5000)]);
    try { proc.kill(); } catch { /* ignore */ }
  }
}

/** Get the shared browser context. headed:true guarantees a visible window. Always pair with release(). */
export function acquire({ headed = false } = {}) {
  return lock.run(async () => {
    if (S.browser?.isConnected()) {
      if (headed && S.headless) {
        while (S.active > 0) await sleep(300);
        await closeBrowser();
        await launch(false);
      }
    } else {
      await launch(!headed);
    }
    S.active++;
    S.lastUsed = Date.now();
    return S.context;
  });
}

export function release() {
  S.active = Math.max(0, S.active - 1);
  S.lastUsed = Date.now();
}

export const isRunning = () => !!S.browser?.isConnected();
export const browserState = () => ({ running: isRunning(), headless: S.headless, executable: findBrowser() });

export async function withPage(fn, { headed = false } = {}) {
  const ctx = await acquire({ headed });
  const page = await ctx.newPage();
  try {
    if (headed) await page.bringToFront().catch(() => {});
    return await fn(page, ctx);
  } finally {
    await page.close().catch(() => {});
    release();
  }
}

export async function getCookies() {
  const ctx = await acquire();
  try { return await ctx.cookies(); } finally { release(); }
}

export async function clearCookies(domain) {
  const ctx = await acquire();
  try { await ctx.clearCookies({ domain }); } finally { release(); }
}

/** Write the browser's cookies for one site into a Netscape cookie file for yt-dlp. Returns the path or null. */
export async function cookieFileFor(url) {
  const site = new URL(url).hostname.split('.').slice(-2).join('.');
  const cookies = (await getCookies()).filter((c) => c.domain.replace(/^\./, '').endsWith(site));
  if (!cookies.length) return null;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    lines.push([c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE',
      c.expires > 0 ? Math.round(c.expires) : 0, c.name, c.value].join('\t'));
  }
  const file = path.join(TMP_DIR, `cookies-${uid(8)}.txt`);
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  return file;
}

/** Try anonymously first; if the site wants a login, retry once with the OmniPost browser's cookies for that site. */
export async function withCookieRetry(url, fn) {
  try {
    return await fn(null);
  } catch (err) {
    let file = null;
    try { file = await cookieFileFor(url); } catch { /* no browser available */ }
    if (!file) throw err;
    try { return await fn(file); } finally { fs.rmSync(file, { force: true }); }
  }
}

// Close an idle browser after 15 minutes.
setInterval(() => {
  if (S.browser && S.active === 0 && Date.now() - S.lastUsed > 15 * 60e3) closeBrowser().catch(() => {});
}, 60e3).unref();
