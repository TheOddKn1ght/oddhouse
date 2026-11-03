# Access

Reports, live activity and CSV exports expose private site data. Protect all
routes by default in the server hook; keep the public allowlist small. Only
login, health, collection, the tracker and robots are public. New report routes
inherit authentication and no-store caching.

Admin accounts are created through the local CLI. Store password hashes and
session token hashes, not passwords or bearer tokens. Sessions expire after
seven days. Logout deletes the server session. Cookies are HTTP-only and use
secure transport in production. Mutations use SvelteKit's origin checks.

Login throttling is process-local and bounded. It is an abuse barrier, not a
distributed lockout system. Do not put credentials or session tokens in logs,
exports, or intent documents.

Code: `src/hooks.server.ts`, `src/lib/server/auth.ts`, login routes, and
`scripts/admin.ts`.
