const DAY = 86400000;
export const MAX_REPORT_DAYS = 366;
export type ReportPeriod = ReturnType<typeof reportPeriod>;

function parseDate(value: string | null) {
  if (!value || value.length !== 10) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

// Every report uses [since, until), with inclusive dates in the UI.
export function reportPeriod(params: URLSearchParams, now = Date.now()) {
  const today = Math.floor(now / DAY) * DAY;
  const requestedDays = Number(params.get('days') || 7);
  let days = [1, 7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  let since = today - (days - 1) * DAY;
  let until = today + DAY;
  let error: string | null = null;
  let custom = false;
  if (params.has('from') || params.has('to')) {
    const from = parseDate(params.get('from'));
    const to = parseDate(params.get('to'));
    if (
      from === null ||
      to === null ||
      from > to ||
      to > today ||
      (to - from) / DAY >= MAX_REPORT_DAYS
    ) {
      error =
        'Choose valid UTC dates, in order, up to today and at most 366 days apart (inclusive).';
    } else {
      since = from;
      until = to + DAY;
      days = (until - since) / DAY;
      custom = true;
    }
  }
  return {
    since,
    until,
    days,
    custom,
    error,
    from: new Date(since).toISOString().slice(0, 10),
    to: new Date(until - DAY).toISOString().slice(0, 10),
    today: new Date(today).toISOString().slice(0, 10),
    previousSince: since - days * DAY,
    previousUntil: since,
  };
}
