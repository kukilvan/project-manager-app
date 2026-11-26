// Vite build configuration: the GitHub Pages base path, the PWA plugin (service worker and web manifest) and the Russian, English and Hebrew manifests.
// Defines __VERSION__ (from package.json) and __BUILD__ (build time) for the app; `worker.format` is `es` for the drawing-parsing worker.
// The NAS build (scripts/build-nas.mjs) sets VITE_BASE=/ and VITE_BACKEND=pocketbase; import.meta.env.VITE_BACKEND is always defined, so isPocketBase() folds to a constant.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// The app is published on GitHub Pages at /project-manager-app/; the NAS build at /
const BASE = process.env.VITE_BASE || '/project-manager-app/';
const BACKEND = process.env.VITE_BACKEND || '';
const NAME = 'Менеджер проектов';
const MANIFEST = {
  name: NAME,
  short_name: 'Проекты',
  description: `${NAME}: точки, работы и ежедневные отчёты монтажника слаботочных систем`,
  lang: 'ru',
  start_url: BASE,
  scope: BASE,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0f172a',
  theme_color: '#0f172a',
  icons: [
    { src: 'icon-192-v2.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512-v2.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
// The same manifest in English and Hebrew: the home-screen icon name follows the app language (src/i18n/index.js switches the link)
const LANG_MANIFESTS = {
  en: { name: 'Project Manager', short_name: 'Projects', description: 'Project Manager: points, works and daily reports for low-voltage installers', lang: 'en' },
  he: { name: 'מנהל פרויקטים', short_name: 'פרויקטים', description: 'מנהל פרויקטים: נקודות, עבודות ודוחות יומיים למתקיני מערכות מתח נמוך', lang: 'he', dir: 'rtl' },
};
const langManifests = () => ({
  name: 'lang-manifests',
  generateBundle() {
    for (const [l, over] of Object.entries(LANG_MANIFESTS)) {
      this.emitFile({ type: 'asset', fileName: `manifest-${l}.webmanifest`, source: JSON.stringify({ ...MANIFEST, ...over }) });
    }
  },
});

export default defineConfig({
  base: BASE,
  define: {
    __VERSION__: JSON.stringify(VERSION),
    __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    // a string literal in every build, '' on GitHub Pages: the PocketBase branches and chunks drop out of that build
    'import.meta.env.VITE_BACKEND': JSON.stringify(BACKEND),
  },
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },  // drawing parsing (mupdf) runs in a background thread
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: BASE + 'index.html',
        // never answer these with the app: Firebase/Google (`__/`), and on the NAS copy PocketBase's API with its OAuth redirect page (`api/`) and dashboard (`_/`), spec 4 § 3.9
        navigateFallbackDenylist: [/^\/__\//, new RegExp(`^${BASE}__/`), new RegExp(`^${BASE}api/`), new RegExp(`^${BASE}_/`)],
        cleanupOutdatedCaches: true,
        globIgnores: ['**/mupdf*'],  // the PDF reader module (≈10 MB) is fetched at the first drawing parse, not at install
        runtimeCaching: [{ urlPattern: /mupdf.*\.(?:wasm|js)$/, handler: 'CacheFirst', options: { cacheName: 'mupdf', expiration: { maxEntries: 6 } } }],
      },
      manifest: MANIFEST,
    }),
    langManifests(),
  ],
});
