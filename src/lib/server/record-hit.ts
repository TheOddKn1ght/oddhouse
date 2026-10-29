import { createHash, randomUUID } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { HitDimensions } from './dimensions';
import type { Hit } from './collection';
import { hits, visits, visitPages, journeys, pageActivity } from './schema';

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const PAGE_REPEAT_MS = 5 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export function recordHit(
  db: ReturnType<typeof openDatabase>,
  siteId: string,
  hit: Hit,
  dimensions: HitDimensions,
  now = Date.now(),
) {
  return db.transaction((tx) => {
    tx.delete(visits)
      .where(lte(visits.last_seen, now - SESSION_IDLE_MS))
      .run();
    const visitId = hit.session ? hash(`${siteId}:${hit.session}`) : '';
    if (hit.kind === 'engagement') {
      const visit = tx.select().from(visits).where(eq(visits.id, visitId)).get();
      if (!visit?.journey_id) return false;
      const activity = tx
        .select()
        .from(pageActivity)
        .where(eq(pageActivity.id, hash(`${visit.journey_id}:${hit.page}`)))
        .get();
      if (!activity || activity.path !== hit.path) return false;
      tx.update(pageActivity)
        .set({
          active_ms: Math.max(
            activity.active_ms,
            Math.min(hit.active_ms!, Math.max(0, now - activity.created_at + 2000)),
          ),
          max_scroll: Math.max(activity.max_scroll, hit.max_scroll!),
        })
        .where(eq(pageActivity.id, activity.id))
        .run();
      tx.update(visits).set({ last_seen: now }).where(eq(visits.id, visitId)).run();
      tx.update(journeys).set({ last_seen: now }).where(eq(journeys.id, visit.journey_id)).run();
      return true;
    }
    let campaign = {
      utm_source: hit.utm_source || '',
      utm_medium: hit.utm_medium || '',
      utm_campaign: hit.utm_campaign || '',
    };
    if (visitId) {
      tx.insert(visits)
        .values({ id: visitId, site_id: siteId, last_seen: now })
        .onConflictDoUpdate({ target: visits.id, set: { last_seen: now } })
        .run();
      let visit = tx.select().from(visits).where(eq(visits.id, visitId)).get()!;
      if (hit.kind === 'pageview' && !visit.journey_id) {
        const journeyId = randomUUID();
        tx.insert(journeys)
          .values({
            id: journeyId,
            site_id: siteId,
            started_at: now,
            last_seen: now,
            entry_path: hit.path,
            exit_path: hit.path,
            ...campaign,
          })
          .run();
        tx.update(visits).set({ journey_id: journeyId }).where(eq(visits.id, visitId)).run();
        visit = { ...visit, journey_id: journeyId };
      }
      if (visit.journey_id) {
        const journey = tx.select().from(journeys).where(eq(journeys.id, visit.journey_id)).get()!;
        campaign = {
          utm_source: journey.utm_source,
          utm_medium: journey.utm_medium,
          utm_campaign: journey.utm_campaign,
        };
        tx.update(journeys)
          .set({ last_seen: now, ...(hit.kind === 'pageview' ? { exit_path: hit.path } : {}) })
          .where(eq(journeys.id, journey.id))
          .run();
      }
      if (hit.kind === 'pageview') {
        if (hit.page)
          tx.insert(pageActivity)
            .values({
              id: hash(`${visit.journey_id}:${hit.page}`),
              site_id: siteId,
              path: hit.path,
              created_at: now,
            })
            .onConflictDoNothing()
            .run();
        const previous = tx
          .select()
          .from(visitPages)
          .where(and(eq(visitPages.visit_id, visitId), eq(visitPages.path, hit.path)))
          .get();
        if (previous && now - previous.last_counted < PAGE_REPEAT_MS) return false;
        tx.insert(visitPages)
          .values({ visit_id: visitId, path: hit.path, last_counted: now })
          .onConflictDoUpdate({
            target: [visitPages.visit_id, visitPages.path],
            set: { last_counted: now },
          })
          .run();
      }
    }
    tx.insert(hits)
      .values({
        site_id: siteId,
        kind: hit.kind,
        path: hit.path,
        title: hit.title,
        referrer: hit.referrer,
        event: hit.event,
        target: hit.target || '',
        ...campaign,
        ...dimensions,
        created_at: now,
      })
      .run();
    return true;
  });
}
