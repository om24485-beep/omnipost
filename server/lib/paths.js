import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.resolve(process.env.OMNIPOST_DATA || path.join(ROOT, 'data'));
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
export const BIN_DIR = path.join(DATA_DIR, 'bin');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const DEBUG_DIR = path.join(DATA_DIR, 'debug');
export const PROFILE_DIR = path.join(DATA_DIR, 'browser-profile');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');

for (const dir of [MEDIA_DIR, THUMB_DIR, BIN_DIR, TMP_DIR, DEBUG_DIR, PROFILE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
