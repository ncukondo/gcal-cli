import type { CalendarEvent } from "../types/index.ts";

export type TransparencyOption = "busy" | "free" | undefined;

export function filterByTransparency(
  events: CalendarEvent[],
  option: TransparencyOption,
): CalendarEvent[] {
  if (option === "busy") {
    return events.filter((e) => e.transparency === "opaque");
  }
  if (option === "free") {
    return events.filter((e) => e.transparency === "transparent");
  }
  return events;
}

export interface StatusFilterOptions {
  confirmed?: boolean;
  includeTentative?: boolean;
}

/**
 * Filter events by status. Cancelled events are always excluded.
 *
 * - Default (no options): returns only confirmed events.
 * - `confirmed: true`: identical to default — explicitly requesting confirmed-only.
 * - `includeTentative: true`: returns confirmed + tentative events.
 */
export function filterByStatus(
  events: CalendarEvent[],
  options: StatusFilterOptions,
): CalendarEvent[] {
  return events.filter((e) => {
    if (e.status === "cancelled") return false;
    if (options.confirmed) return e.status === "confirmed";
    if (options.includeTentative) return true;
    return e.status === "confirmed";
  });
}

export interface FilterOptions extends StatusFilterOptions {
  transparency?: TransparencyOption;
}

export function applyFilters(events: CalendarEvent[], options: FilterOptions): CalendarEvent[] {
  const afterTransparency = filterByTransparency(events, options.transparency);
  return filterByStatus(afterTransparency, options);
}

/**
 * All-day events that `--busy` removes from the result.
 *
 * Google Calendar marks all-day events as `transparent` by default, so `--busy`
 * silently drops real commitments the user never chose to mark as free. Callers
 * surface these so a booked day cannot look empty.
 *
 * Only `--busy` is reported: `--free` explicitly asks for open time, and timed
 * events dropped by `--busy` match what the user asked for.
 */
export function findHiddenAllDayEvents(
  events: CalendarEvent[],
  options: FilterOptions,
): CalendarEvent[] {
  if (options.transparency !== "busy") return [];

  return filterByStatus(events, options).filter(
    (event) => event.all_day && event.transparency === "transparent",
  );
}
