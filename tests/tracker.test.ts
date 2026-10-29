import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { compileTracker } from '../scripts/build-tracker';

const readable = await compileTracker(false);
const minified = await compileTracker(true);

describe.each([
  ['development', readable],
  ['minified', minified],
])('tracker (%s)', (_name, source) => {
  function tracker(
    options: {
      auto?: string;
      spa?: string;
      dnt?: string;
      gpc?: boolean;
      storage?: Map<string, string>;
      now?: number;
      storageBlocked?: boolean;
      webdriver?: boolean;
      language?: string;
    } = {},
  ) {
    let now = options.now || 10000000;
    const storage = options.storage || new Map<string, string>();
    const hits: Record<string, string>[] = [];
    const timers: (() => void)[] = [];
    const listeners: Record<string, (event?: any) => void> = {};
    const location = { pathname: '/' };
    const window: any = {};
    const history = { pushState: () => 'push', replaceState: () => 'replace' };
    runInNewContext(source, {
      document: {
        currentScript: {
          src: 'https://stats.example/tracker.js',
          dataset: { site: 'site-one', auto: options.auto, spa: options.spa },
        },
        title: 'Page',
        referrer: '',
      },
      navigator: {
        doNotTrack: options.dnt,
        globalPrivacyControl: options.gpc,
        webdriver: options.webdriver,
        language: options.language || 'en-US',
      },
      crypto,
      Date: class extends Date {
        static now() {
          return now;
        }
      },
      localStorage: {
        getItem: (key: string) => {
          if (options.storageBlocked) throw new Error('blocked');
          return storage.get(key) || null;
        },
        setItem: (key: string, value: string) => {
          if (options.storageBlocked) throw new Error('blocked');
          storage.set(key, value);
        },
      },
      window,
      location,
      history,
      URL,
      fetch: (_url: URL, init: RequestInit) => {
        hits.push(JSON.parse(String(init.body)));
        return Promise.resolve();
      },
      setTimeout: (fn: () => void) => timers.push(fn),
      addEventListener: (name: string, fn: (event?: any) => void) => (listeners[name] = fn),
    });
    return {
      hits,
      storage,
      advance: (ms: number) => (now += ms),
      window,
      location,
      history,
      listeners,
      flush: () => {
        while (timers.length) timers.shift()!();
      },
    };
  }
  test('sends preferred language and skips WebDriver without storing a session', () => {
    const normal = tracker({ language: 'fr-CA' });
    expect(normal.hits[0].language).toBe('fr-CA');
    const automated = tracker({ webdriver: true });
    expect(automated.hits).toHaveLength(0);
    expect(automated.storage.size).toBe(0);
    expect(automated.window.oddhouse).toBeUndefined();
  });
  test('static site counts once and manual custom events use the current path', () => {
    const t = tracker({ spa: 'false' });
    expect(t.hits).toHaveLength(1);
    t.window.oddhouse.event('download');
    expect(t.hits[1]).toMatchObject({ kind: 'event', event: 'download', path: '/' });
    expect(t.listeners.popstate).toBeUndefined();
  });
  test('SPA counts pushState, replaceState, back and forward without duplicate routes', () => {
    const t = tracker();
    t.location.pathname = '/one';
    expect(t.history.pushState()).toBe('push');
    t.history.replaceState();
    t.flush();
    expect(t.hits.map((h) => h.path)).toEqual(['/', '/one']);
    t.history.replaceState();
    t.flush();
    expect(t.hits).toHaveLength(2);
    t.location.pathname = '/two';
    t.history.replaceState();
    t.flush();
    t.location.pathname = '/one';
    t.listeners.popstate();
    t.flush();
    t.location.pathname = '/two';
    t.listeners.popstate();
    t.flush();
    expect(t.hits.map((h) => h.path)).toEqual(['/', '/one', '/two', '/one', '/two']);
  });
  test('manual mode leaves routing and initial pageviews to the caller', () => {
    const t = tracker({ auto: 'false' });
    expect(t.hits).toHaveLength(0);
    t.window.oddhouse.pageview('/virtual');
    expect(t.hits[0].path).toBe('/virtual');
    expect(t.listeners.popstate).toBeUndefined();
  });
  test('DNT and GPC prevent tracker registration and all network requests', () => {
    for (const options of [{ dnt: '1' }, { gpc: true }]) {
      const t = tracker(options);
      expect(t.hits).toHaveLength(0);
      expect(t.window.oddhouse).toBeUndefined();
      expect(t.storage.size).toBe(0);
    }
  });
  test('restored static documents recheck pageviews using the same session', () => {
    const t = tracker({ spa: 'false' });
    t.listeners.pageshow({ persisted: false });
    expect(t.hits).toHaveLength(1);
    t.listeners.pageshow({ persisted: true });
    expect(t.hits).toHaveLength(2);
    expect(t.hits[1].session).toBe(t.hits[0].session);
  });
  test('blocked storage still tracks and malformed stored tokens are replaced', () => {
    const blocked = tracker({ storageBlocked: true });
    blocked.window.oddhouse.pageview('/second');
    expect(blocked.hits).toHaveLength(2);
    expect(blocked.hits[1].session).toBe(blocked.hits[0].session);
    const storage = new Map([
      ['oddhouse:site-one:session', JSON.stringify({ id: '-'.repeat(36), lastSeen: 10000000 })],
    ]);
    const recovered = tracker({ storage });
    expect(recovered.hits[0].session).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4/);
  });
  test('session survives reload and rotates after 30 minutes of inactivity', () => {
    const first = tracker();
    const reloaded = tracker({ storage: first.storage });
    expect(reloaded.hits[0].session).toBe(first.hits[0].session);
    reloaded.advance(30 * 60 * 1000);
    reloaded.window.oddhouse.pageview('/later');
    expect(reloaded.hits.at(-1)?.session).not.toBe(first.hits[0].session);
  });
});
