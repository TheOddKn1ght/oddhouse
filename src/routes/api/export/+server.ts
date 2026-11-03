import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { database, sites } from '#lib/server/database.js';
import { reportPeriod } from '#lib/server/report-period.js';
import { dashboardReport } from '#lib/server/dashboard-report.js';
import { reportCsv } from '#lib/server/report-csv.js';

export const GET: RequestHandler = ({ url }) => {
  const site = sites().find((site) => site.id === url.searchParams.get('site'));
  if (!site) error(404, 'Site not found.');
  const period = reportPeriod(url.searchParams);
  if (period.error) error(400, period.error);
  const report = dashboardReport(database(), site.id, period);
  return new Response(reportCsv(report, period, site.origin), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="oddhouse-${period.from}-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
