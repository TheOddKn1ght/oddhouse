// Exercises the built server with an isolated database; does not touch developer data.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from 'bun:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'oddhouse-smoke-'));
const path = join(dir, 'test.sqlite');
const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = probe.port;
probe.stop(true);
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DATABASE_PATH: path,
  ORIGIN: origin,
  HOST: '127.0.0.1',
  PORT: String(port),
  ADDRESS_HEADER: 'x-forwarded-for',
  PROTOCOL_HEADER: 'x-forwarded-proto',
};
const rawFetch = globalThis.fetch;
const fetch = (url: string | URL, init: RequestInit = {}) =>
  rawFetch(url, {
    ...init,
    headers: {
      Accept: 'text/html',
      'X-Forwarded-Proto': 'http',
      'X-Forwarded-For': '8.8.8.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      ...init.headers,
    },
  });
const password = crypto.randomUUID();
let server: ReturnType<typeof Bun.spawn> | undefined;
let db: Database | undefined;
try {
  const admin = Bun.spawn(['bun', 'scripts/admin.ts', 'create', 'smoke'], {
    env,
    stdin: new Blob([password]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  assert.equal(await admin.exited, 0, await new Response(admin.stderr).text());
  server = Bun.spawn(['bun', './build'], { env, stdout: 'pipe', stderr: 'pipe' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await Bun.sleep(50);
  }
  assert(ready, 'Built server did not become healthy');
  assert.equal((await fetch(origin, { redirect: 'manual' })).status, 303);
  assert.equal(
    (await fetch(`${origin}/api/export?site=missing`, { redirect: 'manual' })).status,
    303,
  );
  const tracker = await fetch(`${origin}/tracker.js`);
  assert.equal(tracker.status, 200);
  assert(tracker.headers.get('content-type')?.includes('javascript'));
  const trackerCode = await tracker.text();
  assert.equal(trackerCode, await Bun.file('static/tracker.js').text());
  assert(Buffer.byteLength(trackerCode) < Bun.file('tracker/tracker.ts').size);

  const signIn = await fetch(`${origin}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: origin },
    body: new URLSearchParams({ username: 'smoke', password }),
  });
  assert.equal(signIn.status, 303, await signIn.text());
  const cookie = signIn.headers.get('set-cookie')!.split(';')[0];
  assert(cookie.startsWith('oddhouse_session='));
  const csrf = await fetch(`${origin}/?/createSite`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://evil.example' },
    body: new URLSearchParams({ name: 'Bad', origin: 'https://evil.example' }),
  });
  assert.equal(csrf.status, 403);
  const create = await fetch(`${origin}/?/createSite`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookie, Origin: origin },
    body: new URLSearchParams({ name: 'Smoke blog', origin: 'https://blog.example' }),
  });
  assert.equal(create.status, 303, await create.text());
  const id = new URL(create.headers.get('location')!, origin).searchParams.get('site');
  assert(id);
  const endpoint = `${origin}/api/collect?site=${id}`;
  const preflight = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://blog.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://blog.example');
  const visitorSession = crypto.randomUUID();
  const collect = async (body: unknown, source = 'https://blog.example', extra = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { Origin: source, 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ ...(body as object), session: visitorSession }),
    });
  assert.equal(
    (
      await collect({
        kind: 'pageview',
        path: '/post?secret=private#fragment',
        title: 'Post',
        referrer: 'https://search.example/private?q=secret',
      })
    ).status,
    204,
  );
  assert.equal((await collect({ kind: 'event', path: '/post', event: 'download' })).status, 204);
  assert.equal(
    (await collect({ kind: 'pageview', path: '/ignored' }, 'https://evil.example')).status,
    403,
  );
  assert.equal(
    (
      await collect({ kind: 'pageview', path: '/privacy-signals' }, 'https://blog.example', {
        'Sec-GPC': '1',
        DNT: '1',
      })
    ).status,
    204,
  );
  assert.equal(
    (await collect({ kind: 'pageview', path: '/bad', title: 'x'.repeat(9000) })).status,
    413,
  );
  assert.equal((await collect({ kind: 'bad', path: '/' })).status, 400);
  // Browser back/reload and concurrent retries must not create extra views.
  await Promise.all(Array.from({ length: 2 }, () => collect({ kind: 'pageview', path: '/post' })));
  for (const kind of ['pageview', 'event']) {
    assert.equal(
      (
        await collect({ kind, path: '/bot', event: 'download' }, 'https://blog.example', {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        })
      ).status,
      204,
    );
  }
  db = new Database(path, { readonly: true });
  assert.deepEqual(db.query('SELECT kind,path,referrer,event FROM hits ORDER BY id').all(), [
    { kind: 'pageview', path: '/post', referrer: 'search.example', event: '' },
    { kind: 'event', path: '/post', referrer: '', event: 'download' },
    { kind: 'pageview', path: '/privacy-signals', referrer: '', event: '' },
  ]);
  const dimensionRows = db.query('SELECT country,browser,device,os,language FROM hits').all() as {
    country: string;
    browser: string;
    device: string;
    os: string;
    language: string;
  }[];
  assert(
    dimensionRows.every(
      (row) =>
        row.browser === 'Chrome' &&
        row.device === 'Desktop' &&
        row.os === 'Windows' &&
        row.language === 'en',
    ),
  );
  if (await Bun.file(process.env.GEOIP_DATABASE || 'geoip/country.mmdb').exists()) {
    assert(dimensionRows.every((row) => row.country === 'US'));
  }
  const dashboard = await fetch(`${origin}/?site=${id}`, { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert(html.includes('Smoke blog') && html.includes('/post') && html.includes('download'));
  assert(html.includes('Countries') && html.includes('Browsers') && html.includes('Chrome'));
  assert(
    html.includes('Devices') && html.includes('Operating systems') && html.includes('Languages'),
  );
  assert(html.includes('Desktop') && html.includes('Windows') && html.includes('English'));
  for (const title of [
    'Campaigns',
    'Outbound clicks',
    'Downloads',
    'Engagement',
    'Entry pages',
    'Exit pages',
    'Live activity',
  ])
    assert(html.includes(title));
  assert(html.includes('https://db-ip.com'));
  const utcDay = new Date().toISOString().slice(0, 10);
  const rangeQuery = `site=${id}&from=${utcDay}&to=${utcDay}`;
  const exported = await fetch(`${origin}/api/export?${rangeQuery}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(exported.status, 200);
  assert(exported.headers.get('content-type')?.includes('text/csv'));
  assert(exported.headers.get('content-disposition')?.includes('attachment'));
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  const csv = await exported.text();
  assert(csv.includes('"Totals","pageviews","","2"'));
  assert(csv.includes('"Totals","events","","1"'));
  assert(csv.includes('"Totals","sessions","","1"'));
  assert(csv.includes('/post') && !csv.includes('secret') && !csv.includes(visitorSession));
  assert.equal(
    (await fetch(`${origin}/api/export?site=${id}&from=bad`, { headers: { Cookie: cookie } }))
      .status,
    400,
  );
  assert.equal(
    (await fetch(`${origin}/api/export?site=missing`, { headers: { Cookie: cookie } })).status,
    404,
  );
  const historical = await fetch(`${origin}/?site=${id}&from=2020-01-01&to=2020-01-03`, {
    headers: { Cookie: cookie },
  });
  assert.equal(historical.status, 200);
  const historicalHtml = await historical.text();
  assert(historicalHtml.includes('2020-01-01') && historicalHtml.includes('2020-01-03'));
  assert(historicalHtml.includes('Sessions started') && historicalHtml.includes('Export CSV'));
  for (const dimension of [
    'pages',
    'referrers',
    'events',
    'countries',
    'browsers',
    'devices',
    'os',
    'languages',
    'outbound',
    'downloads',
  ]) {
    const reportUrl = `${origin}/reports/${dimension}?${rangeQuery}`;
    assert.equal((await fetch(reportUrl, { redirect: 'manual' })).status, 303);
    const response = await fetch(reportUrl, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, `${dimension}: ${await response.text()}`);
  }
  const detailed = await fetch(`${origin}/reports/pages/export?${rangeQuery}&q=post`, {
    headers: { Cookie: cookie },
  });
  assert.equal(detailed.status, 200);
  const detailedCsv = await detailed.text();
  assert(detailedCsv.includes('"/post","/post","1"') && !detailedCsv.includes('/privacy-signals'));
  assert.equal(
    (await fetch(`${origin}/reports/pages/export?${rangeQuery}`, { redirect: 'manual' })).status,
    303,
  );
  assert.equal(
    (await fetch(`${origin}/reports/constructor?${rangeQuery}`, { headers: { Cookie: cookie } }))
      .status,
    404,
  );
  const rename = await fetch(`${origin}/?/renameSite&${rangeQuery}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin },
    body: new URLSearchParams({ id, name: 'Renamed blog' }),
  });
  assert.equal(rename.status, 200);
  const renamedHtml = await rename.text();
  assert(renamedHtml.includes('Renamed blog') && renamedHtml.includes('Site name saved.'));
  assert(renamedHtml.includes('Latest stored pageview or event'));
  assert.equal(
    db.query<{ origin: string }, [string]>('SELECT origin FROM sites WHERE id = ?').get(id)?.origin,
    'https://blog.example',
  );
  const pageQuery = `${rangeQuery}&path=${encodeURIComponent('/post')}`;
  assert.equal((await fetch(`${origin}/page?${pageQuery}`, { redirect: 'manual' })).status, 303);
  const pageResponse = await fetch(`${origin}/page?${pageQuery}`, { headers: { Cookie: cookie } });
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  assert(
    pageHtml.includes('PAGE REPORT') &&
      pageHtml.includes('Hourly counts') &&
      pageHtml.includes('Page engagement'),
  );
  const pageExport = await fetch(`${origin}/page/export?${pageQuery}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(pageExport.status, 200);
  const pageCsv = await pageExport.text();
  assert(pageCsv.includes('"Totals","pageviews","1"') && pageCsv.includes('"Totals","events","1"'));
  assert(pageCsv.includes('"Hourly pageviews"') && !pageCsv.includes('/privacy-signals'));
  assert.equal(
    (await fetch(`${origin}/page/export?${pageQuery}`, { redirect: 'manual' })).status,
    303,
  );
  assert.equal(
    (await fetch(`${origin}/page?${rangeQuery}&path=bad`, { headers: { Cookie: cookie } })).status,
    400,
  );
  const singleDay = await fetch(`${origin}/?${rangeQuery}`, { headers: { Cookie: cookie } });
  assert((await singleDay.text()).includes('Hourly counts'));
  const writer = new Database(path);
  try {
    const insert = writer.query(
      "INSERT INTO hits (site_id,kind,path,created_at) VALUES (?,'pageview',?,?)",
    );
    writer.transaction(() => {
      for (let i = 0; i < 10001; i++)
        insert.run(id, `/bulk-${String(i).padStart(5, '0')}`, Date.now());
    })();
  } finally {
    writer.close();
  }
  const paged = await fetch(`${origin}/reports/pages?${rangeQuery}&q=bulk-&sort=label&page=2`, {
    headers: { Cookie: cookie },
  });
  assert.equal(paged.status, 200);
  const pagedHtml = await paged.text();
  assert(pagedHtml.includes('/bulk-00050') && !pagedHtml.includes('/bulk-00049'));
  const tooLarge = await fetch(`${origin}/reports/pages/export?${rangeQuery}&q=bulk-`, {
    headers: { Cookie: cookie },
  });
  assert.equal(tooLarge.status, 413);
  const bounded = await fetch(`${origin}/reports/pages/export?${rangeQuery}&q=bulk-000`, {
    headers: { Cookie: cookie },
  });
  assert.equal(bounded.status, 200);
  const boundedCsv = await bounded.text();
  assert(
    boundedCsv.includes('/bulk-00000') &&
      boundedCsv.includes('/bulk-00099') &&
      !boundedCsv.includes('/bulk-00100'),
  );
  const logout = await fetch(`${origin}/?/logout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookie, Origin: origin },
    body: new URLSearchParams(),
  });
  assert.equal(logout.status, 303);
  assert.equal(
    (await fetch(origin, { redirect: 'manual', headers: { Cookie: cookie } })).status,
    303,
  );
  console.log(
    'Production smoke passed: login, CSRF, sites, CORS, collection, privacy, country/browser dimensions, repeat filtering, dashboard, breakdown reports, CSV exports, site renaming, page reports, hourly charts and logout.',
  );
} finally {
  db?.close();
  if (server) {
    server.kill();
    await server.exited;
  }
  rmSync(dir, { recursive: true, force: true });
}
