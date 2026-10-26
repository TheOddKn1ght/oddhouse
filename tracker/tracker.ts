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

/* Oddhouse: no cookies, storage, or visitor identifiers. */
(() => {
  'use strict';
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script || !script.dataset.site || window.oddhouse) return;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const endpoint = new URL('/api/collect', script.src);
  endpoint.searchParams.set('site', script.dataset.site);
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
