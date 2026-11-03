import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { hits } from './schema';
import type { openDatabase } from './database';
import type { ReportPeriod } from './report-period';

export const breakdowns = {
  pages: { title: 'Pages', label: 'Path', unit: 'Pageviews', column: hits.path, kind: 'pageview' },
  referrers: {
    title: 'Referrers',
    label: 'Source',
    unit: 'Pageviews',
    column: hits.referrer,
    kind: 'pageview',
    empty: 'Direct / unknown',
  },
  events: { title: 'Events', label: 'Event', unit: 'Events', column: hits.event, kind: 'event' },
  countries: {
    title: 'Countries',
    label: 'Country code',
    unit: 'Pageviews',
    column: hits.country,
    kind: 'pageview',
  },
  browsers: {
    title: 'Browsers',
    label: 'Browser',
    unit: 'Pageviews',
    column: hits.browser,
    kind: 'pageview',
  },
  devices: {
    title: 'Devices',
    label: 'Device',
    unit: 'Pageviews',
    column: hits.device,
    kind: 'pageview',
  },
  os: {
    title: 'Operating systems',
    label: 'OS',
    unit: 'Pageviews',
    column: hits.os,
    kind: 'pageview',
  },
  languages: {
    title: 'Languages',
    label: 'Language code',
    unit: 'Pageviews',
    column: hits.language,
    kind: 'pageview',
  },
  outbound: {
    title: 'Outbound clicks',
    label: 'Target',
    unit: 'Clicks',
    column: hits.target,
    kind: 'event',
    event: 'outbound_click',
  },
  downloads: {
    title: 'Downloads',
    label: 'Target',
    unit: 'Clicks',
    column: hits.target,
    kind: 'event',
    event: 'file_download',
  },
} as const;
export type Breakdown = keyof typeof breakdowns;
export const PAGE_SIZE = 50;
export const EXPORT_LIMIT = 10000;
export function isBreakdown(value: string): value is Breakdown {
  return Object.hasOwn(breakdowns, value);
}
export function breakdownOptions(params: URLSearchParams) {
  const requestedPage = Number(params.get('page') || 1);
  return {
    query: (params.get('q') || '').trim().slice(0, 200),
    sort: params.get('sort') === 'label' ? ('label' as const) : ('count' as const),
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}
export function displayLabel(key: Breakdown, label: string) {
  if (label === 'Unknown') return label;
  try {
    if (key === 'countries')
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(label) || label;
    if (key === 'languages')
      return new Intl.DisplayNames(['en'], { type: 'language' }).of(label) || label;
  } catch {
    /* Preserve old or unrecognized codes. */
  }
  return label;
}

type DB = ReturnType<typeof openDatabase>;
type Bounds = Pick<ReportPeriod, 'since' | 'until'>;
type Options = ReturnType<typeof breakdownOptions>;
const defaults = () => breakdownOptions(new URLSearchParams());
function breakdownScope(siteId: string, period: Bounds, key: Breakdown, options: Options) {
  const definition = breakdowns[key];
  const empty = 'empty' in definition ? definition.empty : 'Unknown';
  const label = sql<string>`coalesce(nullif(${definition.column}, ''), ${empty})`;
  const scope = and(
    eq(hits.site_id, siteId),
    gte(hits.created_at, period.since),
    lt(hits.created_at, period.until),
    eq(hits.kind, definition.kind),
    'event' in definition
      ? and(eq(hits.event, definition.event), sql`${hits.target} != ''`)
      : undefined,
    options.query
      ? sql`instr(oddhouse_lower(${label}), ${options.query.normalize('NFC').toLowerCase()}) > 0`
      : undefined,
  );
  return { label, scope };
}
export function breakdownRows(
  db: DB,
  siteId: string,
  period: Bounds,
  key: Breakdown,
  options = defaults(),
  limit = 20,
  offset = 0,
) {
  const { label, scope } = breakdownScope(siteId, period, key, options);
  return db
    .select({ label, count: count() })
    .from(hits)
    .where(scope)
    .groupBy(label)
    .orderBy(...(options.sort === 'label' ? [asc(label)] : [desc(count()), asc(label)]))
    .limit(limit)
    .offset(offset)
    .all()
    .map((row) => ({ ...row, name: displayLabel(key, row.label) }));
}
export function breakdownReport(
  db: DB,
  siteId: string,
  period: Bounds,
  key: Breakdown,
  options = defaults(),
  limit = PAGE_SIZE,
) {
  const { label, scope } = breakdownScope(siteId, period, key, options);
  const totals = db
    .select({ rows: sql<number>`count(distinct ${label})`.mapWith(Number), count: count() })
    .from(hits)
    .where(scope)
    .get()!;
  const pages = Math.max(1, Math.ceil(totals.rows / limit));
  const page = Math.min(options.page, pages);
  const rows = breakdownRows(db, siteId, period, key, options, limit, (page - 1) * limit);
  return { rows, totals, page, pages, pageSize: limit };
}
