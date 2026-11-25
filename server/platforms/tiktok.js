import { waitFor } from '../lib/util.js';
import { NeedsLogin, clickIf, parseCount } from './helpers.js';

// TikTok video ids encode their creation time in the upper 32 bits.
const idToTime = (id) => { try { return Number(BigInt(id) >> 32n) * 1000; } catch { return null; } };

export default {
  id: 'tiktok',
  name: 'TikTok',
  color: '#fe2c55',
  limits: { caption: 2200 },
  loginUrl: 'https://www.tiktok.com/login',
  isLoggedIn: (cookies) => cookies.some((c) => /tiktok\.com$/.test(c.domain) && c.name === 'sessionid' && c.value),

  async profile(page) {
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    let user = await page.evaluate(() => {
      try {
        const data = JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent);
        return data.__DEFAULT_SCOPE__['webapp.app-context'].user || null;
      } catch { return null; }
    });
    if (!user?.uniqueId) {
      await page.goto('https://www.tiktok.com/profile', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForURL(/tiktok\.com\/@/, { timeout: 20000 }).catch(() => {});
      const handle = (page.url().match(/@([\w.]+)/) || [])[1];
      if (!handle) throw new Error('Signed in, but could not read your TikTok username.');
      user = { uniqueId: handle };
    }
    const avatar = Array.isArray(user.avatarUri) ? user.avatarUri[0] : user.avatarUri;
    return {
      id: user.uid || user.uniqueId,
      username: user.uniqueId,
      displayName: user.nickName || user.uniqueId,
      avatar: avatar || null,
      profileUrl: `https://www.tiktok.com/@${user.uniqueId}`,
    };
  },

  async feed(account, { withPage }) {
    return withPage(async (page) => {
      await page.goto(`https://www.tiktok.com/@${account.username}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('[data-e2e="user-post-item"]').first().waitFor({ timeout: 25000 }).catch(() => {});
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 2500);
        await page.waitForTimeout(1000);
      }
      const items = await page.evaluate(() => [...document.querySelectorAll('[data-e2e="user-post-item"]')].map((el) => {
        const a = el.querySelector('a[href*="/video/"]');
        const img = el.querySelector('img');
        return a && { href: a.href, thumb: img?.src, alt: img?.alt, views: el.querySelector('[data-e2e="video-views"]')?.textContent };
      }).filter(Boolean));
      return items.map((it) => {
        const id = (it.href.match(/video\/(\d+)/) || [])[1];
        return {
          id,
          platform: 'tiktok',
          kind: 'video',
          title: (it.alt || '').replace(/ created by .*$/i, '').slice(0, 140) || 'TikTok video',
          url: it.href,
          thumbnail: it.thumb,
          embed: `https://www.tiktok.com/embed/v2/${id}`,
          views: parseCount(it.views),
          publishedAt: idToTime(id),
          vertical: true,
        };
      }).filter((it) => it.id);
    });
  },

  /** Posts through TikTok Studio's web uploader. */
  async upload(page, post, { step, account }) {
    step('Opening TikTok Studio');
    await page.goto('https://www.tiktok.com/tiktokstudio/upload?from=webapp', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/\/login/.test(page.url())) throw new NeedsLogin('TikTok');
    const input = page.locator('input[type="file"]').first();
    await input.waitFor({ state: 'attached', timeout: 60000 });
    await input.setInputFiles(post.file);

    step('Uploading video');
    const editor = page.locator('.public-DraftEditor-content, div[contenteditable="true"]').first();
    await editor.waitFor({ timeout: 180000 });
    await page.waitForTimeout(1500);
    await editor.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Backspace');
    if (post.caption) await page.keyboard.insertText(post.caption);
    await page.keyboard.press('Escape'); // close the #hashtag / @mention suggestion popover
    await clickIf(page.getByRole('button', { name: /^got it$/i }), 1500);

    const postBtn = page.locator('button[data-e2e="post_video_button"]').first();
    await waitFor(async () => {
      const disabled = await postBtn.evaluate((b) => b.disabled || b.getAttribute('aria-disabled') === 'true' || b.dataset.disabled === 'true').catch(() => true);
      if (disabled) step('TikTok is processing the upload');
      return !disabled;
    }, { timeout: 60 * 60e3, interval: 2000, message: 'TikTok upload timed out' });

    step('Posting');
    await postBtn.click();
    await clickIf(page.getByRole('button', { name: /^post now$/i }), 6000);
    await page.waitForURL(/tiktokstudio\/content|\/manage/, { timeout: 180000 }).catch(() => {});
    return { url: `https://www.tiktok.com/@${account.username}` };
  },
};
