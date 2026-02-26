const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(input: string): boolean {
  return DATE_ONLY_RE.test(input);
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
