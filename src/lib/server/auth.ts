import { createHash, randomBytes } from 'node:crypto';
import { database } from './database';
import { and, eq, gt, lte } from 'drizzle-orm';
import { sessions } from './schema';

export const cookieName = 'oddhouse_session';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function userForSession(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (
    database()
      .select({ username: sessions.username })
      .from(sessions)
      .where(and(eq(sessions.token_hash, digest(token)), gt(sessions.expires_at, Date.now())))
      .get()?.username ?? null
  );
}
export function createSession(username: string) {
  const db = database();
  db.delete(sessions).where(lte(sessions.expires_at, Date.now())).run();
  const token = randomBytes(32).toString('hex');
  db.insert(sessions)
    .values({ token_hash: digest(token), username, expires_at: Date.now() + 7 * 86400000 })
    .run();
  return token;
}
export function deleteSession(token: string) {
  database()
    .delete(sessions)
    .where(eq(sessions.token_hash, digest(token)))
    .run();
}

// Bound memory and expire buckets so arbitrary source addresses cannot grow it indefinitely.
const attempts = new Map<string, { count: number; until: number }>();
export function allowLogin(address: string, now = Date.now()) {
  for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
  let bucket = attempts.get(address);
  if (!bucket) {
    if (attempts.size >= 10000) return false;
    bucket = { count: 0, until: now + 15 * 60000 };
    attempts.set(address, bucket);
  }
  return ++bucket.count <= 10;
}
