export const formatCount = (value: number) => value.toLocaleString();
export const formatDuration = (ms: number) =>
  `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
export function comparison(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 'No change' : 'No previous activity';
  const percent = ((current - previous) / previous) * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
}
