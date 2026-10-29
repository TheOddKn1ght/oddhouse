# Oddhouse

Self-hosted web analytics with SvelteKit, Bun, and SQLite. Tracks pageviews, referrers, countries, browsers, devices, operating systems, languages, and custom events without tracking cookies or storing raw IPs. Respects DNT and GPC.

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

Country data: [DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
