import type { RequestHandler } from './$types';
import { pageRequest } from '#lib/server/page-request.js';
import { pageReportCsv } from '#lib/server/page-report.js';
export const GET: RequestHandler = ({ url }) => {
  const { site, path, period, report } = pageRequest(url);
  return new Response(pageReportCsv(report, period, site.origin, path), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="oddhouse-page-${period.from}-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
