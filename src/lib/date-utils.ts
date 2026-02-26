const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(input: string): boolean {
  return DATE_ONLY_RE.test(input);
}
