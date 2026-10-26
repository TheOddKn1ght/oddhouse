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
  ADDRESS_HEADER: '',
  PROTOCOL_HEADER: 'x-forwarded-proto',
};
const rawFetch = globalThis.fetch;
const fetch = (url: string | URL, init: RequestInit = {}) =>
  rawFetch(url, {
    ...init,
    headers: { Accept: 'text/html', 'X-Forwarded-Proto': 'http', ...init.headers },
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
  const collect = async (body: unknown, source = 'https://blog.example', extra = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { Origin: source, 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
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
      await collect({ kind: 'pageview', path: '/ignored' }, 'https://blog.example', {
        'Sec-GPC': '1',
      })
    ).status,
    204,
  );
  assert.equal(
    (await collect({ kind: 'pageview', path: '/bad', title: 'x'.repeat(9000) })).status,
    413,
  );
  assert.equal((await collect({ kind: 'bad', path: '/' })).status, 400);
  db = new Database(path, { readonly: true });
  assert.deepEqual(db.query('SELECT kind,path,referrer,event FROM hits ORDER BY id').all(), [
    { kind: 'pageview', path: '/post', referrer: 'search.example', event: '' },
    { kind: 'event', path: '/post', referrer: '', event: 'download' },
  ]);
  const dashboard = await fetch(`${origin}/?site=${id}`, { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  const html = await dashboard.text();
  assert(html.includes('Smoke blog') && html.includes('/post') && html.includes('download'));
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
    'Production smoke passed: login, CSRF, sites, CORS, collection, privacy, dashboard and logout.',
  );
} finally {
  db?.close();
  if (server) {
    server.kill();
    await server.exited;
  }
  rmSync(dir, { recursive: true, force: true });
}
