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
  let lastPath: string | undefined;
  const path = () => location.pathname;
  function send(kind: 'pageview' | 'event', event: string, page?: string) {
    try {
      void fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: sessionId(),
          kind,
          event,
          path: page || path(),
          title: document.title,
          referrer: document.referrer,
        }),
      }).catch(() => {});
    } catch {
      /* Analytics never interrupts the host site. */
    }
  }
  function pageview(page?: string) {
    send('pageview', '', page);
  }
  function automatic() {
    const next = path();
    if (next === lastPath) return;
    lastPath = next;
    pageview(next);
  }
  window.oddhouse = { pageview, event: (name) => send('event', name) };
  if (script.dataset.auto === 'false') return;
  automatic();
  // A full-page browser back/forward may restore this document from bfcache.
  addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) {
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
