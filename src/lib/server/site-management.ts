import { desc, eq } from 'drizzle-orm';
import type { openDatabase } from './database';
import { hits, sites } from './schema';

type DB = ReturnType<typeof openDatabase>;
export function renameSite(db: DB, id: string, input: string) {
  const name = input.trim();
  if (!name || name.length > 100)
    return { error: 'Enter a site name of up to 100 characters.', status: 400 };
  const result = db
    .update(sites)
    .set({ name })
    .where(eq(sites.id, id))
    .returning({ id: sites.id })
    .get();
  if (!result) return { error: 'Site not found.', status: 404 };
  return { name, status: 200 };
}
export function collectionStatus(db: DB, id: string) {
  return (
    db
      .select({ lastHit: hits.created_at })
      .from(hits)
      .where(eq(hits.site_id, id))
      .orderBy(desc(hits.created_at))
      .limit(1)
      .get()?.lastHit ?? null
  );
}
