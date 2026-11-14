# Job records live in the app's database, alongside BullMQ's own

BullMQ keeps its own record of each job, yet each GenerateQuizJob also has a row in the app's database. That row is the Job: its status, Stage, progress and error, which users see. BullMQ's record only tracks delivering a message about the Job to a worker, retrying it, and recovering it after a stall. The row is needed because:

- the Job limits are enforced in the same transaction that creates the Document, and BullMQ's schema can't join that transaction
- a Run saves its Quiz in the same transaction that checks it still owns the Job
- the dashboard shows each Document's latest Job and its error long after BullMQ has pruned its record
- foreign keys check who owns a Job and delete Jobs with their Document

Keeping the Job's state in the app also keeps the queue narrow (send a message, ask where it is), so tests can swap BullMQ for an in-memory queue.

## Consequences

- The two records can drift. A worker's startup reconcile re-sends Active Jobs whose message never reached the queue and fails those BullMQ gave up on. A Job whose message can't be sent fails at once.
- This applies to each kind of Job: one needs its own record when users see its status or a business rule counts it. A Job that does neither, such as sending an email, can live in BullMQ alone.
