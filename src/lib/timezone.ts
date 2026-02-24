import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const COMMON_ABBREVIATIONS: Record<string, string> = {
  JST: "Asia/Tokyo",
  EST: "America/New_York",
  CST: "America/Chicago",
  MST: "America/Denver",
  PST: "America/Los_Angeles",
  GMT: "Etc/GMT",
  CET: "Europe/Paris",
  EET: "Europe/Bucharest",
  IST: "Asia/Kolkata",
  KST: "Asia/Seoul",
  CST_CN: "Asia/Shanghai",
  AEST: "Australia/Sydney",
};

export function resolveTimezone(cliTz?: string, configTz?: string): string {
  const tz = cliTz ?? configTz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // If tz is a known abbreviation, resolve to canonical IANA name
  const canonical = COMMON_ABBREVIATIONS[tz.toUpperCase()];
  if (canonical && !tz.includes("/")) {
    return canonical;
  }

  if (!isValidTimezone(tz)) {
    const hint = 'Use an IANA timezone name (e.g. "Asia/Tokyo", "America/New_York").';
    throw new Error(`Invalid timezone: ${tz}. ${hint}`);
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
const OFFSET_RE = /(?:[+-]\d{2}:\d{2}|Z)$/;

// Expects a pre-validated timezone; callers should use resolveTimezone first.
export function parseDateTimeInZone(dateStr: string, timezone: string): Date {
  // If the string already contains a timezone offset, parse directly
  if (OFFSET_RE.test(dateStr)) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid date string: ${dateStr}`);
    }
    return date;
  }

  let normalized: string;
  if (DATE_ONLY_RE.test(dateStr)) {
    normalized = `${dateStr}T00:00:00`;
  } else if (DATETIME_NO_SECONDS_RE.test(dateStr)) {
    normalized = `${dateStr}:00`;
  } else {
    normalized = dateStr;
  }

  const result = fromZonedTime(normalized, timezone);
  if (Number.isNaN(result.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return result;
}
