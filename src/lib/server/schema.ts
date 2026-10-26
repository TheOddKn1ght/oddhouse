import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const admins = sqliteTable('admins', {
  username: text('username').primaryKey().notNull(),
  password_hash: text('password_hash').notNull(),
});
export const sessions = sqliteTable('sessions', {
  token_hash: text('token_hash').primaryKey().notNull(),
  username: text('username')
    .notNull()
    .references(() => admins.username, { onDelete: 'cascade' }),
  expires_at: integer('expires_at').notNull(),
});
export const sites = sqliteTable('sites', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  origin: text('origin').notNull().unique(),
  created_at: integer('created_at').notNull(),
});
export const hits = sqliteTable(
  'hits',
  {
    id: integer('id').primaryKey(),
    site_id: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['pageview', 'event'] }).notNull(),
    path: text('path').notNull(),
    title: text('title').notNull().default(''),
    referrer: text('referrer').notNull().default(''),
    event: text('event').notNull().default(''),
    created_at: integer('created_at').notNull(),
    country: text('country').notNull().default(''),
    browser: text('browser').notNull().default(''),
  },
  (table) => [
    index('hits_site_time').on(table.site_id, table.created_at),
    check('hits_kind_check', sql`${table.kind} IN ('pageview', 'event')`),
  ],
);
export type Site = typeof sites.$inferSelect;

// Anonymous visit IDs are hashes of a site-scoped token; these rows are transient.
export const visits = sqliteTable(
  'visits',
  {
    id: text('id').primaryKey().notNull(),
    site_id: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    last_seen: integer('last_seen').notNull(),
  },
  (table) => [index('visits_last_seen').on(table.last_seen)],
);
export const visitPages = sqliteTable(
  'visit_pages',
  {
    visit_id: text('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    last_counted: integer('last_counted').notNull(),
  },
  (table) => [primaryKey({ columns: [table.visit_id, table.path] })],
);
