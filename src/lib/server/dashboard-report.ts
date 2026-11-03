import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { hits, journeys } from './schema';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';
import { breakdownRows, type Breakdown } from './breakdowns';
import { viewSeries } from './view-series';
import { activityReports } from './activity-reports';

type DB = ReturnType<typeof openDatabase>;
export function dashboardReport(db: DB, siteId: string, period: ReportPeriod) {
  const { since, until, days } = period;
  const rows = (key: Breakdown) => breakdownRows(db, siteId, period, key);
  const pages = rows('pages').map((row) => ({ path: row.label, count: row.count }));
  const referrers = rows('referrers').map((row) => ({
    referrer: row.label === 'Direct / unknown' ? '' : row.label,
    count: row.count,
  }));
  const events = rows('events').map((row) => ({ event: row.label, count: row.count }));
  const countries = rows('countries').map((row) => ({
    country: row.label === 'Unknown' ? '' : row.label,
    name: row.name,
    count: row.count,
  }));
  const browsers = rows('browsers').map((row) => ({ browser: row.label, count: row.count }));
  const simple = (key: Breakdown) =>
    rows(key).map((row) => ({ label: row.name, count: row.count }));
  const devices = simple('devices');
  const operatingSystems = simple('os');
  const languages = simple('languages');

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
      .where(and(eq(hits.site_id, siteId), gte(hits.created_at, from), lt(hits.created_at, to)))
      .get()!;
    const sessions = db
      .select({ count: count() })
      .from(journeys)
      .where(
        and(
          eq(journeys.site_id, siteId),
          gte(journeys.started_at, from),
          lt(journeys.started_at, to),
        ),
      )
      .get()!.count;
    return { ...totals, sessions };
  }
  return {
    ...activityReports(db, siteId, since, Date.now(), until),
    days,
    totals: summary(since, until),
    previous: summary(period.previousSince, period.previousUntil),
    ...viewSeries(db, siteId, period),
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
