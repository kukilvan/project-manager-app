# The app is a PWA hosted on GitHub Pages

Status: accepted

The owner has no Apple developer account and will not pay for one, so a native App Store app is out. The app is a PWA: installed to the iPhone home screen, also used in the browser on Windows. It is hosted on GitHub Pages (free, built from `main` by `.github/workflows/pages.yml`), not on Firebase Hosting.

Considered: native app (needs the paid Apple account), Firebase Hosting (rejected by the owner; stays the documented fallback in `ВОССТАНОВЛЕНИЕ.md`).

## Consequences

- Every push to `main` deploys the live site within 1–2 minutes; the service worker updates installed apps by itself (`autoUpdate`).
- iPhone caches the icon until the file is renamed — icons carry a version suffix (`*-v2.png`, links with `%BASE_URL%` in `index.html`).
- Built with `VITE_BASE` = `/project-manager-app/`; another host means another base and new OAuth origins.
