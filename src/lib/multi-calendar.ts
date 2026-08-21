import type { CalendarConfig, CalendarEvent, ErrorCode, FailedCalendar } from "../types/index.ts";
import { ApiError } from "./api.ts";

export interface MultiCalendarResult {
  events: CalendarEvent[];
  failedCalendars: FailedCalendar[];
}

function toFailedCalendar(calendar: CalendarConfig, reason: unknown): FailedCalendar {
  const code: ErrorCode = reason instanceof ApiError ? reason.code : "API_ERROR";
  const message = reason instanceof Error ? reason.message : String(reason);
  return { id: calendar.id, name: calendar.name, error: { code, message } };
}

/**
 * Fetch from every calendar at once, keeping what came back and describing what
 * did not. A calendar that fails is warned about on stderr and listed in
 * `failedCalendars`, so a JSON reader sees the failure without parsing stderr.
 *
 * When *every* calendar fails the first error is rethrown instead: an empty
 * result would claim the calendars are empty, and with the usual single-calendar
 * setup "all failed" is simply "the fetch failed".
 *
 * Shared by `list` and `search` so the two cannot drift apart.
 */
export async function fetchFromCalendars(
  calendars: CalendarConfig[],
  fetch: (calendar: CalendarConfig) => Promise<CalendarEvent[]>,
  writeErr: (msg: string) => void,
): Promise<MultiCalendarResult> {
  const settled = await Promise.allSettled(calendars.map((cal) => fetch(cal)));

  const events: CalendarEvent[] = [];
  const failedCalendars: FailedCalendar[] = [];
  let firstReason: unknown;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const calendar = calendars[i]!;
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      if (failedCalendars.length === 0) firstReason = result.reason;
      // Warn per calendar even when the rethrow below repeats one of these:
      // three calendars failing for three reasons are only all visible here,
      // since the thrown error names just one of them. Deliberate duplication.
      writeErr(`Warning: failed to fetch calendar "${calendar.name}": ${result.reason}`);
      failedCalendars.push(toFailedCalendar(calendar, result.reason));
    }
  }

  if (calendars.length > 0 && failedCalendars.length === calendars.length) {
    throw firstReason;
  }

  return { events, failedCalendars };
}
