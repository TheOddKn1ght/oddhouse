# Collection

The collector stores useful aggregates without cookies or raw IP addresses.
The source site's origin must be registered. Origin checks restrict browser
collection; they are not proof of a real visitor and can be spoofed by a client.
Known bot filtering and User-Agent dimensions are estimates.

Only paths and three campaign fields (`utm_source`, `utm_medium`,
`utm_campaign`) survive URL normalization. Strip other query parameters and
fragments, even for manual API calls. Referrers keep only an external hostname.
Outbound targets keep HTTP(S) origin and path, without credentials or queries.
Paths, titles, event names and campaign values can still contain personal data;
site owners must avoid sending it.

A browser session token is scoped to a site before hashing. Temporary visit
state suppresses repeated pageviews for the same path for five minutes. A
suppressed return still updates the exit page. After 30 minutes idle, a new
pageview starts a new journey. Campaign attribution comes from the first page
of that journey. Do not change campaign attribution on later pages.

Engagement is a cumulative snapshot, not an extra pageview or custom event.
Retries and out-of-order samples must not inflate totals: retain maxima, bound
active time by elapsed time, and require a matching page and journey. It means
focused, visible time after recent interaction, with best-effort delivery.
Download events mean link clicks, not completed file saves.

Code: `tracker/tracker.ts`, `src/lib/server/collection.ts`, `record-hit.ts`,
`dimensions.ts`, and `src/routes/api/collect/+server.ts`.
