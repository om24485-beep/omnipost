import youtube from './youtube.js';
import instagram from './instagram.js';
import tiktok from './tiktok.js';

/** Adding a platform = one file exporting { id, name, loginUrl, isLoggedIn, profile, feed, upload }. */
export const platforms = { youtube, instagram, tiktok };

export const platformMeta = () => Object.values(platforms).map(({ id, name, color, limits }) => ({ id, name, color, limits }));
