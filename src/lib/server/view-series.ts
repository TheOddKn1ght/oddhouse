import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { hits } from './schema';
import { hitFilter, type Filters } from './hit-filters';

const DAY = 86400000;
export type ChartInterval = 'hour' | 'day' | 'week' | 'month';
export function chartInterval(params: URLSearchParams, period: Pick<ReportPeriod, 'days'>) {
  if (period.days === 1) return 'hour' as const;
  const requested = params.get('interval');
  return requested === 'week' || requested === 'month' ? requested : ('day' as const);
}

type DB = ReturnType<typeof openDatabase>;
function pageviewScope(siteId: string, period: ReportPeriod, path?: string, filters: Filters = {}) {
  return and(
    eq(hits.site_id, siteId),
    eq(hits.kind, 'pageview'),
    gte(hits.created_at, period.since),
    lt(hits.created_at, period.until),
    path === undefined ? undefined : eq(hits.path, path),
    hitFilter(filters),
  );
}

// Weekly and monthly buckets start on their first date inside the range.
function bucketStart(day: string, interval: 'week' | 'month', since: number) {
  const time = Date.parse(`${day}T00:00:00.000Z`);
  const date = new Date(time);
  const start =
    interval === 'week'
      ? time - ((date.getUTCDay() + 6) % 7) * DAY
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  return new Date(Math.max(start, since)).toISOString().slice(0, 10);
}

export function viewSeries(
  db: DB,
  siteId: string,
  period: ReportPeriod,
  path?: string,
  filters: Filters = {},
  interval: ChartInterval = period.days === 1 ? 'hour' : 'day',
) {
  const scope = pageviewScope(siteId, period, path, filters);
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
      const date = new Date(period.since + index * (hourly ? 3600000 : DAY)).toISOString();
      const day = hourly ? date.slice(0, 13).replace('T', ' ') + ':00' : date.slice(0, 10);
      return { day, count: counts.get(day) || 0 };
    });
  }
  const series = buckets(false);
  const granularity =
    period.days === 1 ? ('hour' as const) : interval === 'hour' ? 'day' : interval;
  let chartSeries = series;
  if (granularity === 'hour') chartSeries = buckets(true);
  else if (granularity !== 'day') {
    const grouped = new Map<string, number>();
    for (const row of series) {
      const key = bucketStart(row.day, granularity, period.since);
      grouped.set(key, (grouped.get(key) || 0) + row.count);
    }
    chartSeries = Array.from(grouped, ([day, count]) => ({ day, count }));
  }
  return { series, chartSeries, granularity };
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export function weekdayHours(db: DB, siteId: string, period: ReportPeriod, filters: Filters = {}) {
  const weekday = sql<number>`cast(strftime('%w', ${hits.created_at}/1000, 'unixepoch') as integer)`;
  const hour = sql<number>`cast(strftime('%H', ${hits.created_at}/1000, 'unixepoch') as integer)`;
  const rows = db
    .select({ weekday, hour, count: count() })
    .from(hits)
    .where(pageviewScope(siteId, period, undefined, filters))
    .groupBy(weekday, hour)
    .all();
  const grid = WEEKDAYS.map((day) => ({ day, hours: Array<number>(24).fill(0) }));
  // SQLite numbers Sunday as 0; the grid starts on Monday.
  for (const row of rows) grid[(row.weekday + 6) % 7].hours[row.hour] = row.count;
  return { grid, peak: Math.max(0, ...rows.map((row) => row.count)) };
}
