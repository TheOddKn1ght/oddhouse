import { eq, isNotNull } from 'drizzle-orm';
import type { openDatabase } from './database';
import { sites } from './schema';

type DB = ReturnType<typeof openDatabase>;
const DAY = 86400000;
export const RETENTION_OPTIONS = [90, 180, 365, 730] as const;
const BATCH = 2000;

export function setRetention(db: DB, siteId: string, input: string) {
  const days = input === '' ? null : Number(input);
  if (days !== null && !RETENTION_OPTIONS.includes(days as (typeof RETENTION_OPTIONS)[number]))
    return { error: 'Choose a listed retention period.', status: 400 };
  const result = db
    .update(sites)
    .set({ retention_days: days })
    .where(eq(sites.id, siteId))
    .returning({ id: sites.id })
    .get();
  return result ? { error: null, status: 200 } : { error: 'Site not found.', status: 404 };
}

// Keep whole UTC days: the cutoff is the start of the oldest retained day.
export function retentionCutoff(days: number, now = Date.now()) {
  return Math.floor(now / DAY) * DAY - (days - 1) * DAY;
}

const targets = [
  ['hits', 'created_at'],
  ['page_activity', 'created_at'],
  ['journeys', 'started_at'],
] as const;

// Small batches with yields keep collector writes and report reads responsive.
export async function purgeExpired(db: DB, now = Date.now(), pause = () => Promise.resolve()) {
  const deleted = { hits: 0, page_activity: 0, journeys: 0 };
  const expiring = db
    .select({ id: sites.id, days: sites.retention_days })
    .from(sites)
    .where(isNotNull(sites.retention_days))
    .all();
  for (const site of expiring) {
    const cutoff = retentionCutoff(site.days!, now);
    for (const [table, column] of targets) {
      const statement = db.$client.prepare(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE site_id = ? AND ${column} < ? LIMIT ${BATCH})`,
      );
      for (;;) {
        const { changes } = statement.run(site.id, cutoff);
        deleted[table] += changes;
        if (changes < BATCH) break;
        await pause();
      }
    }
  }
  return deleted;
}

let running: Promise<unknown> | undefined;
export function schedulePurge(db: DB) {
  running ??= purgeExpired(db, Date.now(), () => new Promise((resolve) => setTimeout(resolve, 10)))
    .catch((error) => console.error('Retention purge failed.', error))
    .finally(() => (running = undefined));
  return running;
}
