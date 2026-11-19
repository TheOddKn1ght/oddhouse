import { and, eq, sql, type SQL } from 'drizzle-orm';
import { alias, type SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { hits } from './schema';

type HitTable = typeof hits;
export const filterFields = {
  path: { title: 'Page', column: 'path', empty: 'Unknown' },
  referrer: { title: 'Referrer', column: 'referrer', empty: 'Direct / unknown' },
  country: { title: 'Country', column: 'country', empty: 'Unknown' },
  browser: { title: 'Browser', column: 'browser', empty: 'Unknown' },
  device: { title: 'Device', column: 'device', empty: 'Unknown' },
  os: { title: 'OS', column: 'os', empty: 'Unknown' },
  language: { title: 'Language', column: 'language', empty: 'Unknown' },
  utm_source: { title: 'Campaign source', column: 'utm_source', empty: '' },
  utm_medium: { title: 'Campaign medium', column: 'utm_medium', empty: '' },
  utm_campaign: { title: 'Campaign', column: 'utm_campaign', empty: '' },
} as const satisfies Record<string, { title: string; column: keyof HitTable; empty: string }>;
export type FilterKey = keyof typeof filterFields;
export type Filters = Partial<Record<FilterKey, string>>;
export const filterKeys = Object.keys(filterFields) as FilterKey[];

export function parseFilters(params: URLSearchParams): Filters {
  const filters: Filters = {};
  for (const key of filterKeys) {
    const value = params.get(`f_${key}`);
    if (value !== null && value.length <= 2048) filters[key] = value;
  }
  return filters;
}

// Labels match breakdown rows, so filtering by a row reproduces its count.
export function labelExpression(column: SQLiteColumn, empty: string) {
  return empty ? sql<string>`coalesce(nullif(${column}, ''), ${empty})` : sql<string>`${column}`;
}
type FilterColumns = Record<(typeof filterFields)[FilterKey]['column'], SQLiteColumn>;
function conditions(filters: Filters, table: FilterColumns, skip: FilterKey[] = []) {
  return filterKeys
    .filter((key) => filters[key] !== undefined && !skip.includes(key))
    .map((key) => {
      const field = filterFields[key];
      return eq(labelExpression(table[field.column], field.empty), filters[key]!);
    });
}
export function hitFilter(filters: Filters, table: HitTable = hits) {
  const parts = conditions(filters, table);
  return parts.length ? and(...parts) : undefined;
}

// Journey reports count journeys containing at least one matching pageview.
export function journeyFilter(
  filters: Filters,
  journeyId: SQLiteColumn,
  skip: FilterKey[] = [],
): SQL | undefined {
  const matching = alias(hits, 'filter_hits');
  const parts = conditions(filters, matching, skip);
  if (!parts.length) return undefined;
  return sql`exists (select 1 from ${hits} ${sql.identifier('filter_hits')} where ${matching.journey_id} = ${journeyId} and ${matching.kind} = 'pageview' and ${and(...parts)})`;
}
