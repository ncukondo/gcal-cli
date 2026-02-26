const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(input: string): boolean {
  if (!DATE_ONLY_RE.test(input)) return false;
  const [y, m, d] = input.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

/**
 * Add days to a YYYY-MM-DD date string and return a YYYY-MM-DD string.
 * Uses Date.UTC internally so the result is timezone-independent.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}
