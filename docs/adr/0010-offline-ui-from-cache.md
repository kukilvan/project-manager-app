# The UI is built from the Firestore cache listener; the change query only fills the cache

Status: accepted

The change query (`updatedAtServer > …`) does not see offline writes: their server time is not set yet. So the UI listens to the cache (`onSnapshot(..., { source: 'cache' })`) and the change query only fills the cache (`src/app/repo.js`). Sign-in and admin rights are checked in the background for a fast start (`src/firebase.js`, `src/main.js`).

## Consequences

- New and changed data shows at once offline. Do not break this split.
- With cached auth (`pm.authCached`) `initializeAuth` is created without `popupRedirectResolver`, so every `signInWithPopup`, `signInWithRedirect`, `getRedirectResult`, `reauthenticateWithPopup` must get `browserPopupRedirectResolver` explicitly — otherwise `auth/argument-error` (this broke Drive access once).
