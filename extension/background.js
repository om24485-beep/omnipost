// Reads this browser's cookies for the supported sites and hands them to the OmniPost page that asked.
// Nothing is sent anywhere else: the OmniPost app runs on this computer (localhost).
const GROUPS = {
  google: ['google.com', 'youtube.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'omnipost:cookies') return false;
  const origin = sender.origin || (sender.url && new URL(sender.url).origin) || '';
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    reply({ error: 'Only the OmniPost app on this computer can ask for logins.' });
    return false;
  }
  const groups = (Array.isArray(msg.groups) ? msg.groups : Object.keys(GROUPS)).filter((g) => GROUPS[g]);
  const domains = [...new Set(groups.flatMap((g) => GROUPS[g]))];
  Promise.all(domains.map((domain) => chrome.cookies.getAll({ domain })))
    .then((lists) => reply({ cookies: lists.flat() }))
    .catch((e) => reply({ error: String(e?.message || e) }));
  return true; // async reply
});
