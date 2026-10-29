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
      engagement?: boolean;
      search?: string;
    } = {},
  ) {
    let now = options.now || 10000000;
    const storage = options.storage || new Map<string, string>();
    const hits: Record<string, string>[] = [];
    const timers: (() => void)[] = [];
    const listeners: Record<string, (event?: any) => void> = {};
    const location = {
      pathname: '/',
      origin: 'https://example.com',
      href: 'https://example.com/',
      search: options.search || '',
    };
    let hidden = false;
    let focused = true;
    let scroll = 0;
    const intervals: (() => void)[] = [];
    const window: any = {};
    const history = { pushState: () => 'push', replaceState: () => 'replace' };
    runInNewContext(source, {
      document: {
        currentScript: {
          src: 'https://stats.example/tracker.js',
          dataset: {
            site: 'site-one',
            auto: options.auto,
            spa: options.spa,
            engagement: options.engagement ? 'true' : 'false',
          },
        },
        title: 'Page',
        referrer: '',
        get visibilityState() {
          return hidden ? 'hidden' : 'visible';
        },
        hasFocus: () => focused,
        documentElement: { scrollHeight: 2000 },
        body: { scrollHeight: 2000 },
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
      URLSearchParams,
      innerHeight: 1000,
      get scrollY() {
        return scroll;
      },
      setInterval: (fn: () => void) => intervals.push(fn),
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
      heartbeat: () => intervals.forEach((fn) => fn()),
      hide: (value: boolean) => {
        hidden = value;
        listeners.visibilitychange?.();
      },
      focus: (value: boolean) => {
        focused = value;
        listeners[value ? 'focus' : 'blur']?.();
      },
      scroll: (value: number) => {
        scroll = value;
        listeners.scroll?.();
      },
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
  test('captures only allowlisted campaign parameters', () => {
    const t = tracker({
      search:
        '?utm_source=newsletter&utm_medium=email&utm_campaign=launch&secret=private&email=person@example.com',
    });
    expect(t.hits[0]).toMatchObject({
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'launch',
      path: '/',
    });
    expect(JSON.stringify(t.hits[0])).not.toContain('private');
    expect(JSON.stringify(t.hits[0])).not.toContain('person@');
  });
  test('delegated link tracking handles new links, middle clicks and downloads without blocking navigation', () => {
    const t = tracker();
    const click = (href: string, download = false, button = 0, defaultPrevented = false) => {
      const anchor = { href, hasAttribute: (name: string) => download && name === 'download' };
      t.listeners[button ? 'auxclick' : 'click']({
        button,
        defaultPrevented,
        target: { closest: () => anchor },
      });
    };
    click('https://outside.example/post?secret=private#fragment');
    click('https://example.com/manual.PDF?token=private');
    click('https://outside.example/data', true, 1);
    click('https://example.com/internal');
    click('mailto:person@example.com');
    click('javascript:alert(1)');
    click('https://outside.example/cancelled', false, 0, true);
    expect(t.hits.filter((h) => h.kind === 'event')).toEqual([
      expect.objectContaining({ event: 'outbound_click', target: 'https://outside.example/post' }),
      expect.objectContaining({ event: 'file_download', target: 'https://example.com/manual.PDF' }),
      expect.objectContaining({ event: 'file_download', target: 'https://outside.example/data' }),
    ]);
  });
  test('engagement counts visible active time, sends cumulative scroll and pauses hidden or idle tabs', () => {
    const t = tracker({ engagement: true });
    t.advance(15000);
    t.heartbeat();
    expect(t.hits.at(-1)).toMatchObject({ kind: 'engagement', active_ms: 15000, max_scroll: 0 });
    t.hide(true);
    const hiddenCount = t.hits.length;
    t.advance(30000);
    t.heartbeat();
    expect(t.hits).toHaveLength(hiddenCount);
    t.hide(false);
    t.advance(15000);
    t.heartbeat();
    expect(t.hits.at(-1)?.active_ms).toBe(30000 as any);
    t.scroll(1000);
    t.heartbeat();
    expect(t.hits.at(-1)?.max_scroll).toBe(100 as any);
    t.advance(120000);
    t.heartbeat();
    expect(t.hits.at(-1)?.active_ms).toBe(90000 as any);
    const idleCount = t.hits.length;
    t.advance(15000);
    t.heartbeat();
    expect(t.hits).toHaveLength(idleCount);
  });
  test('SPA engagement is flushed to the previous page and a new page ID starts at zero', () => {
    const t = tracker({ engagement: true });
    const firstPage = t.hits[0].page;
    t.advance(10000);
    t.location.pathname = '/next';
    t.history.pushState();
    t.flush();
    expect(t.hits.at(-2)).toMatchObject({
      kind: 'engagement',
      page: firstPage,
      path: '/',
      active_ms: 10000,
    });
    expect(t.hits.at(-1)).toMatchObject({ kind: 'pageview', path: '/next' });
    expect(t.hits.at(-1)?.page).not.toBe(firstPage);
  });
  test('navigation after an expired session starts at the new page, not the old one', () => {
    const t = tracker({ engagement: true });
    const session = t.hits[0].session;
    t.advance(15000);
    t.heartbeat();
    t.hide(true);
    t.advance(31 * 60000);
    t.location.pathname = '/new-entry';
    t.history.pushState();
    t.flush();
    const pages = t.hits.filter((hit) => hit.kind === 'pageview');
    expect(pages.map((hit) => hit.path)).toEqual(['/', '/new-entry']);
    expect(pages[1].session).not.toBe(session);
  });
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
