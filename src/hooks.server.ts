import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { cookieName, userForSession } from '#lib/server/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
  const publicPaths = new Set([
    '/login',
    '/api/health',
    '/api/collect',
    '/tracker.js',
    '/robots.txt',
  ]);
  if (!publicPaths.has(event.url.pathname)) {
    const user = userForSession(event.cookies.get(cookieName));
    if (!user) redirect(303, '/login');
  }
  const response = await resolve(event);
  if (!['/tracker.js', '/robots.txt'].includes(event.url.pathname)) {
    response.headers.set('Cache-Control', 'no-store');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'same-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
};
