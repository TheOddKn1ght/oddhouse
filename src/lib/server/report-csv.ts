import type { dashboardReport } from './dashboard-report';
import type { ReportPeriod } from './report-period';
import { describeFilters } from './breakdowns';
import type { Filters } from './hit-filters';
import { WEEKDAYS } from './view-series';

// Quote every field and neutralize spreadsheet formula prefixes, including leading whitespace.
export function csvCell(value: string | number) {
  let text = String(value);
  const prefix = text.trimStart()[0];
  if (['=', '+', '@', '-'].includes(prefix) || ['\t', '\r', '\n'].includes(text[0]))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function reportCsv(
  report: ReturnType<typeof dashboardReport>,
  period: ReportPeriod,
  origin: string,
  filters: Filters = {},
) {
  const rows: (string | number)[][] = [
    ['Section', 'Label', 'Detail', 'Value'],
    ['Report', 'Site', '', origin],
    ['Report', 'From (UTC)', '', period.from],
    ['Report', 'To (UTC, inclusive)', '', period.to],
    ['Report', 'Breakdowns', '', 'Top 20 per dimension; daily counts include all dates'],
    ...describeFilters(filters).map((f) => [
      'Filter',
      f.title,
      f.name === f.value ? '' : f.name,
      f.value,
    ]),
  ];
  for (const [key, value] of Object.entries(report.totals)) rows.push(['Totals', key, '', value]);
  for (const [key, value] of Object.entries(report.previous))
    rows.push(['Previous period', key, '', value]);
  for (const row of report.series) rows.push(['Daily pageviews', row.day, '', row.count]);
  const bucketSection = { hour: 'Hourly', day: '', week: 'Weekly', month: 'Monthly' }[
    report.granularity
  ];
  if (bucketSection)
    for (const row of report.chartSeries)
      rows.push([
        `${bucketSection} pageviews`,
        row.day,
        report.granularity === 'hour' ? '' : 'Bucket start',
        row.count,
      ]);
  for (const [label, key] of [
    ['Session quality', 'quality'],
    ['Previous session quality', 'previousQuality'],
  ] as const) {
    const q = report[key];
    rows.push([label, 'Linked sessions', '', q.sessions]);
    rows.push([label, 'Bounce rate', 'Percent', +(q.bounceRate * 100).toFixed(1)]);
    rows.push([label, 'Pages per session', '', +q.pagesPerSession.toFixed(2)]);
    rows.push([label, 'Average duration', 'Milliseconds', Math.round(q.averageDurationMs)]);
  }
  for (const goal of report.goals) {
    const detail = `${goal.kind} ${goal.value}`;
    rows.push(['Goals', goal.name, `${detail} · conversions`, goal.conversions]);
    rows.push([
      'Goals',
      goal.name,
      `${detail} · conversion rate percent`,
      +(goal.rate * 100).toFixed(1),
    ]);
    rows.push(['Goals', goal.name, `${detail} · completions`, goal.completions]);
  }
  for (const funnel of report.funnels)
    for (const step of funnel.steps)
      rows.push([`Funnel: ${funnel.name}`, step.label, 'Sessions reaching step', step.sessions]);
  report.heatmap.grid.forEach((row, index) =>
    row.hours.forEach((value, hour) => {
      if (value)
        rows.push([
          'Weekday hours',
          WEEKDAYS[index],
          `${String(hour).padStart(2, '0')}:00 UTC`,
          value,
        ]);
    }),
  );
  const groups = [
    ['Pages', report.pages.map((r) => [r.path, '', r.count])],
    ['Referrers', report.referrers.map((r) => [r.referrer || 'Direct / unknown', '', r.count])],
    ['Events', report.events.map((r) => [r.event, '', r.count])],
    ['Countries', report.countries.map((r) => [r.name, r.country, r.count])],
    ['Browsers', report.browsers.map((r) => [r.browser, '', r.count])],
    ['Devices', report.devices.map((r) => [r.label, '', r.count])],
    ['Operating systems', report.operatingSystems.map((r) => [r.label, '', r.count])],
    ['Languages', report.languages.map((r) => [r.label, '', r.count])],
    ['Campaigns', report.campaigns.map((r) => [r.source, `${r.medium} / ${r.campaign}`, r.count])],
    ['Outbound clicks', report.outboundLinks.map((r) => [r.target, '', r.count])],
    ['Downloads', report.downloads.map((r) => [r.target, '', r.count])],
    ['Entry pages', report.entries.map((r) => [r.path, '', r.count])],
    ['Exit pages', report.exits.map((r) => [r.path, '', r.count])],
  ] as const;
  for (const [section, items] of groups) for (const row of items) rows.push([section, ...row]);
  for (const row of report.engagement) {
    rows.push(['Engagement', row.path, 'Active milliseconds', row.active_ms]);
    rows.push(['Engagement', row.path, 'Deepest scroll percent', row.max_scroll]);
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
