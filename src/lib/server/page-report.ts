import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { hits, pageActivity } from './schema';
import { viewSeries } from './view-series';
import { csvCell } from './report-csv';

type DB = ReturnType<typeof openDatabase>;
export function validPagePath(path: string | null): path is string {
  return (
    !!path &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    path.length <= 2048 &&
    !path.includes('?') &&
    !path.includes('#') &&
    Array.from(path).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
  );
}
export function pageReport(db: DB, siteId: string, path: string, period: ReportPeriod) {
  const scope = and(
    eq(hits.site_id, siteId),
    eq(hits.path, path),
    gte(hits.created_at, period.since),
    lt(hits.created_at, period.until),
  );
  function totals(since: number, until: number) {
    return db
      .select({
        pageviews:
          sql<number>`coalesce(sum(case when ${hits.kind}='pageview' then 1 else 0 end),0)`.mapWith(
            Number,
          ),
        events:
          sql<number>`coalesce(sum(case when ${hits.kind}='event' then 1 else 0 end),0)`.mapWith(
            Number,
          ),
      })
      .from(hits)
      .where(
        and(
          eq(hits.site_id, siteId),
          eq(hits.path, path),
          gte(hits.created_at, since),
          lt(hits.created_at, until),
        ),
      )
      .get()!;
  }
  const referrers = db
    .select({
      label: sql<string>`coalesce(nullif(${hits.referrer}, ''), 'Direct / unknown')`,
      count: count(),
    })
    .from(hits)
    .where(and(scope, eq(hits.kind, 'pageview')))
    .groupBy(sql`coalesce(nullif(${hits.referrer}, ''), 'Direct / unknown')`)
    .orderBy(desc(count()), hits.referrer)
    .limit(20)
    .all();
  const events = db
    .select({ label: hits.event, count: count() })
    .from(hits)
    .where(and(scope, eq(hits.kind, 'event')))
    .groupBy(hits.event)
    .orderBy(desc(count()), hits.event)
    .limit(20)
    .all();
  function links(event: string) {
    return db
      .select({ label: hits.target, count: count() })
      .from(hits)
      .where(and(scope, eq(hits.kind, 'event'), eq(hits.event, event), sql`${hits.target} != ''`))
      .groupBy(hits.target)
      .orderBy(desc(count()), hits.target)
      .limit(20)
      .all();
  }
  const engagement = db
    .select({
      samples: count(),
      activeMs: sql<number>`coalesce(sum(${pageActivity.active_ms}),0)`.mapWith(Number),
      averageMs: sql<number>`coalesce(avg(${pageActivity.active_ms}),0)`.mapWith(Number),
      averageScroll: sql<number>`coalesce(avg(${pageActivity.max_scroll}),0)`.mapWith(Number),
      deepestScroll: sql<number>`coalesce(max(${pageActivity.max_scroll}),0)`.mapWith(Number),
    })
    .from(pageActivity)
    .where(
      and(
        eq(pageActivity.site_id, siteId),
        eq(pageActivity.path, path),
        gte(pageActivity.created_at, period.since),
        lt(pageActivity.created_at, period.until),
      ),
    )
    .get()!;
  return {
    ...viewSeries(db, siteId, period, path),
    totals: totals(period.since, period.until),
    previous: totals(period.previousSince, period.previousUntil),
    referrers,
    events,
    outbound: links('outbound_click'),
    downloads: links('file_download'),
    engagement,
  };
}
export function pageReportCsv(
  report: ReturnType<typeof pageReport>,
  period: ReportPeriod,
  origin: string,
  path: string,
) {
  const rows: (string | number)[][] = [
    ['Section', 'Label', 'Value'],
    ['Report', 'Site', origin],
    ['Report', 'Path', path],
    ['Report', 'From (UTC)', period.from],
    ['Report', 'To (UTC, inclusive)', period.to],
    ['Report', 'Breakdowns', 'Top 20 per category'],
  ];
  for (const [key, value] of Object.entries(report.totals)) rows.push(['Totals', key, value]);
  for (const [key, value] of Object.entries(report.previous))
    rows.push(['Previous period', key, value]);
  for (const row of report.series) rows.push(['Daily pageviews', row.day, row.count]);
  if (report.granularity === 'hour')
    for (const row of report.chartSeries) rows.push(['Hourly pageviews', row.day, row.count]);
  for (const [key, value] of Object.entries(report.engagement))
    rows.push(['Engagement', key, value]);
  for (const key of ['referrers', 'events', 'outbound', 'downloads'] as const)
    for (const row of report[key]) rows.push([key, row.label, row.count]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
