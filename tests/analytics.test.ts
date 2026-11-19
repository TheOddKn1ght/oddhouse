import { expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/lib/server/database';
import { recordHit } from '../src/lib/server/record-hit';
import { reportPeriod } from '../src/lib/server/report-period';
import { dashboardReport } from '../src/lib/server/dashboard-report';
import { breakdownReport, breakdownOptions } from '../src/lib/server/breakdowns';
import { parseFilters } from '../src/lib/server/hit-filters';
import { chartInterval, viewSeries, weekdayHours } from '../src/lib/server/view-series';
import {
  createFunnel,
  createGoal,
  deleteDefinition,
  funnelSteps,
  parseStep,
  siteGoals,
} from '../src/lib/server/conversions';
import { purgeExpired, retentionCutoff, setRetention } from '../src/lib/server/retention';
import { reportCsv } from '../src/lib/server/report-csv';
import { hits, journeys, pageActivity, sites } from '../src/lib/server/schema';
import type { Hit } from '../src/lib/server/collection';

const DAY = 86400000;
const now = Date.parse('2026-11-03T12:00:00Z');
const period = (query: string) => reportPeriod(new URLSearchParams(query), now);
const desktop = {
  country: 'DE',
  browser: 'Firefox',
  device: 'Desktop',
  os: 'Linux',
  language: 'de',
};
const mobile = { country: '', browser: 'Safari', device: 'Mobile', os: 'iOS', language: 'en' };
const session = (n: number) => `9acb925a-f361-49df-98d8-${String(n).padStart(12, '0')}`;
const view = (path: string, n: number, extra: Partial<Hit> = {}): Hit => ({
  kind: 'pageview',
  path,
  title: '',
  referrer: '',
  event: '',
  session: session(n),
  ...extra,
});
const event = (name: string, n: number, path = '/'): Hit => ({
  ...view(path, n),
  kind: 'event',
  event: name,
});

function setup() {
  const db = openDatabase(':memory:');
  for (const id of ['one', 'two'])
    db.insert(sites)
      .values({ id, name: id, origin: `https://${id}.example`, created_at: 0 })
      .run();
  return db;
}

test('hits and engagement rows link to journeys, and journeys count stored pageviews and events', () => {
  const db = setup();
  try {
    const page = '11111111-2222-4333-8444-555555555555';
    recordHit(db, 'one', view('/a', 1, { page }), desktop, now);
    recordHit(db, 'one', view('/a', 1), desktop, now + 1000); // suppressed repeat
    recordHit(db, 'one', view('/b', 1), desktop, now + 2000);
    recordHit(db, 'one', event('signup', 1), desktop, now + 3000);
    recordHit(db, 'one', { ...event('manual', 0), session: undefined }, desktop, now + 4000);
    const journey = db.select().from(journeys).get()!;
    expect(journey).toMatchObject({ pageviews: 2, events: 1 });
    const stored = db.select().from(hits).all();
    expect(stored.filter((hit) => hit.journey_id === journey.id)).toHaveLength(3);
    expect(stored.find((hit) => hit.event === 'manual')?.journey_id).toBeNull();
    expect(db.select().from(pageActivity).get()?.journey_id).toBe(journey.id);
  } finally {
    db.$client.close();
  }
});

function seedTraffic(db: ReturnType<typeof setup>) {
  // Session 1: desktop, google, bounces. Session 2: desktop, three pages and a signup.
  // Session 3: mobile, two pages. Session 4 belongs to another site.
  recordHit(db, 'one', view('/', 1, { referrer: 'google.com' }), desktop, now - 3600000);
  recordHit(db, 'one', view('/', 2), desktop, now - 3000000);
  recordHit(db, 'one', view('/pricing', 2), desktop, now - 2990000);
  recordHit(db, 'one', view('/checkout/pay', 2), desktop, now - 2980000);
  recordHit(db, 'one', event('signup', 2, '/checkout/pay'), desktop, now - 2900000);
  recordHit(db, 'one', view('/checkout/pay', 3), mobile, now - 2000000);
  recordHit(db, 'one', view('/pricing', 3), mobile, now - 1990000);
  recordHit(db, 'two', view('/', 4), desktop, now - 1000000);
}

test('filters narrow hit reports by exact displayed labels and journeys by matching pageviews', () => {
  const db = setup();
  try {
    seedTraffic(db);
    const range = period('days=1');
    const all = dashboardReport(db, 'one', range);
    expect(all.totals).toEqual({ pageviews: 6, events: 1, sessions: 3 });

    const germany = dashboardReport(db, 'one', range, { country: 'DE' });
    expect(germany.totals).toEqual({ pageviews: 4, events: 1, sessions: 2 });
    expect(germany.devices).toEqual([{ label: 'Desktop', value: 'Desktop', count: 4 }]);

    // Empty stored countries display as Unknown and filter by that label.
    const unknown = dashboardReport(db, 'one', range, { country: 'Unknown' });
    expect(unknown.totals).toEqual({ pageviews: 2, events: 0, sessions: 1 });
    expect(unknown.entries).toEqual([{ path: '/checkout/pay', count: 1 }]);

    const direct = dashboardReport(db, 'one', range, { referrer: 'Direct / unknown' });
    expect(direct.totals.pageviews).toBe(5);

    // A path filter counts journeys that viewed the page, but only its own pageviews.
    const pricing = dashboardReport(db, 'one', range, { path: '/pricing' });
    expect(pricing.totals).toMatchObject({ pageviews: 2, sessions: 2 });
    expect(pricing.quality).toMatchObject({ sessions: 2, pagesPerSession: 2.5 });

    const explorer = breakdownReport(
      db,
      'one',
      range,
      'pages',
      breakdownOptions(new URLSearchParams('f_device=Mobile&q=pri')),
    );
    expect(explorer.rows.map((row) => [row.label, row.count])).toEqual([['/pricing', 1]]);
    expect(parseFilters(new URLSearchParams('f_country=&f_bogus=x&f_os=iOS'))).toEqual({
      country: '',
      os: 'iOS',
    });
  } finally {
    db.$client.close();
  }
});

test('session quality uses counted pageviews and excludes journeys recorded before the counter', () => {
  const db = setup();
  try {
    seedTraffic(db);
    db.insert(journeys)
      .values({
        id: 'legacy',
        site_id: 'one',
        started_at: now - 1000,
        last_seen: now,
        entry_path: '/',
        exit_path: '/',
      })
      .run();
    const report = dashboardReport(db, 'one', period('days=1'));
    expect(report.totals.sessions).toBe(4);
    expect(report.quality.sessions).toBe(3);
    expect(report.quality.bounceRate).toBeCloseTo(1 / 3);
    expect(report.quality.pagesPerSession).toBeCloseTo(2);
    // Durations: 0, 100s (event included), 10s.
    expect(report.quality.averageDurationMs).toBeCloseTo(110000 / 3);
    expect(report.previousQuality).toEqual({
      sessions: 0,
      bounceRate: 0,
      pagesPerSession: 0,
      averageDurationMs: 0,
    });
  } finally {
    db.$client.close();
  }
});

test('goal steps validate input and match exact events, exact paths and literal prefixes', () => {
  expect(parseStep('event', ' signup ')).toEqual({ kind: 'event', value: 'signup' });
  expect(parseStep('event', 'sign up')).toBeNull();
  expect(parseStep('path', '/blog/*')).toEqual({ kind: 'path', value: '/blog/*' });
  for (const bad of ['blog', '/a?b', '//x', '/a*b*', '/a#b'])
    expect(parseStep('path', bad)).toBeNull();
  expect(parseStep('other', '/')).toBeNull();

  const db = setup();
  try {
    seedTraffic(db);
    recordHit(db, 'one', view('/checkouts', 5), desktop, now - 100000);
    recordHit(db, 'one', view('/a%b', 6), desktop, now - 90000);
    recordHit(db, 'one', view('/axb', 7), desktop, now - 80000);
    // Unlinked historical completion.
    db.insert(hits)
      .values({ site_id: 'one', kind: 'event', path: '/', event: 'signup', created_at: now - 5000 })
      .run();
    for (const [name, kind, value] of [
      ['Signup', 'event', 'signup'],
      ['Checkout', 'path', '/checkout/*'],
      ['Percent', 'path', '/a%*'],
    ])
      expect(createGoal(db, 'one', { name, kind, value }).error).toBeNull();
    expect(createGoal(db, 'one', { name: '', kind: 'event', value: 'x' }).error).toBeTruthy();
    const goals = Object.fromEntries(
      dashboardReport(db, 'one', period('days=1')).goals.map((goal) => [goal.name, goal]),
    );
    expect(goals.Signup).toMatchObject({ conversions: 1, completions: 2 });
    expect(goals.Signup.rate).toBeCloseTo(1 / 6);
    expect(goals.Checkout).toMatchObject({ conversions: 2, completions: 2 });
    expect(goals.Percent).toMatchObject({ conversions: 1, completions: 1 });
    expect(
      dashboardReport(db, 'one', period('days=1'), { device: 'Mobile' }).goals.find(
        (goal) => goal.name === 'Signup',
      ),
    ).toMatchObject({
      conversions: 0,
      rate: 0,
    });

    const id = siteGoals(db, 'one')[0].id;
    deleteDefinition(db, 'two', 'goal', id);
    expect(siteGoals(db, 'one')).toHaveLength(3);
    deleteDefinition(db, 'one', 'goal', id);
    expect(siteGoals(db, 'one')).toHaveLength(2);
  } finally {
    db.$client.close();
  }
});

test('funnels require ordered, distinct hits within one journey', () => {
  const db = setup();
  try {
    seedTraffic(db);
    const range = period('days=1');
    const steps = [
      { kind: 'path', value: '/pricing' },
      { kind: 'path', value: '/checkout/*' },
      { kind: 'event', value: 'signup' },
    ] as const;
    // Session 3 visits checkout before pricing, so only session 2 progresses.
    expect(funnelSteps(db, 'one', range, [...steps]).map((step) => step.sessions)).toEqual([
      2, 1, 1,
    ]);
    const repeated = funnelSteps(db, 'one', range, [
      { kind: 'path', value: '/' },
      { kind: 'path', value: '/' },
    ]);
    expect(repeated.map((step) => step.sessions)).toEqual([2, 0]);
    const [first, second] = funnelSteps(db, 'one', range, [
      { kind: 'path', value: '/' },
      { kind: 'path', value: '/pricing' },
    ]);
    expect(first).toMatchObject({ sessions: 2, ofFirst: 1, fromPrevious: 1 });
    expect(second).toMatchObject({ sessions: 1, ofFirst: 0.5, fromPrevious: 0.5 });

    const blank = { kind: 'path', value: '' };
    expect(
      createFunnel(db, 'one', 'Short', [{ kind: 'path', value: '/' }, blank]).error,
    ).toBeTruthy();
    expect(
      createFunnel(db, 'one', 'Bad', [
        { kind: 'path', value: '/' },
        { kind: 'event', value: 'a b' },
      ]).error,
    ).toBeTruthy();
    expect(createFunnel(db, 'one', 'Checkout', [...steps, blank]).error).toBeNull();
    const report = dashboardReport(db, 'one', range);
    expect(report.funnels[0].steps.map((step) => step.sessions)).toEqual([2, 1, 1]);
    expect(dashboardReport(db, 'two', range).funnels).toEqual([]);
  } finally {
    db.$client.close();
  }
});

test('weekly and monthly buckets reuse daily counts and label partial buckets by their first date', () => {
  const db = setup();
  try {
    const range = period('from=2026-09-29&to=2026-10-14');
    for (const date of ['2026-09-29', '2026-10-04', '2026-10-05', '2026-10-14'])
      db.insert(hits)
        .values({
          site_id: 'one',
          kind: 'pageview',
          path: '/',
          created_at: Date.parse(`${date}T10:00:00Z`),
        })
        .run();
    expect(viewSeries(db, 'one', range, undefined, {}, 'week').chartSeries).toEqual([
      { day: '2026-09-29', count: 2 },
      { day: '2026-10-05', count: 1 },
      { day: '2026-10-12', count: 1 },
    ]);
    expect(viewSeries(db, 'one', range, undefined, {}, 'month').chartSeries).toEqual([
      { day: '2026-09-29', count: 1 },
      { day: '2026-10-01', count: 3 },
    ]);
    expect(chartInterval(new URLSearchParams('interval=month'), { days: 1 })).toBe('hour');
    expect(chartInterval(new URLSearchParams('interval=year'), { days: 7 })).toBe('day');
    expect(chartInterval(new URLSearchParams('interval=week'), { days: 7 })).toBe('week');

    const heatmap = weekdayHours(db, 'one', range);
    // Tuesday 09-29, Sunday 10-04, Monday 10-05 and Wednesday 10-14.
    expect(heatmap.grid.map((row) => row.hours[10])).toEqual([1, 1, 1, 0, 0, 0, 1]);
    expect(heatmap.grid.flatMap((row) => row.hours).reduce((a, b) => a + b)).toBe(4);
    expect(heatmap.peak).toBe(1);
  } finally {
    db.$client.close();
  }
});

test('retention deletes only expired durable data for opted-in sites, in batches', async () => {
  const db = setup();
  try {
    expect(setRetention(db, 'one', '45').error).toBeTruthy();
    expect(setRetention(db, 'absent', '90').status).toBe(404);
    expect(setRetention(db, 'one', '90').error).toBeNull();
    const cutoff = retentionCutoff(90, now);
    expect(new Date(cutoff).toISOString()).toBe('2026-08-06T00:00:00.000Z');
    expect((Math.floor(now / DAY) * DAY - cutoff) / DAY + 1).toBe(90);
    const old = Array.from({ length: 2500 }, () => ({
      site_id: 'one',
      kind: 'pageview' as const,
      path: '/old',
      created_at: cutoff - 1,
    }));
    db.insert(hits).values(old).run();
    db.insert(hits)
      .values([
        { site_id: 'one', kind: 'pageview', path: '/kept', created_at: cutoff },
        { site_id: 'two', kind: 'pageview', path: '/other', created_at: 0 },
      ])
      .run();
    for (const [id, started] of [
      ['old', cutoff - 1],
      ['new', cutoff],
    ] as const)
      db.insert(journeys)
        .values({
          id,
          site_id: 'one',
          started_at: started,
          last_seen: started,
          entry_path: '/',
          exit_path: '/',
        })
        .run();
    db.insert(pageActivity).values({ id: 'a', site_id: 'one', path: '/', created_at: 1 }).run();
    let pauses = 0;
    const deleted = await purgeExpired(db, now, async () => {
      pauses++;
    });
    expect(deleted).toEqual({ hits: 2500, page_activity: 1, journeys: 1 });
    expect(pauses).toBe(1);
    expect(
      db
        .select({ path: hits.path })
        .from(hits)
        .all()
        .map((row) => row.path)
        .sort(),
    ).toEqual(['/kept', '/other']);
    expect(db.select().from(journeys).where(eq(journeys.id, 'new')).get()).toBeTruthy();
    expect(setRetention(db, 'one', '').error).toBeNull();
    expect(await purgeExpired(db, now)).toEqual({ hits: 0, page_activity: 0, journeys: 0 });
  } finally {
    db.$client.close();
  }
});

test('overview CSV records filters, chosen buckets, quality, goals, funnels and heatmap cells', () => {
  const db = setup();
  try {
    seedTraffic(db);
    createGoal(db, 'one', { name: 'Signup', kind: 'event', value: 'signup' });
    createFunnel(db, 'one', 'Buy', [
      { kind: 'path', value: '/' },
      { kind: 'path', value: '/pricing' },
    ]);
    const range = period('days=7');
    const filters = { country: 'DE' };
    const csv = reportCsv(
      dashboardReport(db, 'one', range, filters, 'week'),
      range,
      'https://one.example',
      filters,
    );
    for (const text of [
      '"Filter","Country","Germany","DE"',
      '"Weekly pageviews","2026-10-28","Bucket start","0"',
      '"Session quality","Linked sessions","","2"',
      '"Session quality","Bounce rate","Percent","50"',
      '"Goals","Signup","event signup · conversions","1"',
      '"Funnel: Buy","Page /pricing","Sessions reaching step","1"',
      '"Weekday hours","Tue","11:00 UTC","4"',
    ])
      expect(csv).toContain(text);
    expect(csv).not.toContain(session(1));
  } finally {
    db.$client.close();
  }
});
