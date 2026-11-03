import type { PageServerLoad } from './$types';
import { breakdownRequest } from '#lib/server/breakdown-request.js';
import { breakdownReport, EXPORT_LIMIT } from '#lib/server/breakdowns.js';

export const load: PageServerLoad = ({ url, params }) => {
  const { db, site, period, options, dimension, definition } = breakdownRequest(
    url,
    params.dimension,
  );
  return {
    exportLimit: EXPORT_LIMIT,
    site,
    period,
    options,
    dimension,
    definition,
    report: breakdownReport(db, site.id, period, dimension, options),
  };
};
