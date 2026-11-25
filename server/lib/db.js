import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_SETTINGS = { showBrowser: true, autoCredit: true };
const fresh = () => ({ owner: null, sessions: {}, accounts: {}, media: [], jobs: [], feeds: {}, settings: { ...DEFAULT_SETTINGS } });

function load() {
  try {
    const data = { ...fresh(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    return data;
  } catch {
    return fresh();
  }
}

const state = load();
let timer = null;

function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Tiny JSON store: mutate db.data, then call db.save(). Writes are debounced and atomic. */
export const db = {
  data: state,
  save() {
    if (!timer) timer = setTimeout(flush, 80);
  },
  flush,
};
