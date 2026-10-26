import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/lib/server/database';
import { admins, hits, sessions, sites } from '../src/lib/server/schema';

test('fresh schema migrates once and enforces foreign keys and hit kinds', () => {
  const db = openDatabase(':memory:');
  try {
    expect(db.select().from(sites).all()).toEqual([]);
    expect(() =>
      db.insert(hits).values({ site_id: 'absent', kind: 'event', path: '/', created_at: 1 }).run(),
    ).toThrow();
    db.insert(sites)
      .values({ id: 'site', name: 'Blog', origin: 'https://blog.example', created_at: 1 })
      .run();
    expect(() =>
      db.$client.exec(
        "INSERT INTO hits(site_id,kind,path,created_at) VALUES ('site','invalid','/',1)",
      ),
    ).toThrow();
    const rows = db.$client.query('SELECT * FROM __drizzle_migrations').all();
    expect(rows).toHaveLength(2);
  } finally {
    db.$client.close();
  }
});

test('adopting the original database preserves data, sessions and cascade behavior across restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddhouse-migration-'));
  const path = join(dir, 'old.sqlite');
  const legacy = new Database(path, { create: true });
  try {
    legacy.exec(readFileSync(new URL('./fixtures/legacy-schema.sql', import.meta.url), 'utf8'));
    legacy.exec(`
      INSERT INTO admins VALUES ('admin','existing-hash');
      INSERT INTO sessions VALUES ('session-hash','admin',9999999999999);
      INSERT INTO sites VALUES ('blog','Blog','https://blog.example',1);
      INSERT INTO hits(site_id,kind,path,created_at) VALUES ('blog','pageview','/existing',2);
    `);
  } finally {
    legacy.close();
  }
  try {
    for (let i = 0; i < 2; i++) {
      const db = openDatabase(path);
      try {
        expect(db.select().from(admins).get()?.password_hash).toBe('existing-hash');
        expect(db.select().from(sessions).get()?.token_hash).toBe('session-hash');
        expect(db.select().from(hits).get()?.path).toBe('/existing');
        expect(db.$client.query('SELECT * FROM __drizzle_migrations').all()).toHaveLength(2);
      } finally {
        db.$client.close();
      }
    }
    const db = openDatabase(path);
    try {
      db.delete(admins).where(eq(admins.username, 'admin')).run();
      expect(db.select().from(sessions).all()).toHaveLength(0);
      db.delete(sites).where(eq(sites.id, 'blog')).run();
      expect(db.select().from(hits).all()).toHaveLength(0);
    } finally {
      db.$client.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
