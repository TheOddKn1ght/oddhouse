import { expect, test } from 'bun:test';
import { openDatabase } from '../src/lib/server/database';
import { recordHit, SESSION_IDLE_MS } from '../src/lib/server/record-hit';
import { activityReports } from '../src/lib/server/activity-reports';
import { hits, journeys, pageActivity, sites } from '../src/lib/server/schema';
import { normalizeHit, type Hit } from '../src/lib/server/collection';

const dimensions = {
  country: '',
  browser: 'Firefox',
  device: 'Desktop',
  os: 'Linux',
  language: 'en',
};
const token = crypto.randomUUID();
const page = crypto.randomUUID();
const first: Hit = {
  kind: 'pageview',
  path: '/entry',
  title: '',
  referrer: '',
  event: '',
  session: token,
  page,
  utm_source: 'newsletter',
  utm_medium: 'email',
  utm_campaign: 'launch',
};
function setup() {
  const db = openDatabase(':memory:');
  for (const id of ['one', 'two'])
    db.insert(sites)
      .values({ id, name: id, origin: `https://${id}.example`, created_at: 0 })
      .run();
  return db;
}
test('campaigns retain first-touch attribution; suppressed returns update exit page without raising counters', () => {
  const db = setup();
  try {
    recordHit(db, 'one', first, dimensions, 1000);
    recordHit(
      db,
      'one',
      { ...first, page: crypto.randomUUID(), path: '/next', utm_source: 'changed' },
      dimensions,
      2000,
    );
    expect(recordHit(db, 'one', { ...first, page: crypto.randomUUID() }, dimensions, 3000)).toBe(
      false,
    );
    expect(
      db
        .select()
        .from(hits)
        .all()
        .map((row) => row.utm_source),
    ).toEqual(['newsletter', 'newsletter']);
    let report = activityReports(db, 'one', 0, 4000);
    expect(report.campaigns).toEqual([
      { source: 'newsletter', medium: 'email', campaign: 'launch', count: 2 },
    ]);
    expect(report.entries).toEqual([{ path: '/entry', count: 1 }]);
    expect(report.exits).toEqual([]);
    expect(report.live.active).toBe(1);
    expect(report.live.recent).toHaveLength(2);
    report = activityReports(db, 'one', 0, 3000 + SESSION_IDLE_MS);
    expect(report.exits).toEqual([{ path: '/entry', count: 1 }]);
    expect(report.live.active).toBe(0);
    expect(report.live.recent).toHaveLength(0);
    expect(activityReports(db, 'two', 0, 4000).entries).toEqual([]);
    // Cleanup removes temporary dedupe state but keeps historical entry/exit summaries.
    recordHit(
      db,
      'one',
      { ...first, page: crypto.randomUUID(), session: crypto.randomUUID() },
      dimensions,
      4000 + SESSION_IDLE_MS,
    );
    expect(db.select().from(journeys).all()).toHaveLength(2);
  } finally {
    db.$client.close();
  }
});
test('engagement snapshots are monotonic, elapsed-time bounded and never inflate pageview or event totals', () => {
  const db = setup();
  try {
    recordHit(db, 'one', first, dimensions, 1000);
    const pulse: Hit = { ...first, kind: 'engagement', active_ms: 10000, max_scroll: 50 };
    recordHit(db, 'one', pulse, dimensions, 11000);
    recordHit(db, 'one', pulse, dimensions, 11000);
    recordHit(db, 'one', { ...pulse, active_ms: 2000, max_scroll: 10 }, dimensions, 12000);
    expect(db.select().from(pageActivity).get()).toMatchObject({
      active_ms: 10000,
      max_scroll: 50,
    });
    recordHit(db, 'one', { ...pulse, active_ms: 86400000, max_scroll: 100 }, dimensions, 21000);
    expect(db.select().from(pageActivity).get()?.active_ms).toBe(22000);
    expect(db.select().from(hits).all()).toHaveLength(1);
    expect(activityReports(db, 'one', 0, 21000).engagement).toEqual([
      { path: '/entry', active_ms: 22000, max_scroll: 100 },
    ]);
    expect(recordHit(db, 'two', pulse, dimensions, 22000)).toBe(false);
    expect(recordHit(db, 'one', { ...pulse, page: crypto.randomUUID() }, dimensions, 22000)).toBe(
      false,
    );
    expect(recordHit(db, 'one', { ...pulse, path: '/fake' }, dimensions, 22000)).toBe(false);
  } finally {
    db.$client.close();
  }
});
test('collector strips non-allowlisted queries and link secrets; engagement requires valid cumulative samples', () => {
  const base = {
    kind: 'pageview',
    path: '/entry?secret=private#fragment',
    session: token,
    page,
    utm_source: 'newsletter',
    utm_term: 'private',
    email: 'private@example.com',
  };
  const normalized = normalizeHit(base, 'https://one.example')!;
  expect(normalized).toMatchObject({ path: '/entry', utm_source: 'newsletter' });
  expect(JSON.stringify(normalized)).not.toContain('private');
  expect(
    normalizeHit(
      {
        ...base,
        kind: 'event',
        event: 'outbound_click',
        target: 'https://outside.example/post?token=private#fragment',
      },
      'https://one.example',
    )?.target,
  ).toBe('https://outside.example/post');
  for (const target of [
    'javascript:alert(1)',
    'mailto:private@example.com',
    'https://user:password@outside.example/',
  ])
    expect(
      normalizeHit(
        { ...base, kind: 'event', event: 'file_download', target },
        'https://one.example',
      )?.target,
    ).toBeUndefined();
  const pulse = { ...base, kind: 'engagement', active_ms: 15000, max_scroll: 50 };
  expect(normalizeHit(pulse, 'https://one.example')?.kind).toBe('engagement');
  for (const change of [
    { session: undefined },
    { page: undefined },
    { active_ms: -1 },
    { active_ms: 86400001 },
    { active_ms: 1.5 },
    { max_scroll: 101 },
    { max_scroll: '50' },
  ])
    expect(normalizeHit({ ...pulse, ...change }, 'https://one.example')).toBeNull();
});
