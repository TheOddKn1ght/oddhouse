import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { breakdownRequest } from '#lib/server/breakdown-request.js';
import { breakdownReport, EXPORT_LIMIT } from '#lib/server/breakdowns.js';
import { csvCell } from '#lib/server/report-csv.js';

export const GET: RequestHandler = ({ url, params }) => {
  const { db, site, period, options, dimension, definition } = breakdownRequest(
    url,
    params.dimension,
  );
  const report = breakdownReport(
    db,
    site.id,
    period,
    dimension,
    { ...options, page: 1 },
    EXPORT_LIMIT + 1,
  );
  if (report.totals.rows > EXPORT_LIMIT)
    error(413, 'More than 10,000 matching rows. Narrow the search or date range before exporting.');
  const rows: (string | number)[][] = [
    ['Site', site.origin],
    ['Report', definition.title],
    ['From (UTC)', period.from],
    ['To (UTC, inclusive)', period.to],
    ['Search', options.query],
    [definition.label, 'Name', definition.unit],
    ...report.rows.map((row) => [row.label, row.name, row.count]),
  ];
  return new Response(
    '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n',
    {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="oddhouse-${dimension}-${period.from}-${period.to}.csv"`,
        'Cache-Control': 'no-store',
      },
    },
  );
};
