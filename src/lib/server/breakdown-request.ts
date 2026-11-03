import { error } from '@sveltejs/kit';
import { database, sites } from './database';
import { reportPeriod } from './report-period';
import { breakdowns, breakdownOptions, isBreakdown } from './breakdowns';

export function breakdownRequest(url: URL, dimension: string) {
  if (!isBreakdown(dimension)) error(404, 'Report not found.');
  const site = sites().find((site) => site.id === url.searchParams.get('site'));
  if (!site) error(404, 'Site not found.');
  const period = reportPeriod(url.searchParams);
  if (period.error) error(400, period.error);
  const options = breakdownOptions(url.searchParams);
  const { title, label, unit } = breakdowns[dimension];
  return { db: database(), site, period, options, dimension, definition: { title, label, unit } };
}
