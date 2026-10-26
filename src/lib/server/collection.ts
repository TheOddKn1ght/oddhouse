export type Hit = {
  kind: 'pageview' | 'event';
  path: string;
  title: string;
  referrer: string;
  event: string;
  session?: string;
};

export function normalizeHit(value: unknown, siteOrigin: string): Hit | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== 'pageview' && input.kind !== 'event') return null;
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
  return {
    ...(input.session ? { session: input.session as string } : {}),
    kind: input.kind,
    path,
    title: typeof input.title === 'string' ? input.title.slice(0, 200) : '',
    referrer,
    event: input.kind === 'event' ? String(input.event) : '',
  };
}
