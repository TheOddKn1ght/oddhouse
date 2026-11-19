export function pageReportUrl(site: string, path: string, period: { from: string; to: string }) {
  return `/page?${new URLSearchParams({ site, path, from: period.from, to: period.to })}`;
}
export type FilterValues = Record<string, string | undefined>;
export function reportParams(
  site: string,
  period: { from: string; to: string },
  filters: FilterValues = {},
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ site, from: period.from, to: period.to, ...extra });
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) params.set(`f_${key}`, value);
  return params;
}
// Changing filters restarts pagination; null removes the filter.
export function withFilter(params: URLSearchParams, key: string, value: string | null) {
  const next = new URLSearchParams(params);
  next.delete('page');
  if (value === null) next.delete(`f_${key}`);
  else next.set(`f_${key}`, value);
  return next;
}
export function withoutFilters(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete('page');
  for (const key of Array.from(next.keys())) if (key.startsWith('f_')) next.delete(key);
  return next;
}
