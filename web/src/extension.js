// Talks to the optional "OmniPost Connector" browser extension (see /extension).
let seq = 0;

function call(message, timeout) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${++seq}`;
    const done = (fn, v) => { clearTimeout(t); window.removeEventListener('message', onMsg); fn(v); };
    const onMsg = (e) => {
      if (e.source !== window || e.data?.id !== id || e.data.omnipost === message.omnipost) return;
      done(resolve, e.data);
    };
    const t = setTimeout(() => done(reject, new Error('The OmniPost Connector extension did not answer.')), timeout);
    window.addEventListener('message', onMsg);
    window.postMessage({ ...message, id }, location.origin);
  });
}

/** Resolves to the extension version, or null when it isn't installed in this browser. */
export const detectExtension = () => call({ omnipost: 'ping' }, 700).then((r) => r.version).catch(() => null);

/** Cookies for the given login groups ('google' | 'instagram' | 'tiktok') from this browser. */
export async function browserCookies(groups) {
  const r = await call({ omnipost: 'cookies', groups }, 10000);
  if (r.error) throw new Error(r.error);
  return r.cookies;
}

export const GROUP_OF = { youtube: 'google', instagram: 'instagram', tiktok: 'tiktok' };

import { useEffect, useState } from 'react';

/** undefined while checking, then the extension version or null. Re-checks when the tab regains focus. */
export function useExtension() {
  const [version, setVersion] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const check = () => detectExtension().then((v) => alive && setVersion(v));
    check();
    window.addEventListener('focus', check);
    return () => { alive = false; window.removeEventListener('focus', check); };
  }, []);
  return version;
}
