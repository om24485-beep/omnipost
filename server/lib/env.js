// Loads settings from the .env file in the project folder (e.g. GOOGLE_CLIENT_ID). Must be imported first.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
try {
  process.loadEnvFile(file);
} catch (e) {
  if (e.code !== 'ENOENT') console.warn(`[omnipost] Could not read ${file}: ${e.message}`);
}
