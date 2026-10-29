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
    device: text('device').notNull().default(''),
    os: text('os').notNull().default(''),
    language: text('language').notNull().default(''),
    utm_source: text('utm_source').notNull().default(''),
    utm_medium: text('utm_medium').notNull().default(''),
    utm_campaign: text('utm_campaign').notNull().default(''),
    target: text('target').notNull().default(''),
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
    journey_id: text('journey_id'),
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

// Durable visit summaries have random IDs, not reusable browser identifiers.
export const journeys = sqliteTable(
  'journeys',
  {
    id: text('id').primaryKey().notNull(),
    site_id: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    started_at: integer('started_at').notNull(),
    last_seen: integer('last_seen').notNull(),
    entry_path: text('entry_path').notNull(),
    exit_path: text('exit_path').notNull(),
    utm_source: text('utm_source').notNull().default(''),
    utm_medium: text('utm_medium').notNull().default(''),
    utm_campaign: text('utm_campaign').notNull().default(''),
  },
  (table) => [
    index('journeys_site_start').on(table.site_id, table.started_at),
    index('journeys_site_seen').on(table.site_id, table.last_seen),
  ],
);
export const pageActivity = sqliteTable(
  'page_activity',
  {
    id: text('id').primaryKey().notNull(),
    site_id: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    active_ms: integer('active_ms').notNull().default(0),
    max_scroll: integer('max_scroll').notNull().default(0),
    created_at: integer('created_at').notNull(),
  },
  (table) => [index('activity_site_time').on(table.site_id, table.created_at)],
);
