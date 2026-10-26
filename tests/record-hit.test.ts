import { expect, test } from 'bun:test';
import { openDatabase } from '../src/lib/server/database';
import { recordHit, PAGE_REPEAT_MS, SESSION_IDLE_MS } from '../src/lib/server/record-hit';
import { hits, sites, visits, visitPages } from '../src/lib/server/schema';
import type { Hit } from '../src/lib/server/collection';

const token = '9acb925a-f361-49df-98d8-ae9b956d2ce1';
const first: Hit = {
  kind: 'pageview',
  path: '/first',
  event: '',
  referrer: '',
  title: '',
  session: token,
};
const dimensions = { country: 'US', browser: 'Firefox' };
function setup() {
  const db = openDatabase(':memory:');
  for (const id of ['one', 'two'])
    db.insert(sites)
      .values({ id, name: id, origin: `https://${id}.example`, created_at: 0 })
      .run();
  return db;
}
test('returns and reloads are suppressed for five minutes, then count again without extending the window', () => {
  const db = setup();
  try {
    expect(recordHit(db, 'one', first, dimensions, 1000)).toBe(true);
    expect(recordHit(db, 'one', { ...first, path: '/second' }, dimensions, 2000)).toBe(true);
    expect(recordHit(db, 'one', first, dimensions, 3000)).toBe(false);
    expect(recordHit(db, 'one', first, dimensions, 1000 + PAGE_REPEAT_MS - 1)).toBe(false);
    expect(recordHit(db, 'one', first, dimensions, 1000 + PAGE_REPEAT_MS)).toBe(true);
    expect(db.select().from(hits).all()).toHaveLength(3);
    expect(db.select().from(hits).get()).toMatchObject(dimensions);
    const visit = db.select().from(visits).get()!;
    expect(visit.id).toMatch(/^[a-f0-9]{64}$/);
    expect(visit.id).not.toBe(token);
  } finally {
    db.$client.close();
  }
});
test('distinct sessions and sites are independent; events and legacy requests always count', () => {
  const db = setup();
  try {
    expect(recordHit(db, 'one', first, dimensions, 1000)).toBe(true);
    expect(recordHit(db, 'two', first, dimensions, 1001)).toBe(true);
    expect(recordHit(db, 'one', { ...first, session: crypto.randomUUID() }, dimensions, 1002)).toBe(
      true,
    );
    for (let i = 0; i < 2; i++) {
      expect(
        recordHit(db, 'one', { ...first, kind: 'event', event: 'download' }, dimensions, 1003),
      ).toBe(true);
      const { session: _, ...legacy } = first;
      expect(recordHit(db, 'one', legacy, dimensions, 1004)).toBe(true);
    }
    expect(db.select().from(hits).all()).toHaveLength(7);
  } finally {
    db.$client.close();
  }
});
test('expired filtering state is cleaned without deleting analytics', () => {
  const db = setup();
  try {
    recordHit(db, 'one', first, dimensions, 1000);
    const later = { ...first, session: crypto.randomUUID() };
    recordHit(db, 'one', later, dimensions, 1000 + SESSION_IDLE_MS);
    expect(db.select().from(visits).all()).toHaveLength(1);
    expect(db.select().from(visitPages).all()).toHaveLength(1);
    expect(db.select().from(hits).all()).toHaveLength(2);
  } finally {
    db.$client.close();
  }
});
