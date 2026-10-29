export interface OddhouseTracker {
  pageview(path?: string): void;
  event(name: string): void;
}

declare global {
  interface Window {
    oddhouse?: OddhouseTracker;
  }
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
}

/* Oddhouse: site-scoped, short-lived session storage; no tracking cookies. */
(() => {
  'use strict';
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script || !script.dataset.site || window.oddhouse) return;
  if (navigator.webdriver === true) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const endpoint = new URL('/api/collect', script.src);
  endpoint.searchParams.set('site', script.dataset.site);
  const storageKey = `oddhouse:${script.dataset.site}:session`;
  const sessionIdle = 30 * 60 * 1000;
  let memorySession: { id: string; lastSeen: number } | undefined;
  function sessionId() {
    const now = Date.now();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (
        saved &&
        typeof saved.id === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(saved.id) &&
        Number.isFinite(saved.lastSeen) &&
        saved.lastSeen <= now &&
        now - saved.lastSeen < sessionIdle
      )
        memorySession = saved;
    } catch {
      /* Storage may be unavailable; retain a session for this page in memory. */
    }
    if (
      !memorySession ||
      now - memorySession.lastSeen >= sessionIdle ||
      memorySession.lastSeen > now
    ) {
      memorySession = { id: crypto.randomUUID(), lastSeen: now };
    }
    memorySession.lastSeen = now;
    try {
      localStorage.setItem(storageKey, JSON.stringify(memorySession));
    } catch {
      /* Best effort. */
    }
    return memorySession.id;
  }
  const engagementEnabled = script.dataset.engagement !== 'false';
  const campaigns: Record<string, string> = {};
  const parameters = new URLSearchParams(location.search || '');
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = parameters.get(key);
    if (value && value.length <= 100) campaigns[key] = value;
  }
  type Page = {
    path: string;
    page: string;
    session: string;
    activeMs: number;
    scroll: number;
    lastTick: number;
    lastInteraction: number;
    visible: boolean;
    sentActive: number;
    sentScroll: number;
  };
  let current: Page | undefined;
  let lastPath: string | undefined;
  const visible = () => document.visibilityState !== 'hidden' && document.hasFocus();
  function post(
    kind: 'pageview' | 'event' | 'engagement',
    page: string,
    token: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      void fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: navigator.language,
          session: token,
          kind,
          path: page,
          title: document.title,
          referrer: document.referrer,
          ...campaigns,
          ...extra,
        }),
      }).catch(() => {});
    } catch {
      /* Analytics never interrupts the host site. */
    }
  }
  function depth() {
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0,
    );
    if (height <= innerHeight) return 100;
    return Math.round(Math.max(0, Math.min(100, (scrollY / (height - innerHeight)) * 100)));
  }
  function measure() {
    if (!current) return;
    const now = Date.now();
    if (current.visible)
      current.activeMs += Math.max(
        0,
        Math.min(60000, Math.min(now, current.lastInteraction + 60000) - current.lastTick),
      );
    current.lastTick = now;
    current.visible = visible();
  }
  function startPage(path: string) {
    const now = Date.now();
    current = {
      path,
      page: crypto.randomUUID(),
      session: sessionId(),
      activeMs: 0,
      scroll: 0,
      lastTick: now,
      lastInteraction: now,
      visible: visible(),
      sentActive: -1,
      sentScroll: -1,
    };
    post('pageview', path, current.session, engagementEnabled ? { page: current.page } : {});
  }
  function flush(force = false, rotate = true) {
    if (!engagementEnabled || !current) return;
    measure();
    if (current.visible) current.scroll = Math.max(current.scroll, depth());
    if (!force && current.activeMs === current.sentActive && current.scroll === current.sentScroll)
      return;
    const token = sessionId();
    if (token !== current.session) {
      if (rotate) startPage(current.path);
      return;
    }
    post('engagement', current.path, token, {
      page: current.page,
      active_ms: Math.min(86400000, Math.floor(current.activeMs)),
      max_scroll: current.scroll,
    });
    current.sentActive = current.activeMs;
    current.sentScroll = current.scroll;
  }
  function pageview(page = location.pathname) {
    flush(true, false);
    startPage(page);
  }
  function event(name: string, extra: Record<string, unknown> = {}) {
    flush();
    post('event', current?.path || location.pathname, sessionId(), { event: name, ...extra });
  }
  function automatic() {
    const next = location.pathname;
    if (next === lastPath) return;
    lastPath = next;
    pageview(next);
  }
  window.oddhouse = { pageview, event: (name) => event(name) };
  if (engagementEnabled) {
    setInterval(() => {
      if (visible()) flush();
    }, 15000);
    for (const name of ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll']) {
      addEventListener(
        name,
        () => {
          measure();
          if (current) {
            current.lastInteraction = Date.now();
            if (name === 'scroll' && visible()) current.scroll = Math.max(current.scroll, depth());
          }
        },
        { passive: true },
      );
    }
    addEventListener('visibilitychange', () => flush(true));
    addEventListener('blur', () => flush(true));
    addEventListener('focus', () => {
      measure();
      if (current) current.lastInteraction = Date.now();
    });
    addEventListener('pagehide', () => flush(true));
  }
  if (script.dataset.links !== 'false') {
    const click = (clickEvent: MouseEvent) => {
      if (clickEvent.defaultPrevented || clickEvent.button > 1) return;
      const anchor = (clickEvent.target as Element | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      try {
        const link = new URL(anchor.href, location.href);
        if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password) return;
        const target = link.origin + link.pathname;
        if (
          anchor.hasAttribute('download') ||
          /\.(?:pdf|zip|gz|tar|7z|rar|docx?|xlsx?|pptx?|csv|epub|mp3|mp4|webm|exe|dmg|apk)$/i.test(
            link.pathname,
          )
        )
          event('file_download', { target });
        else if (link.origin !== location.origin) event('outbound_click', { target });
      } catch {
        /* Ignore unsupported links. */
      }
    };
    addEventListener('click', click);
    addEventListener('auxclick', click);
  }
  if (script.dataset.auto === 'false') return;
  automatic();
  addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) {
      current = undefined;
      lastPath = undefined;
      automatic();
    }
  });
  if (script.dataset.spa === 'false') return;
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      automatic();
    }, 0);
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      schedule();
      return result;
    };
  }
  addEventListener('popstate', schedule);
})();
