import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { database } from '#lib/server/database.js';
import { liveActivity } from '#lib/server/activity-reports.js';

// Authentication and no-store caching are enforced by hooks.server.ts.
export const GET: RequestHandler = ({ url }) => {
  const site = url.searchParams.get('site');
  if (!site || site.length > 64) return json({ error: 'A site is required.' }, { status: 400 });
  return json(liveActivity(database(), site));
};
