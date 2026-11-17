# Problem marks are a project subcollection, one document per point and problem

Status: accepted (planned, stage 6)

A point can have several open problems from the shared «Проблемы» list (idea 003); «Решено» closes one and keeps it in history with who and when; a mass mark may cover hundreds of points, offline. Decision: marks live in the project subcollection `problemMarks`, one document per point × problem × time (`pointId`, `problemId`, a ready description id or own Hebrew text, who and when marked, who and when solved). Marking a problem the point already has open updates that document; a problem solved and marked again is a new document. The project rule of Firestore already covers subcollections, and the repo gives marks history, rollback, delta reads and the backup like any project record.

Options considered: a list of marks on the point document — rejected: the repo writes point fields whole, so two members marking different problems on one point at the same time lose one mark, and a solved history grows inside the point that every screen reads; one document per mass mark with a list of points — rejected: solving part of the points splits the document, and per-point history becomes hard to read.

## Consequences

- A mass mark of N points costs N writes plus N history entries (≈ 1,500 for 750 points, within the Spark daily limit).
- Two members marking the same problem on one point offline make two open marks: screens show the newest, «Решено» closes all.
- Point merge moves open marks of the removed points to the kept one.
- The nightly job reads `problemMarks` for the management sheet and «PDF с номерами».
- Stage 4 (PocketBase storage) must carry the collection.
