import { createHash } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { openDatabase } from './database';
import type { Hit } from './collection';
import { hits, visits, visitPages } from './schema';

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const PAGE_REPEAT_MS = 5 * 60 * 1000;

export function recordHit(
  db: ReturnType<typeof openDatabase>,
  siteId: string,
  hit: Hit,
  dimensions: { country: string; browser: string },
  now = Date.now(),
) {
  const { session, ...values } = hit;
  return db.transaction((tx) => {
    // Deleting expired visits also removes their deduplication state, never analytics.
    tx.delete(visits)
      .where(lte(visits.last_seen, now - SESSION_IDLE_MS))
      .run();
    if (session) {
      const visitId = createHash('sha256').update(`${siteId}:${session}`).digest('hex');
      tx.insert(visits)
        .values({ id: visitId, site_id: siteId, last_seen: now })
        .onConflictDoUpdate({ target: visits.id, set: { last_seen: now } })
        .run();
      if (hit.kind === 'pageview') {
        const previous = tx
          .select()
          .from(visitPages)
          .where(and(eq(visitPages.visit_id, visitId), eq(visitPages.path, hit.path)))
          .get();
        // Suppressed returns do not extend the window from the last counted view.
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
      .values({ site_id: siteId, ...values, ...dimensions, created_at: now })
      .run();
    return true;
  });
}
