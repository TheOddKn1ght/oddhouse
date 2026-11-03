import { expect, test } from 'bun:test';
import { openDatabase } from '../src/lib/server/database';
import { hits, pageActivity, sites } from '../src/lib/server/schema';
import { pageReport, pageReportCsv, validPagePath } from '../src/lib/server/page-report';
import { reportPeriod } from '../src/lib/server/report-period';
import { viewSeries } from '../src/lib/server/view-series';
import { pageReportUrl } from '../src/lib/report-links';
import { liveActivity } from '../src/lib/server/activity-reports';

const period = reportPeriod(
  new URLSearchParams('from=2026-10-01&to=2026-10-01'),
  Date.parse('2026-11-03T12:00:00Z'),
);
function setup() {
  const db = openDatabase(':memory:');
  db.insert(sites)
    .values([
      { id: 'one', name: 'One', origin: 'https://one.example', created_at: 0 },
      { id: 'two', name: 'Two', origin: 'https://two.example', created_at: 0 },
    ])
    .run();
  return db;
}
test('page reports use exact paths and site/date boundaries for views, events and engagement', () => {
  const db = setup();
  try {
    for (const time of [
      period.since,
      period.since + 3599999,
      period.since + 3600000,
      period.until - 1,
      period.until,
      period.previousSince,
    ])
      db.insert(hits)
        .values({
          site_id: 'one',
          kind: 'pageview',
          path: '/post',
          referrer: 'search.example',
          created_at: time,
        })
        .run();
    db.insert(hits)
      .values([
        { site_id: 'one', kind: 'event', path: '/post', event: 'signup', created_at: period.since },
        {
          site_id: 'one',
          kind: 'event',
          path: '/post',
          event: 'outbound_click',
          target: 'https://other.example/',
          created_at: period.since,
        },
        { site_id: 'one', kind: 'pageview', path: '/post/child', created_at: period.since },
        { site_id: 'two', kind: 'pageview', path: '/post', created_at: period.since },
        {
          site_id: 'two',
          kind: 'event',
          path: '/post',
          event: 'excluded',
          created_at: period.since,
        },
        {
          site_id: 'one',
          kind: 'event',
          path: '/post',
          event: 'excluded',
          created_at: period.until,
        },
      ])
      .run();
    db.insert(pageActivity)
      .values([
        {
          id: 'private-sample-one',
          site_id: 'one',
          path: '/post',
          active_ms: 10000,
          max_scroll: 80,
          created_at: period.since,
        },
        {
          id: 'private-sample-two',
          site_id: 'one',
          path: '/post',
          created_at: period.since + 1000,
        },
        {
          id: 'excluded-sample-one',
          site_id: 'two',
          path: '/post',
          active_ms: 90000,
          created_at: period.since,
        },
        {
          id: 'excluded-sample-two',
          site_id: 'one',
          path: '/post/child',
          active_ms: 90000,
          created_at: period.since,
        },
        {
          id: 'excluded-sample-three',
          site_id: 'one',
          path: '/post',
          active_ms: 90000,
          created_at: period.until,
        },
      ])
      .run();
    const report = pageReport(db, 'one', '/post', period);
    expect(report.totals).toEqual({ pageviews: 4, events: 2 });
    expect(report.previous).toEqual({ pageviews: 1, events: 0 });
    expect(report.referrers).toEqual([{ label: 'search.example', count: 4 }]);
    expect(report.events).toEqual([
      { label: 'outbound_click', count: 1 },
      { label: 'signup', count: 1 },
    ]);
    expect(report.outbound).toEqual([{ label: 'https://other.example/', count: 1 }]);
    expect(report.downloads).toEqual([]);
    expect(report.engagement).toEqual({
      samples: 2,
      activeMs: 10000,
      averageMs: 5000,
      averageScroll: 40,
      deepestScroll: 80,
    });
    expect(report.series).toEqual([{ day: '2026-10-01', count: 4 }]);
    expect(report.granularity).toBe('hour');
    expect(report.chartSeries).toHaveLength(24);
    expect(report.chartSeries[0]).toEqual({ day: '2026-10-01 00:00', count: 2 });
    expect(report.chartSeries[1].count).toBe(1);
    expect(report.chartSeries[23].count).toBe(1);
    expect(report.chartSeries.reduce((sum, row) => sum + row.count, 0)).toBe(4);
    expect(JSON.stringify(report)).not.toContain('private-sample');
    const csv = pageReportCsv(report, period, 'https://one.example', '/post');
    expect(csv).toContain('"Hourly pageviews","2026-10-01 00:00","2"');
    expect(csv).not.toContain('excluded');
    expect(csv).not.toContain('private-sample');
  } finally {
    db.$client.close();
  }
});

test('empty page reports zero-fill hours and longer ranges retain daily buckets', () => {
  const db = setup();
  try {
    const empty = pageReport(db, 'one', '/unknown', period);
    expect(empty.totals).toEqual({ pageviews: 0, events: 0 });
    expect(empty.engagement.samples).toBe(0);
    expect(empty.chartSeries.every((row) => row.count === 0)).toBe(true);
    const longer = reportPeriod(
      new URLSearchParams('from=2026-10-01&to=2026-10-03'),
      Date.parse('2026-11-03T12:00:00Z'),
    );
    db.insert(hits)
      .values({ site_id: 'one', kind: 'pageview', path: '/', created_at: period.since })
      .run();
    const series = viewSeries(db, 'one', longer);
    expect(series.granularity).toBe('day');
    expect(series.chartSeries).toEqual([
      { day: '2026-10-01', count: 1 },
      { day: '2026-10-02', count: 0 },
      { day: '2026-10-03', count: 0 },
    ]);
    expect(viewSeries(db, 'two', longer).series.every((row) => row.count === 0)).toBe(true);
  } finally {
    db.$client.close();
  }
});

test('page links encode special characters and validation rejects ambiguous or malformed paths without regex', () => {
  const path = '/заметки/a&site=two+100%';
  expect(validPagePath(path)).toBe(true);
  const url = new URL(pageReportUrl('one', path, period), 'https://analytics.example');
  expect(url.pathname).toBe('/page');
  expect(url.searchParams.get('site')).toBe('one');
  expect(url.searchParams.get('path')).toBe(path);
  for (const invalid of [
    null,
    '',
    'https://example.com/',
    '//example.com',
    '/path?secret=x',
    '/path#hash',
    '/path\n',
    '/path\u0000',
    '/' + 'x'.repeat(2048),
  ])
    expect(validPagePath(invalid)).toBe(false);
});

test('live snapshots carry a deterministic capture time independent of activity', () => {
  const db = setup();
  try {
    expect(liveActivity(db, 'one', 123456)).toEqual({
      siteId: 'one',
      active: 0,
      recent: [],
      updatedAt: 123456,
    });
  } finally {
    db.$client.close();
  }
});
