# Reporting

Owners need both quick checks and reproducible historical reports. Keep presets
for common visits and accept explicit UTC dates for investigations. Dates are
inclusive in the interface. SQL uses an inclusive start and exclusive next-day
end, so midnight belongs to exactly one period. Limit custom reports to 366
calendar days to bound chart size and query work. Invalid dashboard dates show
an explanation and a preset fallback; exports reject them to avoid downloading
a report for unexpected dates.

The comparison is the immediately preceding range with the same number of UTC
calendar days. Today can be partial; state that next to the comparison. A zero
baseline has no meaningful percentage growth. Show “No previous activity”
instead of infinity. Fill missing chart dates with zero, including empty sites.

Sessions count durable journeys that start in the range. An event without a
pageview does not create a journey. Sessions are not unique visitors. Entry
pages use journey start time; exit pages use last contact time and appear only
after 30 minutes idle. Historical engagement belongs to the page's creation
date, including later cumulative updates. It is not a measurement of activity
strictly inside the selected time interval.

All breakdowns show up to 20 results, sorted by count then label. The CSV is a
portable copy of the dashboard aggregates, with the same limit stated in the
file. Never export raw session or visit identifiers. Escape spreadsheet formula
prefixes as well as CSV quotes and delimiters. Exports require admin login.
Dashboard and export share one report implementation to prevent count drift.

Live activity deliberately ignores historical dates. Label it as current.
Preserve the last successful snapshot if polling fails. Hide a previous site's
snapshot when the owner switches sites.

Code: `src/lib/server/report-period.ts`, `dashboard-report.ts`,
`activity-reports.ts`, `report-csv.ts`, and the dashboard/export routes.

## Exploring beyond the overview

The overview stays short. Dedicated breakdown reports let owners search and
page through all core hit dimensions, including outbound links and downloads.
Search is a literal, case-insensitive substring; SQL wildcard characters have
no special meaning. Normalize Unicode and lowercase text for search, so Cyrillic
and accented paths work as well as ASCII. Country and language searches use stored codes, while rows
also show readable names. Sort ties by the stored label for stable pagination.
Show matching row and hit totals so the meaning of a filtered report is clear.

Keep site, dates, search and sort in the URL. Pagination and CSV preserve them;
a new search starts on page one. Clamp invalid or stale page numbers to the
available range. A breakdown export includes all matching aggregate rows, up
to 10,000. Reject larger downloads with an explanation instead of truncating
silently. This bound keeps memory use predictable on small hosts.

Use the same dimension definitions and queries for overview rows, the explorer,
and breakdown exports. Event reports include events; other core dimensions
count pageviews. Do not introduce implied session attribution across dimensions
that the stored data cannot support.

## Page reports and chart granularity

A page report isolates one exact stored path, site and UTC date range. Link to
it from the overview, full pages report and live pageviews. Keep path matching
literal: similar prefixes, query variants and other sites must not leak into
its counts. Show pageviews and events with previous-period counts, referrers,
event names, outbound targets, downloads and aggregate engagement. Do not infer
unique visitors or page-level sessions from data with no durable hit-to-journey
link. Never expose the identifiers used to deduplicate engagement.

Engagement samples are tracked page loads, including samples with zero active
time. Average active time uses those samples as its denominator, not filtered
pageview counts. Historical engagement still belongs to the page creation date.
State this near the measurements. Breakdown tables and page CSV use the same
20-row cap as the overview; exports identify that cap.

Single-day charts have 24 hourly UTC buckets. Longer ranges use daily buckets.
Fill every missing bucket with zero and provide a keyboard-accessible count
table. Preserve daily counts in existing overview exports and add hourly rows
when the report spans one day. Reuse one series query and chart component so
page and site reports use the same boundaries and labels.

Live snapshots carry their capture time. Show that time and explain refresh
failures while retaining the last valid snapshot. A current-looking count must
not conceal a failed refresh.
