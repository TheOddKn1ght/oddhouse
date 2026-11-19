# Goals and funnels

Owners want to know whether visits reach the pages and events they care
about, not only how much traffic arrives. Goals and funnels answer that from
the durable hit-to-journey link. They never use browser tokens or visit IDs.

A step or goal matches either an exact event name or a path. A path ending in
`*` is a literal prefix match (`/blog/*` matches `/blog/a`, not `/blogs`); no
other wildcard syntax exists, so stored paths containing `%` or `_` still match
literally. Keep definitions per site, at most 20 goals and 10 funnels, with
2 to 5 funnel steps, to bound report queries on small hosts.

Goal conversions count journeys started in the range that contain at least one
matching hit, at any time in that journey. The rate divides by linked journeys
started in the range, never by pageviews. Completions count matching hits in the
range and also include older hits without a journey link and API hits without a
session. Show both, so a rate never looks like a share of completions.

Funnel steps must happen in order within one journey. A later step needs a
distinct hit stored after the earlier step's first match. Order uses hit
insertion order, which follows collection time and has no timestamp ties, so
one hit cannot satisfy two steps. Each step shows the
journeys reaching it, the share of the first step and the drop from the
previous step. Funnels are not exclusive: a journey can enter several.

Journeys and hits recorded before the journey link existed are not linked and
are excluded from rates and funnels. State that near both reports. Dashboard
filters narrow goals and funnels to journeys with a matching pageview.

Changing definitions is retroactive: reports recalculate from stored hits.
Deleting a goal or funnel removes only the definition.

Code: `src/lib/server/conversions.ts`, `hit-filters.ts`, and dashboard actions
in `src/routes/+page.server.ts`.
