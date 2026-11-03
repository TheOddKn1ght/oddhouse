# Storage and operation

SQLite keeps deployment small. WAL, foreign keys and a busy timeout support
short collector writes alongside report reads. Committed Drizzle migrations
run when the server or admin CLI opens the database. Preserve existing data
when adopting an old schema; never replace migrations with table recreation.

Hits, journey summaries and page engagement are durable report data. Visits and
visit-page rows are temporary deduplication state. Deleting temporary state must
not erase historical entry or exit reports. Site foreign keys cascade to its
data. There is no automatic retention policy for durable analytics today.

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
