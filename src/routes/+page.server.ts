import { dashboardReport } from '#lib/server/dashboard-report.js';
import { reportPeriod } from '#lib/server/report-period.js';
import { sites as sitesTable } from '#lib/server/schema.js';
import { collectionStatus, renameSite } from '#lib/server/site-management.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { database, sites } from '#lib/server/database.js';
import { cookieName, deleteSession } from '#lib/server/auth.js';
import { parseFilters } from '#lib/server/hit-filters.js';
import { chartInterval } from '#lib/server/view-series.js';
import { describeFilters } from '#lib/server/breakdowns.js';
import {
  createFunnel,
  createGoal,
  deleteDefinition,
  MAX_FUNNEL_STEPS,
} from '#lib/server/conversions.js';
import { RETENTION_OPTIONS, schedulePurge, setRetention } from '#lib/server/retention.js';

function formSite(form: FormData) {
  const id = String(form.get('id') || '');
  return sites().find((site) => site.id === id);
}

export const load: PageServerLoad = ({ url }) => {
  const allSites = sites();
  const selected = allSites.find((site) => site.id === url.searchParams.get('site')) ?? allSites[0];
  const period = reportPeriod(url.searchParams);
  const filters = parseFilters(url.searchParams);
  const interval = chartInterval(url.searchParams, period);
  return {
    ...dashboardReport(database(), selected?.id || '', period, filters, interval),
    filters,
    filterChips: describeFilters(filters),
    interval,
    retentionOptions: RETENTION_OPTIONS,
    maxFunnelSteps: MAX_FUNNEL_STEPS,
    sites: allSites,
    selected,
    period,
    lastHit: selected ? collectionStatus(database(), selected.id) : null,
    snippet: selected
      ? `<script defer src="${url.origin}/oddhouse.js" data-site="${selected.id}"></script>`
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
  setRetention: async ({ request }) => {
    const form = await request.formData();
    const result = setRetention(
      database(),
      String(form.get('id') || ''),
      String(form.get('retention') ?? ''),
    );
    if (result.error) return fail(result.status, { settingsError: result.error });
    schedulePurge(database());
    return { settingsSaved: 'Retention saved.' };
  },
  createGoal: async ({ request }) => {
    const form = await request.formData();
    const site = formSite(form);
    if (!site) return fail(404, { settingsError: 'Site not found.' });
    const result = createGoal(database(), site.id, {
      name: form.get('name'),
      kind: form.get('kind'),
      value: form.get('value'),
    });
    if (result.error) return fail(400, { settingsError: result.error });
    return { settingsSaved: 'Goal added.' };
  },
  createFunnel: async ({ request }) => {
    const form = await request.formData();
    const site = formSite(form);
    if (!site) return fail(404, { settingsError: 'Site not found.' });
    const steps = Array.from({ length: MAX_FUNNEL_STEPS }, (_, index) => ({
      kind: form.get(`kind${index}`),
      value: form.get(`value${index}`),
    }));
    const result = createFunnel(database(), site.id, form.get('name'), steps);
    if (result.error) return fail(400, { settingsError: result.error });
    return { settingsSaved: 'Funnel added.' };
  },
  deleteDefinition: async ({ request }) => {
    const form = await request.formData();
    const site = formSite(form);
    if (!site) return fail(404, { settingsError: 'Site not found.' });
    const type = form.get('type') === 'funnel' ? 'funnel' : 'goal';
    deleteDefinition(database(), site.id, type, String(form.get('definition') || ''));
    return { settingsSaved: type === 'goal' ? 'Goal deleted.' : 'Funnel deleted.' };
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
