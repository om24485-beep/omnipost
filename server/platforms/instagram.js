import { NeedsLogin, clickIf } from './helpers.js';

const APP_ID = '936619743392459'; // Instagram's public web-app id (sent by instagram.com itself)

async function igFetch(page, path) {
  return page.evaluate(async ({ path, APP_ID }) => {
    const r = await fetch(path, { credentials: 'include', headers: { 'x-ig-app-id': APP_ID, 'x-requested-with': 'XMLHttpRequest' } });
    if (!r.ok) throw new Error(`Instagram responded ${r.status}`);
    return r.json();
  }, { path, APP_ID });
}

async function openHome(page) {
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  if (/accounts\/login/.test(page.url())) throw new NeedsLogin('Instagram');
}

export default {
  id: 'instagram',
  name: 'Instagram',
  color: '#e1306c',
  limits: { caption: 2200 },
  loginUrl: 'https://www.instagram.com/accounts/login/',
  isLoggedIn: (cookies) => cookies.some((c) => /instagram\.com$/.test(c.domain) && c.name === 'sessionid' && c.value),

  async profile(page, cookies) {
    const userId = cookies.find((c) => /instagram\.com$/.test(c.domain) && c.name === 'ds_user_id')?.value;
    if (!userId) throw new Error('Could not find your Instagram user id. Please sign in again.');
    await openHome(page);
    const { user } = await igFetch(page, `/api/v1/users/${userId}/info/`);
    return {
      id: userId,
      username: user.username,
      displayName: user.full_name || user.username,
      avatar: user.hd_profile_pic_url_info?.url || user.profile_pic_url || null,
      profileUrl: `https://www.instagram.com/${user.username}/`,
    };
  },

  async feed(account, { withPage }) {
    return withPage(async (page) => {
      await openHome(page);
      const data = await igFetch(page, `/api/v1/feed/user/${account.id}/?count=33`);
      return (data.items || []).map((it) => {
        const video = it.media_type === 2 ? it : it.carousel_media?.find((c) => c.media_type === 2);
        const cover = (video || it).image_versions2?.candidates?.[0]?.url || it.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url;
        const isReel = it.product_type === 'clips';
        return {
          id: it.code,
          platform: 'instagram',
          kind: video ? (isReel ? 'reel' : 'video') : 'photo',
          title: (it.caption?.text || '').split('\n')[0].slice(0, 140) || (isReel ? 'Reel' : 'Post'),
          url: `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${it.code}/`,
          thumbnail: cover,
          videoUrl: video?.video_versions?.[0]?.url || null,
          views: it.play_count ?? it.view_count ?? null,
          likes: it.like_count ?? null,
          comments: it.comment_count ?? null,
          duration: video?.video_duration ?? null,
          publishedAt: it.taken_at ? it.taken_at * 1000 : null,
          vertical: true,
        };
      });
    });
  },

  /** Posts a Reel through instagram.com's own "Create" flow. */
  async upload(page, post, { step, account }) {
    step('Opening Instagram');
    await openHome(page);
    await clickIf(page.getByRole('button', { name: /^not now$/i }));

    step('Starting a new post');
    await page.locator('svg[aria-label="New post"], svg[aria-label="Create"]').first().click({ timeout: 20000 });
    await page.waitForTimeout(1200);
    await clickIf(page.locator('a:has(svg[aria-label="Post"]), div[role="button"]:has(svg[aria-label="Post"])'), 3000);
    const input = page.locator('div[role="dialog"] input[type="file"], form[enctype="multipart/form-data"] input[type="file"]').first();
    await input.waitFor({ state: 'attached', timeout: 20000 });
    await input.setInputFiles(post.file);

    step('Processing video');
    await clickIf(page.getByRole('button', { name: /^ok$/i }), 8000); // "Video posts are now shared as reels"
    if (await clickIf(page.locator('div[role="dialog"] svg[aria-label="Select crop"]'), 8000)) {
      await clickIf(page.getByText('Original', { exact: true }), 2500);
      await clickIf(page.locator('div[role="dialog"] svg[aria-label="Select crop"]'), 1500);
    }
    const dialog = page.locator('div[role="dialog"]');
    for (let i = 0; i < 2; i++) {
      await dialog.getByRole('button', { name: /^next$/i }).first().click({ timeout: 90000 });
      await page.waitForTimeout(1800);
    }

    step('Writing caption');
    const caption = page.locator('div[role="dialog"] div[aria-label^="Write a caption"], div[role="dialog"] div[contenteditable="true"][role="textbox"]').first();
    await caption.waitFor({ timeout: 30000 });
    if (post.caption) {
      await caption.click();
      await page.keyboard.insertText(post.caption);
    }

    step('Sharing');
    await dialog.getByRole('button', { name: /^share$/i }).first().click({ timeout: 30000 });
    step('Instagram is processing your reel');
    await page.getByText(/(reel|post) (has been|was) shared/i).first().waitFor({ timeout: 30 * 60e3 });
    return { url: `https://www.instagram.com/${account.username}/reels/` };
  },
};
