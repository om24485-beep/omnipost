export class NeedsLogin extends Error {
  constructor(platform) {
    super(`Your ${platform} session has expired. Reconnect it on the Accounts page.`);
    this.code = 'NEEDS_LOGIN';
  }
}

const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

/** Replace the text of an input or contenteditable box the way a person would. */
export async function setText(page, locator, text) {
  await locator.click();
  await page.keyboard.press(SELECT_ALL);
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.insertText(text);
}

export async function clickIf(locator, timeout = 2500) {
  try {
    await locator.first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

export function parseCount(text) {
  if (text == null) return null;
  const m = String(text).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]?.toUpperCase()] || 1));
}
