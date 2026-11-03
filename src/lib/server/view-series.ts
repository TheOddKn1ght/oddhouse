import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { hits } from './schema';

export function viewSeries(
  db: ReturnType<typeof openDatabase>,
  siteId: string,
  period: ReportPeriod,
  path?: string,
) {
  const scope = and(
    eq(hits.site_id, siteId),
    eq(hits.kind, 'pageview'),
    gte(hits.created_at, period.since),
    lt(hits.created_at, period.until),
    path === undefined ? undefined : eq(hits.path, path),
  );
  function buckets(hourly: boolean) {
    const label = hourly
      ? sql<string>`strftime('%Y-%m-%d %H:00', ${hits.created_at}/1000, 'unixepoch')`
      : sql<string>`strftime('%Y-%m-%d', ${hits.created_at}/1000, 'unixepoch')`;
    const rows = db
      .select({ day: label, count: count() })
      .from(hits)
      .where(scope)
      .groupBy(label)
      .all();
    const counts = new Map(rows.map((row) => [row.day, row.count]));
    return Array.from({ length: hourly ? 24 : period.days }, (_, index) => {
      const date = new Date(period.since + index * (hourly ? 3600000 : 86400000)).toISOString();
      const day = hourly ? date.slice(0, 13).replace('T', ' ') + ':00' : date.slice(0, 10);
      return { day, count: counts.get(day) || 0 };
    });
  }
  const series = buckets(false);
  return {
    series,
    chartSeries: period.days === 1 ? buckets(true) : series,
    granularity: period.days === 1 ? ('hour' as const) : ('day' as const),
  };
}
