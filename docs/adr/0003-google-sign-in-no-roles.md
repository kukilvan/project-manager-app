# Google sign-in only; members are equal, protected by history and rollback

Status: accepted

Decided by the owner on 2026-10-10: no password sign-in. A person without Gmail creates a Google account on their own e-mail. There are no roles: every project member can do everything; protection is the change history (who, when, what) with rollback of one record or of all changes of a user over a period, and soft delete.

Considered: password sign-in (rejected), roles (needless for a small team of equals).

## Consequences

- The only special user is the database admin (first signed in, `meta/admin`), who runs the shared pool and the allowed e-mails.
- All writes go through `repo.save(pid, ops)`, which stamps author and time and writes history.
