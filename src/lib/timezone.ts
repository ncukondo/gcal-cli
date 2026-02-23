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
