import { expect, test } from 'bun:test';
import { openDatabase } from '../src/lib/server/database';
import {
  breakdownOptions,
  breakdownReport,
  breakdownRows,
  isBreakdown,
} from '../src/lib/server/breakdowns';
import { hits, sites } from '../src/lib/server/schema';
import { collectionStatus, renameSite } from '../src/lib/server/site-management';

const bounds = { since: 1000, until: 2000 };
const options = (query = '') => breakdownOptions(new URLSearchParams(query));
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

test('explorer paginates beyond the overview, sorts ties and clamps stale page numbers', () => {
  const db = setup();
  try {
    db.transaction((tx) => {
      for (let i = 0; i < 123; i++)
        tx.insert(hits)
          .values({
            site_id: 'one',
            kind: 'pageview',
            path: `/page-${String(i).padStart(3, '0')}`,
            created_at: 1000,
          })
          .run();
      tx.insert(hits)
        .values({ site_id: 'one', kind: 'pageview', path: '/page-122', created_at: 1999 })
        .run();
      for (const [siteId, time] of [
        ['two', 1000],
        ['one', 999],
        ['one', 2000],
      ] as const)
        tx.insert(hits)
          .values({ site_id: siteId, kind: 'pageview', path: '/excluded', created_at: time })
          .run();
    });
    const first = breakdownReport(db, 'one', bounds, 'pages');
    expect(first.totals).toEqual({ rows: 123, count: 124 });
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0]).toMatchObject({ label: '/page-122', count: 2 });
    expect(first.pages).toBe(3);
    const second = breakdownReport(db, 'one', bounds, 'pages', options('page=2'));
    const last = breakdownReport(db, 'one', bounds, 'pages', options('page=9999'));
    expect(last.page).toBe(3);
    expect(last.rows).toHaveLength(23);
    expect(
      new Set([...first.rows, ...second.rows, ...last.rows].map((row) => row.label)).size,
    ).toBe(123);
    const alpha = breakdownReport(db, 'one', bounds, 'pages', options('sort=label'));
    expect(alpha.rows[0].label).toBe('/page-000');
    expect(breakdownRows(db, 'one', bounds, 'pages')).toEqual(first.rows.slice(0, 20));
  } finally {
    db.$client.close();
  }
});

test('search treats wildcards and SQL-looking input literally and keeps scope and event kinds', () => {
  const db = setup();
  try {
    db.insert(hits)
      .values([
        { site_id: 'one', kind: 'pageview', path: '/notes/100%_done', created_at: 1000 },
        { site_id: 'one', kind: 'pageview', path: '/notes/100xxdone', created_at: 1000 },
        {
          site_id: 'one',
          kind: 'event',
          path: '/notes/100%_done',
          event: 'signup',
          created_at: 1000,
        },
        { site_id: 'two', kind: 'pageview', path: '/notes/100%_done', created_at: 1000 },
      ])
      .run();
    const report = breakdownReport(db, 'one', bounds, 'pages', options('q=%25_'));
    expect(report.totals).toEqual({ rows: 1, count: 1 });
    expect(report.rows[0].label).toBe('/notes/100%_done');
    expect(breakdownReport(db, 'one', bounds, 'pages', options('q=NOTES')).totals.count).toBe(2);
    expect(breakdownReport(db, 'one', bounds, 'pages', options("q=' OR 1=1 --")).totals.count).toBe(
      0,
    );
    expect(breakdownReport(db, 'one', bounds, 'events').rows).toEqual([
      { label: 'signup', name: 'signup', count: 1 },
    ]);
    const empty = breakdownReport(db, 'one', bounds, 'pages', options('q=absent&page=999'));
    expect(empty).toMatchObject({ page: 1, pages: 1, rows: [], totals: { rows: 0, count: 0 } });
  } finally {
    db.$client.close();
  }
});

test('dimension labels and link reports preserve unknowns, readable codes and target validation', () => {
  const db = setup();
  try {
    db.insert(hits)
      .values([
        {
          site_id: 'one',
          kind: 'pageview',
          path: '/',
          country: 'US',
          language: 'en',
          created_at: 1000,
        },
        { site_id: 'one', kind: 'pageview', path: '/', created_at: 1000 },
        {
          site_id: 'one',
          kind: 'event',
          path: '/',
          event: 'outbound_click',
          target: 'https://outside.example/',
          created_at: 1000,
        },
        {
          site_id: 'one',
          kind: 'event',
          path: '/',
          event: 'file_download',
          target: 'https://one.example/file.pdf',
          created_at: 1000,
        },
        { site_id: 'one', kind: 'event', path: '/', event: 'outbound_click', created_at: 1000 },
      ])
      .run();
    expect(breakdownReport(db, 'one', bounds, 'countries', options('q=US')).rows[0]).toEqual({
      label: 'US',
      name: 'United States',
      count: 1,
    });
    expect(breakdownReport(db, 'one', bounds, 'languages', options('q=en')).rows[0].name).toBe(
      'English',
    );
    expect(breakdownReport(db, 'one', bounds, 'referrers').rows).toEqual([
      { label: 'Direct / unknown', name: 'Direct / unknown', count: 2 },
    ]);
    expect(breakdownReport(db, 'one', bounds, 'outbound').totals.count).toBe(1);
    expect(breakdownReport(db, 'one', bounds, 'downloads').rows[0].label).toBe(
      'https://one.example/file.pdf',
    );
    for (const value of ['constructor', '__proto__', 'bad']) expect(isBreakdown(value)).toBe(false);
    for (const page of ['-1', 'NaN', '1.5', 'Infinity', '9007199254740992'])
      expect(options(`page=${page}`).page).toBe(1);
    expect(options('q=' + 'x'.repeat(201)).query.length).toBe(200);
  } finally {
    db.$client.close();
  }
});

test('renaming preserves site identity and analytics; collection status is site-specific and all-time', () => {
  const db = setup();
  try {
    expect(collectionStatus(db, 'one')).toBeNull();
    db.insert(hits)
      .values([
        { site_id: 'one', kind: 'pageview', path: '/', created_at: 1000 },
        { site_id: 'one', kind: 'event', path: '/', event: 'signup', created_at: 3000 },
        { site_id: 'two', kind: 'pageview', path: '/', created_at: 5000 },
      ])
      .run();
    expect(collectionStatus(db, 'one')).toBe(3000);
    expect(renameSite(db, 'one', '  New name  ')).toEqual({ name: 'New name', status: 200 });
    expect(db.select().from(sites).all()[0]).toMatchObject({
      id: 'one',
      name: 'New name',
      origin: 'https://one.example',
    });
    expect(db.select().from(hits).all()).toHaveLength(3);
    expect(renameSite(db, 'missing', 'Name').status).toBe(404);
    for (const name of ['', '   ', 'x'.repeat(101)])
      expect(renameSite(db, 'one', name).status).toBe(400);
  } finally {
    db.$client.close();
  }
});

test('literal search supports Cyrillic case changes and normalized accented paths', () => {
  const db = setup();
  try {
    db.insert(hits)
      .values([
        { site_id: 'one', kind: 'pageview', path: '/ЗАМЕТКИ/ОТЧЁТ', created_at: 1000 },
        { site_id: 'one', kind: 'pageview', path: '/Café', created_at: 1000 },
      ])
      .run();
    for (const query of ['заметки', 'отчёт', 'CAFÉ', 'cafe\u0301']) {
      const report = breakdownReport(
        db,
        'one',
        bounds,
        'pages',
        options(new URLSearchParams({ q: query }).toString()),
      );
      expect(report.totals).toEqual({ rows: 1, count: 1 });
    }
  } finally {
    db.$client.close();
  }
});
