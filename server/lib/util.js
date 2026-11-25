import crypto from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = (n = 12) => crypto.randomBytes(n).toString('base64url').slice(0, n);

/** Serialises async work: run(fn) waits for every earlier run() to settle. */
export class Mutex {
  #tail = Promise.resolve();
  run(fn) {
    const result = this.#tail.then(() => fn());
    this.#tail = result.catch(() => {});
    return result;
  }
}

/** Poll fn until it returns a truthy value. Errors thrown by fn propagate. */
export async function waitFor(fn, { timeout = 30000, interval = 1000, message = 'Timed out' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(message);
    await sleep(interval);
  }
}

export function safeName(name, max = 80) {
  const ext = (name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0];
  const base = name.slice(0, name.length - ext.length).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'video';
  return base.slice(0, max) + ext.toLowerCase();
}

export function isHttpUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
