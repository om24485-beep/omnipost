// "Sign in with Google" without an OAuth client: the user signs in inside the OmniPost browser window,
// then we read their name / email / photo from their own Google Account page.
export default {
  id: 'google',
  name: 'Google',
  loginUrl: 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F',
  isLoggedIn: (cookies) => cookies.some((c) => /(^|\.)google\.com$/.test(c.domain) && (c.name === 'SAPISID' || c.name === '__Secure-3PSID')),

  async profile(page) {
    await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const link = document.querySelector('a[aria-label^="Google Account"]');
      const label = link?.getAttribute('aria-label') || '';
      const email = (label.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || document.body.innerText.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0];
      const name = label.replace(/^Google Account:\s*/i, '').replace(/\(.*\)/s, '').trim();
      return { email, name, avatar: link?.querySelector('img')?.src || null };
    });
    if (!info.email) throw new Error('Signed in, but could not read your Google account email. Please try again.');
    return { email: info.email, name: info.name || info.email.split('@')[0], avatar: info.avatar };
  },
};
