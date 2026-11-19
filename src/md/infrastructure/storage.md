# Storage and operation

SQLite keeps deployment small. WAL, foreign keys and a busy timeout support
short collector writes alongside report reads. Committed Drizzle migrations
run when the server or admin CLI opens the database. Preserve existing data
when adopting an old schema; never replace migrations with table recreation.

Hits, journey summaries and page engagement are durable report data. Visits and
visit-page rows are temporary deduplication state. Deleting temporary state must
not erase historical entry or exit reports. Site foreign keys cascade to its
data, including goal and funnel definitions.

Durable analytics are kept forever unless an owner picks a per-site retention
period. Retention deletes hits, journeys and engagement older than the cutoff
(journeys by start time) at startup, hourly, and right after the setting is
saved. Deletes run in small batches so collector writes are not blocked for
long. Deletion is permanent, so the setting states it, and backups made earlier
still contain the old data.

Back up SQLite through the supported backup command, not a casual file copy
while WAL writes are active. Keep copies off the host. Restore only through an
explicit operator action. Tests and smoke runs use isolated databases.

Production builds target small VPS machines. Tracker and app builds run
sequentially, with bounded workers and low-memory Bun settings. Keep build-only
engine settings out of the running server. Deployment is separate from local
verification; a successful build does not prove a VPS rollout.

Code: `src/lib/server/database.ts`, `schema.ts`, `drizzle/`, and `scripts/`.

Each connection registers `oddhouse_lower` for report searches. SQLite built-in
`lower` handles ASCII only; use Unicode normalization and JavaScript lowercase
without altering stored labels or their grouping.
