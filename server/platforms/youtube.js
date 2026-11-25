import { inspect } from '../lib/tools.js';
import { withCookieRetry } from '../lib/browser.js';
import { waitFor } from '../lib/util.js';
import { NeedsLogin, clickIf, setText } from './helpers.js';

export default {
  id: 'youtube',
  name: 'YouTube',
  color: '#ff0033',
  limits: { title: 100, caption: 5000 },
  loginUrl: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3D%252F',
  isLoggedIn: (cookies) => cookies.some((c) => /(^|\.)youtube\.com$/.test(c.domain) && (c.name === 'LOGIN_INFO' || c.name === 'SAPISID')),

  async profile(page) {
    await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForURL(/studio\.youtube\.com\/channel\/UC/, { timeout: 45000 }).catch(() => {});
    const m = page.url().match(/channel\/(UC[\w-]{10,})/);
    if (!m) throw new Error('You are signed in, but this Google account has no YouTube channel yet. Create one on youtube.com, then connect again.');
    const id = m[1];
    await page.goto(`https://www.youtube.com/channel/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const info = await page.evaluate(() => ({
      title: document.querySelector('meta[property="og:title"]')?.content,
      avatar: document.querySelector('meta[property="og:image"]')?.content,
      handle: (document.documentElement.innerHTML.match(/"canonicalBaseUrl":"\/(@[^"]+)"/) || [])[1],
    }));
    return {
      id,
      username: info.handle ? decodeURIComponent(info.handle) : id,
      displayName: info.title || info.handle || 'YouTube channel',
      avatar: info.avatar || null,
      profileUrl: `https://www.youtube.com/channel/${id}`,
    };
  },

  async feed(account) {
    const base = `https://www.youtube.com/channel/${account.id}`;
    const list = (url) => withCookieRetry(url, (cookies) => inspect(url, { limit: 40, cookies }));
    const [videos, shorts] = await Promise.allSettled([list(`${base}/videos`), list(`${base}/shorts`)]);
    if (videos.status === 'rejected' && shorts.status === 'rejected') throw videos.reason;
    const tabs = [videos, shorts].map((r) => (r.status === 'fulfilled' ? r.value : { entries: [] }));
    const map = (e, kind) => ({
      id: e.id,
      platform: 'youtube',
      kind,
      title: e.title,
      url: kind === 'short' ? `https://www.youtube.com/shorts/${e.id}` : `https://www.youtube.com/watch?v=${e.id}`,
      thumbnail: kind === 'short' ? `https://i.ytimg.com/vi/${e.id}/oardefault.jpg` : (e.thumbnail || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`),
      fallbackThumb: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      embed: `https://www.youtube.com/embed/${e.id}?autoplay=1&rel=0`,
      views: e.views,
      duration: e.duration,
      publishedAt: e.timestamp,
      vertical: kind === 'short',
    });
    return [...tabs[0].entries.map((e) => map(e, 'video')), ...tabs[1].entries.map((e) => map(e, 'short'))];
  },

  /** Uploads through YouTube Studio exactly like a person would. */
  async upload(page, post, { step }) {
    step('Opening YouTube Studio');
    await page.goto('https://www.youtube.com/upload', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/accounts\.google\.com/.test(page.url())) throw new NeedsLogin('YouTube');
    const input = page.locator('input[type="file"]').first();
    await input.waitFor({ state: 'attached', timeout: 60000 });
    await input.setInputFiles(post.file);

    step('Uploading video');
    const title = page.locator('#title-textarea #textbox').first();
    await title.waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    await setText(page, title, post.title);
    if (post.description) await setText(page, page.locator('#description-textarea #textbox').first(), post.description);
    await page.locator('[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').first().click();

    for (let i = 0; i < 3; i++) {
      await page.locator('#next-button').click();
      await page.waitForTimeout(1200);
    }

    step('Setting visibility');
    const visibility = { public: 'PUBLIC', unlisted: 'UNLISTED', private: 'PRIVATE' }[post.visibility] || 'PUBLIC';
    await page.locator(`tp-yt-paper-radio-button[name="${visibility}"]`).first().click();
    const url = await page.locator('span.video-url-fadeable a, ytcp-video-info a').first()
      .getAttribute('href', { timeout: 30000 }).catch(() => null);

    await waitFor(async () => {
      const label = ((await page.locator('ytcp-video-upload-progress .progress-label').first()
        .textContent({ timeout: 2000 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (/daily upload limit/i.test(label)) throw new Error('YouTube says you reached your daily upload limit.');
      if (label) step(`YouTube: ${label}`);
      return label && !/uploading/i.test(label);
    }, { timeout: 2 * 60 * 60e3, interval: 2000, message: 'YouTube upload timed out' });

    step('Publishing');
    await page.locator('#done-button').click();
    await clickIf(page.getByRole('button', { name: /publish anyway/i }), 5000);
    await page.locator('ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog').first()
      .waitFor({ timeout: 60000 }).catch(() => {});
    return { url };
  },
};
