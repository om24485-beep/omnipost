// Runs on http://localhost pages. Only talks to the OmniPost app (it marks itself with <meta name="omnipost-app">).
const VERSION = chrome.runtime.getManifest().version;
const isOmniPost = () => !!document.querySelector('meta[name="omnipost-app"]');

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  const { omnipost, id, groups } = e.data;
  if (!isOmniPost()) return;
  if (omnipost === 'ping') {
    window.postMessage({ omnipost: 'pong', id, version: VERSION }, location.origin);
  } else if (omnipost === 'cookies') {
    try {
      chrome.runtime.sendMessage({ type: 'omnipost:cookies', groups }, (res) => {
        const error = chrome.runtime.lastError?.message || res?.error || null;
        window.postMessage({ omnipost: 'cookies:result', id, cookies: res?.cookies || [], error }, location.origin);
      });
    } catch (err) {
      window.postMessage({ omnipost: 'cookies:result', id, cookies: [], error: 'The OmniPost Connector was updated. Reload this page.' }, location.origin);
    }
  }
});
