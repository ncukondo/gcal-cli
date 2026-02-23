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

export function formatDateTimeInZone(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, ISO_FORMAT);
}

export function parseDateTimeInZone(
  dateStr: string,
  timezone: string,
): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const normalized = isDateOnly ? `${dateStr}T00:00:00` : `${dateStr}:00`;

  return fromZonedTime(normalized, timezone);
}
