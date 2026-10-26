import { browserName, countryForAddress } from '#lib/server/dimensions.js';
import { recordHit } from '#lib/server/record-hit.js';
import { and, eq } from 'drizzle-orm';
import { sites } from '#lib/server/schema.js';
import type { RequestHandler } from './$types';
import { database } from '#lib/server/database.js';
import { normalizeHit } from '#lib/server/collection.js';

const headers = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
  Vary: 'Origin',
});
// Browser tracking is public; a site ID and origin checks are not proof of authenticity.
function siteFor(request: Request, url: URL) {
  return database()
    .select()
    .from(sites)
    .where(
      and(
        eq(sites.id, url.searchParams.get('site') || ''),
        eq(sites.origin, request.headers.get('origin') || ''),
      ),
    )
    .get();
}
export const OPTIONS: RequestHandler = ({ request, url }) => {
  const site = siteFor(request, url);
  return new Response(null, {
    status: site ? 204 : 403,
    headers: site ? headers(site.origin) : {},
  });
};
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  const site = siteFor(request, url);
  if (!site) return new Response(null, { status: 403 });
  const cors = headers(site.origin);
  if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1')
    return new Response(null, { status: 204, headers: cors });
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return new Response(null, { status: 415, headers: cors });
  // Limit actual streamed bytes, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400, headers: cors });
  let body = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return new Response(null, { status: 413, headers: cors });
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    const hit = normalizeHit(JSON.parse(body), site.origin);
    if (!hit) return new Response(null, { status: 400, headers: cors });
    recordHit(database(), site.id, hit, {
      country: countryForAddress(getClientAddress()),
      browser: browserName(request.headers.get('user-agent') || ''),
    });
    return new Response(null, { status: 204, headers: cors });
  } catch {
    return new Response(null, { status: 400, headers: cors });
  } finally {
    reader.releaseLock();
  }
};
