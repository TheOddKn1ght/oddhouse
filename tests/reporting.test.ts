import { expect, test } from 'bun:test';
import { openDatabase } from '../src/lib/server/database';
import { dashboardReport } from '../src/lib/server/dashboard-report';
import { reportPeriod } from '../src/lib/server/report-period';
import { csvCell, reportCsv } from '../src/lib/server/report-csv';
import { hits, journeys, pageActivity, sites } from '../src/lib/server/schema';

const now = Date.parse('2026-11-03T12:34:56Z');
const period = (query: string) => reportPeriod(new URLSearchParams(query), now);

test('UTC presets and custom dates produce inclusive calendar ranges and adjacent comparisons', () => {
  expect(period('days=1')).toMatchObject({ from: '2026-11-03', to: '2026-11-03', days: 1 });
  const leap = period('from=2024-02-28&to=2024-03-01');
  expect(leap).toMatchObject({
    from: '2024-02-28',
    to: '2024-03-01',
    days: 3,
    custom: true,
    error: null,
  });
  expect(new Date(leap.until).toISOString()).toBe('2024-03-02T00:00:00.000Z');
  expect(leap.previousUntil).toBe(leap.since);
  expect(leap.previousUntil - leap.previousSince).toBe(leap.until - leap.since);
  expect(period('from=2024-01-01&to=2024-12-31').days).toBe(366);
});

test('invalid, future, reversed and oversized dates fall back with an explicit error', () => {
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'from=2026-01-01',
    'from=2026-11-04&to=2026-11-04',
    'from=2026-10-02&to=2026-10-01',
    'from=2024-01-01&to=2025-01-01',
    'from=garbage&to=2026-01-01',
    'from=2026-1-01&to=2026-01-01',
  ]) {
    expect(period(query).error).toBeTruthy();
    expect(period(query)).toMatchObject({
      from: '2026-10-28',
      to: '2026-11-03',
      custom: false,
      days: 7,
    });
  }
  expect(period('days=999').days).toBe(7);
});

test('report bounds apply to every aggregate, isolate sites, fill gaps and compare the preceding range', () => {
  const db = openDatabase(':memory:');
  try {
    for (const id of ['one', 'two'])
      db.insert(sites)
        .values({ id, name: id, origin: `https://${id}.example`, created_at: 0 })
        .run();
    const range = period('from=2026-10-01&to=2026-10-02');
    for (const [i, time] of [
      range.previousSince - 1,
      range.previousSince,
      range.since - 1,
      range.since,
      range.until - 1,
      range.until,
    ].entries()) {
      for (const siteId of ['one', 'two']) {
        db.insert(hits)
          .values({
            site_id: siteId,
            kind: 'pageview',
            path: `/page-${i}`,
            created_at: time,
            utm_source: 'mail',
          })
          .run();
        db.insert(hits)
          .values({
            site_id: siteId,
            kind: 'event',
            path: `/page-${i}`,
            event: 'outbound_click',
            target: `https://example.com/${i}`,
            created_at: time,
          })
          .run();
        db.insert(journeys)
          .values({
            id: `${siteId}-${i}`,
            site_id: siteId,
            entry_path: `/page-${i}`,
            exit_path: `/page-${i}`,
            started_at: time,
            last_seen: time,
          })
          .run();
        db.insert(pageActivity)
          .values({
            id: `${siteId}-${i}`,
            site_id: siteId,
            path: `/page-${i}`,
            active_ms: 1000,
            max_scroll: 50,
            created_at: time,
          })
          .run();
      }
    }
    const report = dashboardReport(db, 'one', range);
    expect(report.totals).toEqual({ pageviews: 2, events: 2, sessions: 2 });
    expect(report.previous).toEqual({ pageviews: 2, events: 2, sessions: 2 });
    expect(report.series).toEqual([
      { day: '2026-10-01', count: 1 },
      { day: '2026-10-02', count: 1 },
    ]);
    for (const rows of [report.pages, report.entries, report.exits])
      expect(rows).toEqual([
        { path: '/page-3', count: 1 },
        { path: '/page-4', count: 1 },
      ]);
    expect(report.campaigns).toEqual([{ source: 'mail', medium: '', campaign: '', count: 2 }]);
    expect(report.outboundLinks).toHaveLength(2);
    expect(report.engagement.map((row) => row.path)).toEqual(['/page-3', '/page-4']);
    const empty = dashboardReport(db, 'missing', range);
    expect(empty.totals).toEqual({ pageviews: 0, events: 0, sessions: 0 });
    expect(empty.series.every((row) => row.count === 0)).toBe(true);
    const csv = reportCsv(report, range, 'https://one.example');
    expect(csv).toContain('"Totals","pageviews","","2"');
    expect(csv).toContain('Top 20 per dimension');
    expect(csv).not.toContain('/page-5');
    expect(csv).not.toContain('two-');
  } finally {
    db.$client.close();
  }
});

test('CSV safely quotes delimiters, multiline text and spreadsheet formulas', () => {
  expect(csvCell('a,"b"\r\nc')).toBe('"a,""b""\r\nc"');
  for (const value of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', '  =1', '\t=1', '\r=1', '\n=1'])
    expect(csvCell(value)).toBe(`"'${value}"`);
  expect(csvCell('/post')).toBe('"/post"');
  expect(csvCell(42)).toBe('"42"');
});
