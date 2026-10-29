import { activityReports } from '#lib/server/activity-reports.js';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { hits, sites as sitesTable } from '#lib/server/schema.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { database, sites } from '#lib/server/database.js';
import { cookieName, deleteSession } from '#lib/server/auth.js';

export const load: PageServerLoad = ({ url }) => {
  const allSites = sites();
  const selected = allSites.find((site) => site.id === url.searchParams.get('site')) ?? allSites[0];
  const requestedDays = Number(url.searchParams.get('days') || 7);
  const days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const since = today.getTime() - (days - 1) * 86400000;
  const db = database();
  const scope = and(eq(hits.site_id, selected?.id || ''), gte(hits.created_at, since));
  const views = and(scope, eq(hits.kind, 'pageview'));
  const totals = db
    .select({
      pageviews:
        sql<number>`coalesce(sum(case when ${hits.kind}='pageview' then 1 else 0 end),0)`.mapWith(
          Number,
        ),
      events:
        sql<number>`coalesce(sum(case when ${hits.kind}='event' then 1 else 0 end),0)`.mapWith(
          Number,
        ),
    })
    .from(hits)
    .where(scope)
    .get()!;
  const dayExpression = sql<string>`strftime('%Y-%m-%d', ${hits.created_at}/1000, 'unixepoch')`;
  const daily = db
    .select({ day: dayExpression, count: count() })
    .from(hits)
    .where(views)
    .groupBy(dayExpression)
    .orderBy(dayExpression)
    .all();
  const series = Array.from({ length: days }, (_, i) => {
    const day = new Date(since + i * 86400000).toISOString().slice(0, 10);
    return { day, count: daily.find((item) => item.day === day)?.count || 0 };
  });
  const pages = db
    .select({ path: hits.path, count: count() })
    .from(hits)
    .where(views)
    .groupBy(hits.path)
    .orderBy(desc(count()), hits.path)
    .limit(20)
    .all();
  const referrers = db
    .select({ referrer: hits.referrer, count: count() })
    .from(hits)
    .where(views)
    .groupBy(hits.referrer)
    .orderBy(desc(count()), hits.referrer)
    .limit(20)
    .all();
  const events = db
    .select({ event: hits.event, count: count() })
    .from(hits)
    .where(and(scope, eq(hits.kind, 'event')))
    .groupBy(hits.event)
    .orderBy(desc(count()), hits.event)
    .limit(20)
    .all();
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countries = db
    .select({ country: hits.country, count: count() })
    .from(hits)
    .where(views)
    .groupBy(hits.country)
    .orderBy(desc(count()), hits.country)
    .limit(20)
    .all()
    .map((row) => ({
      ...row,
      name: row.country ? countryNames.of(row.country) || row.country : 'Unknown',
    }));
  const browserExpression = sql<string>`coalesce(nullif(${hits.browser}, ''), 'Unknown')`;
  const browsers = db
    .select({ browser: browserExpression, count: count() })
    .from(hits)
    .where(views)
    .groupBy(browserExpression)
    .orderBy(desc(count()), browserExpression)
    .limit(20)
    .all();
  function dimensionCounts(column: typeof hits.device | typeof hits.os | typeof hits.language) {
    const label = sql<string>`coalesce(nullif(${column}, ''), 'Unknown')`;
    return db
      .select({ label, count: count() })
      .from(hits)
      .where(views)
      .groupBy(label)
      .orderBy(desc(count()), label)
      .limit(20)
      .all();
  }
  const devices = dimensionCounts(hits.device);
  const operatingSystems = dimensionCounts(hits.os);
  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
  const languages = dimensionCounts(hits.language).map((row) => ({
    ...row,
    label: row.label === 'Unknown' ? 'Unknown' : languageNames.of(row.label) || row.label,
  }));
  const snippet = selected
    ? `<script defer src="${url.origin}/tracker.js" data-site="${selected.id}"></script>`
    : '';
  return {
    ...activityReports(db, selected?.id || '', since),
    sites: allSites,
    selected,
    days,
    totals,
    series,
    pages,
    referrers,
    events,
    countries,
    browsers,
    devices,
    operatingSystems,
    languages,
    snippet,
  };
};

export const actions: Actions = {
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
