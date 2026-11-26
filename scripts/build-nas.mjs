// NAS build: runs Vite for the NAS copy with base `/` and `VITE_BACKEND=pocketbase` into dist-nas/ (`npm run build:nas`).
// Both variables are read by vite.config.js; isPocketBase() in src/edition.js turns the flag into the NAS start. The GitHub Pages build (`npm run build`) sets neither.
// Spec 4 § 3.1; the release packer scripts/nas-pack.mjs zips dist-nas/ for the release `nas-build`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'dist-nas';

process.env.VITE_BASE = '/';
process.env.VITE_BACKEND = 'pocketbase';
process.chdir(ROOT);
// imported after the variables are set: vite.config.js reads them when Vite loads it
const { build } = await import('vite');
await build({ build: { outDir: OUT_DIR, emptyOutDir: true } });
