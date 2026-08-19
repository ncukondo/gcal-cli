import type { AttendeeInput, SendUpdates } from "./api.ts";

/**
 * CLI-facing names for the API's sendUpdates values. "external" is spelled out
 * as externalOnly by the API; the shorter form reads better as a flag value.
 */
const NOTIFY_VALUES: Record<string, SendUpdates> = {
  all: "all",
  external: "externalOnly",
  none: "none",
};

export const NOTIFY_CHOICES = Object.keys(NOTIFY_VALUES);

export function parseNotify(value: string | undefined): SendUpdates {
  if (value === undefined) {
    return "none";
  }
  const mapped = NOTIFY_VALUES[value];
  if (!mapped) {
    throw new Error(`Invalid --notify value: "${value}". Use ${NOTIFY_CHOICES.join(", ")}.`);
  }
  return mapped;
}

export function parseAttendees(values: string[]): AttendeeInput[] {
  const seen = new Set<string>();
  const attendees: AttendeeInput[] = [];

  for (const value of values) {
    const email = value.trim();
    if (!email) {
      throw new Error("Attendee email address cannot be empty.");
    }
    if (!email.includes("@")) {
      throw new Error(`Invalid attendee email address: "${email}".`);
    }
    // Google treats addresses case-insensitively, so "A@x.com" and "a@x.com"
    // would collapse into one attendee server-side anyway.
    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    attendees.push({ email });
  }

  return attendees;
}
