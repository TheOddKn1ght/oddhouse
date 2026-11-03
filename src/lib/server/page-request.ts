import { error } from '@sveltejs/kit';
import { sites, database } from './database';
import { reportPeriod } from './report-period';
import { pageReport, validPagePath } from './page-report';

export function pageRequest(url: URL) {
  const site = sites().find((site) => site.id === url.searchParams.get('site'));
  if (!site) error(404, 'Site not found.');
  const path = url.searchParams.get('path');
  if (!validPagePath(path))
    error(400, 'Use an exact page path without query parameters or fragments.');
  const period = reportPeriod(url.searchParams);
  if (period.error) error(400, period.error);
  return { site, path, period, report: pageReport(database(), site.id, path, period) };
}
