import { and, count, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { hits, journeys } from './schema';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { breakdownRows, defaultBreakdownOptions, type Breakdown } from './breakdowns';
import { viewSeries, weekdayHours, type ChartInterval } from './view-series';
import { activityReports } from './activity-reports';
import { hitFilter, journeyFilter, type Filters } from './hit-filters';
import { funnelReport, goalReport } from './conversions';

type DB = ReturnType<typeof openDatabase>;
export function dashboardReport(
  db: DB,
  siteId: string,
  period: ReportPeriod,
  filters: Filters = {},
  interval?: ChartInterval,
) {
  const { since, until, days } = period;
  const options = { ...defaultBreakdownOptions(), filters };
  const rows = (key: Breakdown) => breakdownRows(db, siteId, period, key, options);
  const pages = rows('pages').map((row) => ({ path: row.label, count: row.count }));
  const referrers = rows('referrers').map((row) => ({
    referrer: row.label === 'Direct / unknown' ? '' : row.label,
    value: row.label,
    count: row.count,
  }));
  const events = rows('events').map((row) => ({ event: row.label, count: row.count }));
  const countries = rows('countries').map((row) => ({
    country: row.label === 'Unknown' ? '' : row.label,
    value: row.label,
    name: row.name,
    count: row.count,
  }));
  const browsers = rows('browsers').map((row) => ({ browser: row.label, count: row.count }));
  const simple = (key: Breakdown) =>
    rows(key).map((row) => ({ label: row.name, value: row.label, count: row.count }));
  const devices = simple('devices');
  const operatingSystems = simple('os');
  const languages = simple('languages');
  const journeysMatch = journeyFilter(filters, journeys.id);

  function summary(from: number, to: number) {
    const totals = db
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
          gte(hits.created_at, from),
          lt(hits.created_at, to),
          hitFilter(filters),
        ),
      )
      .get()!;
    const started = and(
      eq(journeys.site_id, siteId),
      gte(journeys.started_at, from),
      lt(journeys.started_at, to),
      journeysMatch,
    );
    const sessions = db.select({ count: count() }).from(journeys).where(started).get()!.count;
    return { ...totals, sessions };
  }
  // Journeys from before the pageview counter have zero pageviews and are excluded.
  function quality(from: number, to: number) {
    const row = db
      .select({
        sessions: count(),
        bounces:
          sql<number>`coalesce(sum(case when ${journeys.pageviews}=1 then 1 else 0 end),0)`.mapWith(
            Number,
          ),
        pageviews: sql<number>`coalesce(sum(${journeys.pageviews}),0)`.mapWith(Number),
        durationMs:
          sql<number>`coalesce(sum(${journeys.last_seen}-${journeys.started_at}),0)`.mapWith(
            Number,
          ),
      })
      .from(journeys)
      .where(
        and(
          eq(journeys.site_id, siteId),
          gte(journeys.started_at, from),
          lt(journeys.started_at, to),
          gt(journeys.pageviews, 0),
          journeysMatch,
        ),
      )
      .get()!;
    return {
      sessions: row.sessions,
      bounceRate: row.sessions ? row.bounces / row.sessions : 0,
      pagesPerSession: row.sessions ? row.pageviews / row.sessions : 0,
      averageDurationMs: row.sessions ? row.durationMs / row.sessions : 0,
    };
  }
  return {
    ...activityReports(db, siteId, since, Date.now(), until, filters),
    days,
    totals: summary(since, until),
    previous: summary(period.previousSince, period.previousUntil),
    quality: quality(since, until),
    previousQuality: quality(period.previousSince, period.previousUntil),
    ...viewSeries(db, siteId, period, undefined, filters, interval),
    heatmap: weekdayHours(db, siteId, period, filters),
    goals: goalReport(db, siteId, period, filters),
    funnels: funnelReport(db, siteId, period, filters),
    pages,
    referrers,
    events,
    countries,
    browsers,
    devices,
    operatingSystems,
    languages,
  };
}
