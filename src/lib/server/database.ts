import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  try {
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    const db = drizzle(sqlite, { schema });
    // Both the Bun server and admin CLI apply the committed migrations.
    // The initial migration also adopts the pre-Drizzle schema without dropping data.
    migrate(db, { migrationsFolder: resolve('drizzle') });
    return db;
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
let connection: ReturnType<typeof openDatabase> | undefined;
export function database() {
  return (connection ??= openDatabase(process.env.DATABASE_PATH || 'data/oddhouse.sqlite'));
}
export type { Site } from './schema';
export function sites() {
  return database()
    .select()
    .from(schema.sites)
    .orderBy(schema.sites.created_at, schema.sites.name)
    .all();
}
