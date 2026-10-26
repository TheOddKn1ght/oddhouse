import { describe, expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { compileTracker } from '../scripts/build-tracker';

const readable = await compileTracker(false);
const minified = await compileTracker(true);

describe.each([
  ['development', readable],
  ['minified', minified],
])('tracker (%s)', (_name, source) => {
  function tracker(options: { auto?: string; spa?: string; dnt?: string; gpc?: boolean } = {}) {
    const hits: Record<string, string>[] = [];
    const timers: (() => void)[] = [];
    const listeners: Record<string, () => void> = {};
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
      navigator: { doNotTrack: options.dnt, globalPrivacyControl: options.gpc },
      window,
      location,
      history,
      URL,
      fetch: (_url: URL, init: RequestInit) => {
        hits.push(JSON.parse(String(init.body)));
        return Promise.resolve();
      },
      setTimeout: (fn: () => void) => timers.push(fn),
      addEventListener: (name: string, fn: () => void) => (listeners[name] = fn),
    });
    return {
      hits,
      window,
      location,
      history,
      listeners,
      flush: () => {
        while (timers.length) timers.shift()!();
      },
    };
  }
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
    }
  });
});
