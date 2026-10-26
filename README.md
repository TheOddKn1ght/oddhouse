# Oddhouse

Self-hosted web analytics with a private Svelte admin panel. SvelteKit 3 runs on
Bun; Drizzle ORM with SQLite stores sites, pageviews, custom events, administrators and sessions.
One application container sits behind the VPS's native nginx. A second utility
container takes daily database backups. No host Bun installation is required.

## Current scope

- Multiple sites, each registered by exact origin (scheme, hostname and port).
- Password login with Argon2id, server-side sessions and login throttling.
- Pageviews, daily charts, top paths, referring domains and named custom events.
- Today / 7 / 30 / 90 calendar-day filters, using UTC.
- Static sites and History API SPAs; explicit calls for other routers.
- No tracking cookies, browser storage, visitor fingerprints or raw IPs in SQLite.
- Query strings and fragments are discarded; external referrers retain only hostname.
- DNT and Global Privacy Control suppress tracking.

Unique visitors, geolocation, browser/device breakdowns, campaigns, exports,
site editing/deletion and automatic analytics retention are not implemented yet.
All administrators can access all sites. This is a personal deployment, not a
multi-tenant analytics service. The admin login itself uses an HTTP-only cookie.

## Local development

Requires Bun 1.4.4 or newer.

```sh
bun install
read -r -s -p 'Admin password (12+ characters): ' password; printf '\n'
printf '%s' "$password" | bun run admin create admin
unset password
bun run dev -- --host 127.0.0.1
```

Open the address printed by Vite. Default database: `data/oddhouse.sqlite`.
`DATABASE_PATH` can override it. Passwords must have 12–1024 characters.

```sh
bun run format
bun run check
bun test
bun run --bun build
bun run test:smoke
```

The smoke check runs the production output with a disposable database. To run a
production build directly on localhost, set its canonical origin when building:

```sh
ORIGIN=http://localhost:8091 bun run --bun build
HOST=127.0.0.1 PORT=8091 bun start
```

SvelteKit 3's Bun adapter uses a build-time canonical origin. Rebuild when the
public origin changes. `bun run --bun build` is required because the adapter
uses Bun's bundler. Build output contains no database or administrator account.

## VPS installation

Push this repository to your own Git remote first. There is no hard-coded remote
or domain. On a supported Ubuntu/Debian VPS with systemd and your domain pointed
at it, run from the checkout:

```sh
sudo bash vps.sh install \
  --repo https://github.com/YOUR_USER/oddhouse.git \
  --domain stats.example.com \
  --email you@example.com \
  --agree-tos
```

The installer prompts for the first administrator's password. Use `--skip-admin`
for noninteractive installation, then run `sudo oddhouse admin create admin`.
`--agree-tos` accepts the Let's Encrypt subscriber agreement. Private Git repos
need a root-owned read-only SSH deploy key and a verified `known_hosts` entry.

It installs Docker/Compose, nginx and Certbot if needed, issues TLS using the
webroot challenge, and creates only Oddhouse's nginx configuration. Existing
nginx sites remain in place. Ports 80/443 must be reachable for HTTP/TLS and
certificate renewal; the installer does not change your firewall. Docker binds
only `127.0.0.1:8091`; use `--app-port` to choose another unoccupied local port.
The Docker build receives the public origin from `--domain`.

```sh
sudo oddhouse update
sudo oddhouse status
sudo oddhouse logs app
sudo oddhouse logs nginx
sudo oddhouse backup
sudo oddhouse admin reset admin
sudo oddhouse recover
sudo oddhouse start
sudo oddhouse enable-auto-updates
sudo oddhouse disable-auto-updates
```

`update` fetches the configured branch, refuses rewritten history, builds a
revision-tagged image before interrupting traffic, closes this site's ingress,
stops writes and takes a consistent SQLite snapshot. It then waits for the new
application's health check before reopening nginx. A failed candidate restores
the previous image with a new database copied from the pre-update snapshot;
the failed database is retained. An interrupted update leaves a recovery record
and maintenance gate; use `recover` before resuming. Brief collection gaps can
occur during updates; tracker requests are best effort and are not replayed.

After a successful update, the installed `/usr/local/bin/oddhouse` script and
systemd units are refreshed from that revision. Hourly branch polling is opt-in,
matching lll; Certbot renewal is enabled automatically. Root executes deployment
code from the configured branch, so restrict write access to it.

Deployment state and release archives live under `/opt/oddhouse`; root-only
settings under `/etc/oddhouse`; nginx config in `/etc/nginx/conf.d/oddhouse.conf`.
Named Docker volumes `oddhouse_oddhouse-data` and `oddhouse_oddhouse-backups`
persist independently of containers. Do not run `docker compose down -v` on a
live deployment. Snapshots have integrity manifests, retaining seven recent
snapshots plus one from each of four recent weeks. Copy backups off the VPS for
protection against disk loss. Manual backups run the same snapshot operation.
`recover` restores only a pending deployment snapshot, not an arbitrary backup.

## Local Docker

```sh
docker compose up --build -d
read -r -s -p 'Admin password (12+ characters): ' password; printf '\n'
printf '%s' "$password" | docker compose exec -T app bun scripts/admin.ts create admin
unset password
```

Open `http://localhost:8091`. To enable daily backups locally, add
`--profile backup` before `up`. For another public origin, set `ORIGIN` and rebuild.
The VPS script uses `compose.vps.yaml` to select revision-tagged images and bound
container logs. Neither Compose file runs an nginx container.

## Tracking static sites and SPAs

Sign in, add a site, and copy its generated script into the shared HTML template.
Neoblog's current GoatCounter tag is in `templates/base.html`; replace that tag
after Oddhouse is deployed and its site is registered. Neoblog is not changed by
this repository.

```html
<script defer src="https://stats.example.com/tracker.js" data-site="SITE_UUID"></script>
```

The same script counts the initial page and pathname changes caused by
`pushState`, `replaceState` and browser back/forward. Same-path query/fragment
changes are not counted. `data-spa="false"` disables automatic route observation.
For hash-based routers or routes that change only the query, use
`data-auto="false"` and call the API after navigation with a safe virtual path:

```js
window.oddhouse?.pageview('/settings');
window.oddhouse?.event('download.pdf');
```

Use either automatic tracking or manual router callbacks to avoid double counts.
The API becomes available after the deferred script executes. Event names accept
letters, numbers, underscores, periods, colons and hyphens (1–100 characters).
No arbitrary event properties are collected. Titles and URL paths may themselves
contain personal information: use safe virtual paths if your application exposes
sensitive values there. This is pageview analytics, not a count of unique people.
Browser script blocking, disabled JavaScript and network failures affect counts.

Sites with a Content Security Policy need to allow the analytics origin in both
`script-src` and `connect-src`. The collector requires the exact registered
Origin and supports CORS preflight; collection never sends admin credentials.
Site IDs are public and origin headers can be forged outside a browser. The
nginx collector is rate-limited, but these counts are not fraud-proof. Collector
access logs are disabled; other nginx access/error logs follow the host config.

## Operations and validation

The container runs as the `bun` user with persistent data volumes. Health checks
exercise SQLite. Backups use SQLite `VACUUM INTO`, include committed WAL data,
and verify SHA-256 plus database integrity before restoring to a new path.
Application schema changes should remain compatible with pre-update snapshots.
Drizzle applies committed versioned migrations before queries are served.

Local verification covers Svelte types, the production build, tracker routing,
collector validation, backups, deployment/recovery failure paths and the built
server HTTP flow. The real Docker image and host nginx/Certbot setup still need
a first VPS deployment check.

## Database workflow

Table definitions live in `src/lib/server/schema.ts`. Application reads and
writes use Drizzle's Bun SQLite driver. SQL expressions remain inside typed
Drizzle queries for analytics aggregates. Backup/restore code uses the underlying
SQLite driver to create consistent snapshots.

After editing the schema:

```sh
bun run db:generate
# Review and commit the resulting SQL and metadata under drizzle/.
bun run db:migrate
```

The app and admin CLI also apply pending migrations automatically when opening
the database. Migrations are shipped in the Docker image. The initial migration
adopts the original Oddhouse tables in place; it does not discard analytics,
administrators or sessions. Production updates still snapshot the database
before starting a version that may migrate it. Do not edit migrations that have
already been applied; generate a new one instead.

## Formatting and dependency policy

`bunfig.toml` configures the native Bun formatter: two spaces, single quotes,
semicolons and a 100-column width. `bun run format` formats the project, including
Svelte components; `bun run format:check` checks without rewriting. The regular
`bun run check` also checks formatting. Generated migration SQL and snapshot
metadata are left as generated. `.editorconfig` uses the same indentation.

New dependency resolution requires a release age of at least 14 days
(`minimumReleaseAge = 1209600`). Existing lockfile entries remain pinned; the
policy does not retroactively downgrade them. Docker installs use the same
bunfig and frozen lockfile.

## Why Vite stays

SvelteKit's official development/build pipeline is its Vite plugin. Replacing
that pipeline with Bun's bundler would require replacing SvelteKit's routing,
SSR/hydration integration and build machinery or maintaining custom tooling.
A plain `Bun.build` of a `.svelte` entry treats it as a file asset rather than
compiling a runnable SvelteKit application.

The dev, build and preview scripts explicitly run Vite under Bun. The official
Bun adapter bundles the production server with Bun and serves it with
`Bun.serve`; Vite is not a production server dependency.
See the [SvelteKit Bun adapter](https://svelte.dev/docs/kit/adapter-bun),
[SvelteKit Vite plugin](https://svelte.dev/docs/kit/@sveltejs-kit-vite), and
[Bun formatter](https://bun.sh/docs/format) documentation.

## Tracker build

The editable, type-checked source is `tracker/tracker.ts`. Bun compiles the
TypeScript into a standalone browser script at the generated, ignored
`static/tracker.js`. `bun run dev` compiles readable JavaScript;
`bun run build` (including Docker) compiles and minifies production JavaScript.
Sites keep using `/tracker.js`; no snippet changes are needed. No TypeScript
or source map is served to visitors.

After editing the tracker during development, run
`bun run build:tracker --development` to refresh the readable output.
`bun run build:tracker` generates the minified production output.
The tracker behavior tests run against both development and production builds;
the production smoke check verifies the served script matches that output.
