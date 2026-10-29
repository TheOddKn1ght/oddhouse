import { normalizeLanguage } from './dimensions';

export type Hit = {
  kind: 'pageview' | 'event' | 'engagement';
  path: string;
  title: string;
  referrer: string;
  event: string;
  session?: string;
  language?: string;
  page?: string;
  active_ms?: number;
  max_scroll?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  target?: string;
};

export function normalizeHit(value: unknown, siteOrigin: string): Hit | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== 'pageview' && input.kind !== 'event' && input.kind !== 'engagement')
    return null;
  if (
    typeof input.path !== 'string' ||
    !input.path.startsWith('/') ||
    input.path.startsWith('//') ||
    input.path.length > 2048
  )
    return null;
  if (
    input.session !== undefined &&
    (typeof input.session !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.session))
  )
    return null;
  // Queries never enter storage, including those sent through the manual API.
  const path = input.path.split(/[?#]/, 1)[0];
  let referrer = '';
  if (typeof input.referrer === 'string' && input.referrer.length <= 2048) {
    try {
      const source = new URL(input.referrer);
      if (['https:', 'http:'].includes(source.protocol) && source.origin !== siteOrigin)
        referrer = source.hostname;
    } catch {
      /* An absent or invalid referrer is direct traffic. */
    }
  }
  if (
    input.kind === 'event' &&
    (typeof input.event !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(input.event))
  )
    return null;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if (input.page !== undefined && (typeof input.page !== 'string' || !uuid.test(input.page)))
    return null;
  if (
    input.kind === 'engagement' &&
    (!input.session ||
      !input.page ||
      !Number.isSafeInteger(input.active_ms) ||
      Number(input.active_ms) < 0 ||
      Number(input.active_ms) > 86400000 ||
      !Number.isSafeInteger(input.max_scroll) ||
      Number(input.max_scroll) < 0 ||
      Number(input.max_scroll) > 100)
  )
    return null;
  const campaign: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign']) {
    if (
      typeof input[key] === 'string' &&
      input[key].length <= 100 &&
      !/[\u0000-\u001f\u007f]/.test(input[key])
    )
      campaign[key] = input[key].trim();
  }
  let target = '';
  if (
    input.kind === 'event' &&
    ['outbound_click', 'file_download'].includes(String(input.event)) &&
    typeof input.target === 'string' &&
    input.target.length <= 2048
  ) {
    try {
      const link = new URL(input.target, siteOrigin);
      if (['http:', 'https:'].includes(link.protocol) && !link.username && !link.password)
        target = link.origin + link.pathname;
    } catch {
      /* Ignore malformed link targets. */
    }
  }
  const language = normalizeLanguage(input.language);
  return {
    ...(language ? { language } : {}),
    ...(input.session ? { session: input.session as string } : {}),
    ...campaign,
    ...(target ? { target } : {}),
    ...(input.page ? { page: input.page as string } : {}),
    ...(input.kind === 'engagement'
      ? { active_ms: Number(input.active_ms), max_scroll: Number(input.max_scroll) }
      : {}),
    kind: input.kind as Hit['kind'],
    path,
    title: typeof input.title === 'string' ? input.title.slice(0, 200) : '',
    referrer,
    event: input.kind === 'event' ? String(input.event) : '',
  };
}
