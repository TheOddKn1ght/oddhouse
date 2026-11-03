export function pageReportUrl(site: string, path: string, period: { from: string; to: string }) {
  return `/page?${new URLSearchParams({ site, path, from: period.from, to: period.to })}`;
}
