# Oddhouse

Self-hosted web analytics with a private admin panel, built with SvelteKit,
Bun, Drizzle ORM and SQLite.

- Multiple sites, pageviews, daily charts, top pages, referrers and custom events.
- Static-site and SPA tracking, with automatic History API navigation tracking.
- No tracking cookies or visitor identifiers; query strings and fragments are excluded.
- Respects Do Not Track and Global Privacy Control.

Counts represent pageviews and events, not unique visitors. All administrators
share access to all sites. Admin login uses a session cookie.

## Development

Requires Bun 1.4.4 or newer. Run these commands in Bash:

```bash
bun install
read -r -s -p 'Admin password (12+ characters): ' password; printf '\n'
printf '%s' "$password" | bun run admin create admin
unset password
bun run dev
```

Open the address printed by the development server. The default database is
`data/oddhouse.sqlite`; override it with `DATABASE_PATH`.

```bash
bun run format          # Format source files
bun run check           # Check formatting and types
bun test
bun run build
bun run test:smoke      # Check the built server with a disposable database
```

Edit the schema in `src/lib/server/schema.ts`, then run `bun run db:generate`
and commit the generated migrations. The app applies migrations on startup;
`bun run db:migrate` applies them explicitly. New dependency resolution has a
14-day minimum release age, configured in `bunfig.toml`.

## Tracking

Sign in, register the site's exact origin, and add its generated script to the
site's shared HTML template:

```html
<script defer src="https://stats.example.com/tracker.js" data-site="SITE_UUID"></script>
```

The script tracks initial page loads and SPA pathname changes automatically.
For manual routing, set `data-auto="false"` and call `pageview` after navigation.
Use safe virtual paths for hash routers or paths containing sensitive values.

```js
window.oddhouse?.pageview('/settings');
window.oddhouse?.event('download.pdf');
```

The API is available after the script loads. Use automatic or manual pageviews
to avoid duplicates. Sites with a Content Security Policy must allow the
analytics origin in `script-src` and `connect-src`.

The readable TypeScript source is `tracker/tracker.ts`. Development builds
compile readable JavaScript; production builds minify it. After editing the
tracker during development, run `bun run build:tracker --development`.

## Deployment

On an Ubuntu/Debian VPS with systemd and a domain pointing at it, run from the
repository checkout:

```bash
sudo bash vps.sh install \
  --repo https://github.com/TheOddKn1ght/oddhouse.git \
  --domain stats.example.com \
  --email you@example.com \
  --agree-tos
```

The installer configures native nginx, Docker, TLS and daily database backups,
and prompts for the first administrator's password. Ports 80/443 must be
reachable. The application binds to `127.0.0.1:9991` by default; override it
with `--app-port`.

```bash
sudo oddhouse update
sudo oddhouse status
sudo oddhouse logs app
sudo oddhouse backup
sudo oddhouse admin reset admin
sudo oddhouse recover               # Recover an interrupted update
sudo oddhouse enable-auto-updates   # Opt in to hourly updates
```

Updates refresh the application and installed management script, snapshot the
database, and check application health before reopening traffic. Settings live
in `/etc/oddhouse`; deployment state in `/opt/oddhouse`. Database and backup
volumes persist across container replacements. Keep off-server backup copies.

For local Docker, run `docker compose up --build -d` and open
`http://localhost:9991`. Create an administrator by piping a password to
`docker compose exec -T app bun scripts/admin.ts create admin`.
Set `ORIGIN` before building for another public URL; rebuild when it changes.
Run `bash vps.sh --help` for installer options and management commands.
