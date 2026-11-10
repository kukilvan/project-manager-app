# The owner's copy moves to PocketBase on a home NAS; Firebase stays for everyone else

Status: accepted (planned, stages 4–5)

The owner sets up a home NAS (UGREEN DXP2800, 2×3 TB HDD mirror, 500 GB NVMe) in a separate project. When they trust it, a full copy of the app and their data runs there on PocketBase for them and a team of 2–6; they test it in parallel for several days and, if all is well, make it the main one. Other users stay on Firebase or on-device mode; the code must keep working with Firebase. Management sheets stay in Google.

## Consequences

- PocketBase becomes a fourth implementation behind the repo interface (`src/app/repo.js`).
- PocketBase has no Firestore-like offline persistence: the offline cache and write queue must be built — the main risk, since everything must work offline.
- Stage 2 writes `docs/nas-requirements.md` for the NAS project.
