import { dashboardReport } from '#lib/server/dashboard-report.js';
import { reportPeriod } from '#lib/server/report-period.js';
import { sites as sitesTable } from '#lib/server/schema.js';
import { collectionStatus, renameSite } from '#lib/server/site-management.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { database, sites } from '#lib/server/database.js';
import { cookieName, deleteSession } from '#lib/server/auth.js';

export const load: PageServerLoad = ({ url }) => {
  const allSites = sites();
  const selected = allSites.find((site) => site.id === url.searchParams.get('site')) ?? allSites[0];
  const period = reportPeriod(url.searchParams);
  return {
    ...dashboardReport(database(), selected?.id || '', period),
    sites: allSites,
    selected,
    period,
    lastHit: selected ? collectionStatus(database(), selected.id) : null,
    snippet: selected
      ? `<script defer src="${url.origin}/tracker.js" data-site="${selected.id}"></script>`
      : '',
  };
};

export const actions: Actions = {
  renameSite: async ({ request }) => {
    const form = await request.formData();
    const result = renameSite(
      database(),
      String(form.get('id') || ''),
      String(form.get('name') || ''),
    );
    if (result.error) return fail(result.status, { renameError: result.error });
    return { renamed: true };
  },
  createSite: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    const input = String(form.get('origin') || '').trim();
    if (!name || name.length > 100)
      return fail(400, { error: 'Enter a site name of up to 100 characters.' });
    let origin: URL;
    try {
      origin = new URL(input);
    } catch {
      return fail(400, { error: 'Enter a full site origin, such as https://example.com.' });
    }
    if (
      !['https:', 'http:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      return fail(400, {
        error: 'Use an HTTP(S) origin without a path, credentials, query, or fragment.',
      });
    }
    if (sites().some((site) => site.origin === origin.origin))
      return fail(400, { error: 'This origin is already registered.' });
    const id = crypto.randomUUID();
    database()
      .insert(sitesTable)
      .values({ id, name, origin: origin.origin, created_at: Date.now() })
      .run();
    redirect(303, `/?site=${id}`);
  },
  logout: ({ cookies }) => {
    const token = cookies.get(cookieName);
    if (token) deleteSession(token);
    cookies.delete(cookieName, { path: '/' });
    redirect(303, '/login');
  },
};
