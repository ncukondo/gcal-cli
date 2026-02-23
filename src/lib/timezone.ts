import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(cliTz?: string, configTz?: string): string {
  const tz = cliTz ?? configTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!isValidTimezone(tz)) {
    throw new Error(`Invalid timezone: ${tz}`);
  }

  return tz;
}

const ISO_FORMAT = "yyyy-MM-dd'T'HH:mm:ssxxx";

// Expects a pre-validated timezone; callers should use resolveTimezone first.
export function formatDateTimeInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, ISO_FORMAT);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_NO_SECONDS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Expects a pre-validated timezone; callers should use resolveTimezone first.
export function parseDateTimeInZone(dateStr: string, timezone: string): Date {
  let normalized: string;
  if (DATE_ONLY_RE.test(dateStr)) {
    normalized = `${dateStr}T00:00:00`;
  } else if (DATETIME_NO_SECONDS_RE.test(dateStr)) {
    normalized = `${dateStr}:00`;
  } else {
    normalized = dateStr;
  }

  return fromZonedTime(normalized, timezone);
}
