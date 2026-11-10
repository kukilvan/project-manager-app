# Release and rollback branches

The site is built only from `main`. Other branches are return points; branches are used instead of tags (tags could not be pushed from the old cloud sessions). Remove marker branches only if the owner asks.

| Branch | Commit | What |
|---|---|---|
| `release-1.0` | `ff5ad11` | Version 1.0 «Полевой журнал». **Separate history:** `main` was restarted at 1.1 (first commit 2026-10-23), so it is not an ancestor of `main` |
| `release-1.1` | `fdb4452` | 1.1, one site for all |
| `release-1.2` | `6ff4f43` | 1.2, three languages |
| `one-site` | `7abae5c` | where 1.1 was built; merged into `main`, kept for history |
| `stable-before-tohnit` | `9278998` | 2026-10-16, before drawing parsing in the app (old history) |
| `stable-2026-10-17-before-edits` | `aaa2f46` | 2026-10-17, all checked before a series of fixes (old history) |
| `rollback-2026-11-08` | `3783037` | before the offline rework |
| `rollback-2026-11-09` | `a0dcc99` | before «Новая версия чертежа» |
| `rollback-2026-11-09b` | `2966523` | all checked: new drawing version, point merge, cables by label, own works, weak network. **Latest** |

Why: a change broke something and a quick fix fails → return the site to a verified state; `release-*` are versions to restore from (`ВОССТАНОВЛЕНИЕ.md`); `rollback-*` the owner asks for before big reworks and knows by date.

## Rolling back — only with the owner's consent

- Never rewrite `main` history. Restore content: `git checkout rollback-XXXX -- .`, commit `Rollback to …`, push to `main`; the site rebuilds itself.
- **Code rolls back, Firestore data does not.** Fields added by newer versions (`ownWorks`, `cableOverride`, `pos`, drawing `review`…) stay in the data; old code ignores them. Ask the owner for a backup to Drive first.
- New rollback point: `git branch rollback-YYYY-MM-DD <commit>` and `git push origin rollback-YYYY-MM-DD`; if that date exists, suffix `b`, `c`. Tell the owner the branch name and commit, and add a row here.
