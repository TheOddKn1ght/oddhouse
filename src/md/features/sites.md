# Site management

A site's ID and registered origin define where collection belongs. Owners can
rename a site without changing its ID, embed code, origin, or historical data.
Names must remain nonempty and at most 100 characters. Keep renaming separate
from adding a site and preserve report filters after saving.

Show the timestamp of the latest stored pageview or event, across all dates,
near tracker installation. This confirms that data reached storage, not that
all visitors are being tracked. No data means no accepted hit has been stored;
bots, rejected requests and engagement-only requests do not prove installation.
The status updates when the dashboard reloads, not through a new polling loop.

Code: `src/routes/+page.server.ts`, `src/routes/+page.svelte`, and
`src/lib/server/site-management.ts`.
