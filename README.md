# Oddhouse

Self-hosted web analytics with SvelteKit, Bun, and SQLite. Tracks pageviews, referrers, countries, browsers, devices, operating systems, languages, and custom events without tracking cookies or storing raw IPs.

Requires Bun 1.4.4+.

```bash
bun install
bun run geoip:update
read -r -s -p 'Admin password (12+ characters): ' password
printf '%s' "$password" | bun run admin create admin
unset password
bun run dev
```

Sign in, register a site, and add its generated tracking script. Counts are pageviews, not unique visitors.

Device and OS are estimated from User-Agent; language is the preferred base language. Known crawlers, headless agents and WebDriver automation are excluded going forward. Historical hits remain unchanged and show Unknown for new fields. Detection is approximate; disguised clients can evade it.

For an Ubuntu/Debian VPS with a domain and ports 80/443 open:

```sh
sudo bash vps.sh install \
  --repo https://github.com/TheOddKn1ght/oddhouse.git \
  --domain stats.example.com --email you@example.com --agree-tos
```

Manage with `sudo oddhouse update`, `status`, `backup`, or `recover`. Keep backups off-server. Run `bash vps.sh --help` for options.

`bun run build` uses Bun's lower-memory mode and one worker per bundler pool,
with tracker and application builds run sequentially. Build subprocesses disable
JIT compilation and promptly release unused allocator pages; the production
server uses its normal runtime settings. Vite loads the TypeScript config
directly through Bun. Production builds omit
source maps and compressed-size reporting. Docker also waits for the app build
before installing runtime dependencies and downloading GeoIP data, avoiding
overlapping memory peaks. Dependency downloads use four concurrent requests.
Monthly GeoIP refreshes do not invalidate the application build cache.
These defaults target small VPS hosts, including 1 CPU / 1 GB RAM machines;
available memory still depends on the OS, Docker, and other running services.
For faster builds on larger hosts, set `ROLLDOWN_WORKER_THREADS` and
`RAYON_NUM_THREADS` to higher values. Set `BUN_JSC_useJIT=1` to re-enable
JIT compilation during builds. This Bun engine setting is verified with the
pinned Bun 1.4.4 runtime and should be rechecked on upgrades.

Country data: [DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Campaigns keep only `utm_source`, `utm_medium` and `utm_campaign` (100 characters
each), attributed to the first page of a session. Other query parameters and
fragments are discarded. Outbound HTTP(S) clicks and common file links are
tracked automatically, with query strings removed from targets. A download
means a file link was clicked, not a confirmed save. Avoid personal data in
campaign values, paths and page titles.

Engagement measures focused, visible time while the visitor has interacted
within the last minute, plus deepest observed scroll. Cumulative snapshots are
sent every 15 seconds and at page transitions; delivery is best effort. The
engagement table shows total active time and deepest scroll per page. Use
`data-links="false"` or `data-engagement="false"` to disable either feature.
Entry pages are the first observed page of each session; exit pages appear
after 30 minutes of inactivity and reflect the last observed page, including
returns that did not increase the pageview count. Session summaries persist
for historical reports; temporary deduplication state still expires.

The private live panel refreshes every 15 seconds: active sessions contacted the
collector within 60 seconds, and recent views cover the last five minutes.
These features start collecting after the tracker/server update; old data is
not backfilled. The embed script URL stays unchanged.
