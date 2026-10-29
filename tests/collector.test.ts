import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST } from '../src/routes/api/collect/+server';
import { load } from '../src/routes/+page.server';
import { database } from '../src/lib/server/database';
import { hits, visits, sites } from '../src/lib/server/schema';

const directory = mkdtempSync(join(tmpdir(), 'oddhouse-collector-'));
const previousPath = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
const db = database();
db.insert(sites)
  .values({ id: 'test', name: 'Example', origin: 'https://example.com', created_at: 0 })
  .run();
afterAll(() => {
  db.$client.close();
  if (previousPath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previousPath;
  rmSync(directory, { recursive: true, force: true });
});
const human =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
function collect(body: object, ua = human, language = 'en-US,en;q=0.9') {
  const url = new URL('https://analytics.example/api/collect?site=test');
  return POST({
    url,
    getClientAddress: () => '127.0.0.1',
    request: new Request(url, {
      method: 'POST',
      headers: {
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
        'User-Agent': ua,
        'Accept-Language': language,
      },
      body: JSON.stringify(body),
    }),
  } as any);
}
test('bot pageviews and events are acknowledged but create neither hits nor visitor sessions', async () => {
  for (const kind of ['pageview', 'event']) {
    const response = await collect(
      { kind, event: 'download', path: '/bot', session: crypto.randomUUID() },
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
  }
  expect(db.select().from(hits).all()).toHaveLength(0);
  expect(db.select().from(visits).all()).toHaveLength(0);
});
test('collector and dashboard preserve dimensions and count only unfiltered pageviews in breakdowns', async () => {
  const token = crypto.randomUUID();
  expect(
    (
      await collect({
        kind: 'pageview',
        path: '/',
        session: token,
        language: 'fr-CA',
        device: 'FAKE',
        os: 'FAKE',
      })
    ).status,
  ).toBe(204);
  expect(
    (await collect({ kind: 'pageview', path: '/', session: token, language: 'fr-CA' })).status,
  ).toBe(204);
  expect(
    (await collect({ kind: 'event', path: '/', event: 'download', language: 'fr-CA' })).status,
  ).toBe(204);
  expect(
    (
      await collect(
        { kind: 'pageview', path: '/android' },
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'de-DE;q=0.9,en;q=0.5',
      )
    ).status,
  ).toBe(204);
  expect(db.select().from(hits).all()).toHaveLength(3);
  expect(db.select().from(hits).get()).toMatchObject({
    device: 'Desktop',
    os: 'Windows',
    language: 'fr',
  });
  // Pre-migration rows must appear as Unknown and remain part of the totals.
  db.insert(hits)
    .values({ site_id: 'test', kind: 'pageview', path: '/historical', created_at: Date.now() })
    .run();
  const data = (await load!({
    url: new URL('https://analytics.example/?site=test'),
  } as any)) as any;
  expect(data.totals).toEqual({ pageviews: 3, events: 1 });
  expect(data.devices).toEqual(
    expect.arrayContaining([
      { label: 'Desktop', count: 1 },
      { label: 'Mobile', count: 1 },
      { label: 'Unknown', count: 1 },
    ]),
  );
  expect(data.operatingSystems).toEqual(
    expect.arrayContaining([
      { label: 'Windows', count: 1 },
      { label: 'Android', count: 1 },
      { label: 'Unknown', count: 1 },
    ]),
  );
  expect(data.languages).toEqual(
    expect.arrayContaining([
      { label: 'French', count: 1 },
      { label: 'German', count: 1 },
      { label: 'Unknown', count: 1 },
    ]),
  );
});
