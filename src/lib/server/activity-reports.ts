import { and, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import type { openDatabase } from './database';
import { hits, journeys, pageActivity } from './schema';
import { breakdownRows } from './breakdowns';
import { SESSION_IDLE_MS } from './record-hit';

type DB = ReturnType<typeof openDatabase>;
export function liveActivity(db: DB, siteId: string, now = Date.now()) {
  const active = db
    .select({ count: count() })
    .from(journeys)
    .where(and(eq(journeys.site_id, siteId), gte(journeys.last_seen, now - 60000)))
    .get()!.count;
  const recent = db
    .select({ id: hits.id, path: hits.path, created_at: hits.created_at })
    .from(hits)
    .where(
      and(
        eq(hits.site_id, siteId),
        eq(hits.kind, 'pageview'),
        gte(hits.created_at, now - 5 * 60000),
      ),
    )
    .orderBy(desc(hits.created_at), desc(hits.id))
    .limit(20)
    .all();
  return { siteId, active, recent, updatedAt: now };
}
export function activityReports(
  db: DB,
  siteId: string,
  since: number,
  now = Date.now(),
  until = Number.MAX_SAFE_INTEGER,
) {
  const views = and(
    eq(hits.site_id, siteId),
    gte(hits.created_at, since),
    lt(hits.created_at, until),
    eq(hits.kind, 'pageview'),
  );
  const campaigns = db
    .select({
      source: hits.utm_source,
      medium: hits.utm_medium,
      campaign: hits.utm_campaign,
      count: count(),
    })
    .from(hits)
    .where(
      and(
        views,
        sql`(${hits.utm_source} != '' OR ${hits.utm_medium} != '' OR ${hits.utm_campaign} != '')`,
      ),
    )
    .groupBy(hits.utm_source, hits.utm_medium, hits.utm_campaign)
    .orderBy(desc(count()), hits.utm_source, hits.utm_medium, hits.utm_campaign)
    .limit(20)
    .all();
  const entries = db
    .select({ path: journeys.entry_path, count: count() })
    .from(journeys)
    .where(
      and(
        eq(journeys.site_id, siteId),
        gte(journeys.started_at, since),
        lt(journeys.started_at, until),
      ),
    )
    .groupBy(journeys.entry_path)
    .orderBy(desc(count()), journeys.entry_path)
    .limit(20)
    .all();
  const exits = db
    .select({ path: journeys.exit_path, count: count() })
    .from(journeys)
    .where(
      and(
        eq(journeys.site_id, siteId),
        gte(journeys.last_seen, since),
        lt(journeys.last_seen, until),
        lte(journeys.last_seen, now - SESSION_IDLE_MS),
      ),
    )
    .groupBy(journeys.exit_path)
    .orderBy(desc(count()), journeys.exit_path)
    .limit(20)
    .all();
  const engagement = db
    .select({
      path: pageActivity.path,
      active_ms: sql<number>`sum(${pageActivity.active_ms})`.mapWith(Number),
      max_scroll: sql<number>`max(${pageActivity.max_scroll})`.mapWith(Number),
    })
    .from(pageActivity)
    .where(
      and(
        eq(pageActivity.site_id, siteId),
        gte(pageActivity.created_at, since),
        lt(pageActivity.created_at, until),
      ),
    )
    .groupBy(pageActivity.path)
    .orderBy(desc(sql`sum(${pageActivity.active_ms})`), pageActivity.path)
    .limit(20)
    .all();
  return {
    campaigns,
    outboundLinks: breakdownRows(db, siteId, { since, until }, 'outbound').map((row) => ({
      target: row.label,
      count: row.count,
    })),
    downloads: breakdownRows(db, siteId, { since, until }, 'downloads').map((row) => ({
      target: row.label,
      count: row.count,
    })),
    entries,
    exits,
    engagement,
    live: liveActivity(db, siteId, now),
  };
}
