# Firebase stays on the free Spark plan; reads are economised

Status: accepted

The owner does not want to link a bank card, so the Blaze plan is not used. Spark gives 50,000 Firestore reads a day (reset ~10:00 Israel time, midnight Pacific) and no managed backups.

## Consequences

- Read economy is a standing requirement: after the first load only changes are read (`updatedAtServer`), a full check once a week on Saturday (`src/domain/sync.js`). Server jobs also read only changes, fully once a week. A new device reads the whole project once (about 2,200 documents in October; more now).
- Eating the limit (full copy, the History screen — up to 2,000 docs per open) makes evening jobs fail with `RESOURCE_EXHAUSTED`.
- Own backups: `scripts/server-backup.mjs` every 2 days to the private repo `kukilvan/polevoy-backups` and a zip on Google Drive.
- Soft-deleted data is kept a year, then `scripts/server-cleanup.mjs` deletes it (≤ 5,000 docs per run).
