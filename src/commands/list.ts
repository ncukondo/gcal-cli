import { Command } from "commander";
import type { CalendarEvent, AppConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import type { ListEventsOptions } from "../lib/api.ts";
import { fetchFromCalendars } from "../lib/multi-calendar.ts";
import { resolveTimezone, formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { selectCalendars } from "../lib/config.ts";
import { applyFilters, findHiddenAllDayEvents } from "../lib/filter.ts";
import {
  formatEventListText,
  formatFailedCalendarsNote,
  formatHiddenAllDayWarning,
  formatJsonSuccess,
  formatQuietText,
} from "../lib/output.ts";
import type { DayRange } from "../lib/event-days.ts";
import { addDaysToDateString } from "../lib/date-utils.ts";
import { collect } from "./shared.ts";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export interface DateRangeInput {
  today?: boolean;
  days?: number;
  from?: string;
  to?: string;
}

export interface DateRange {
  timeMin: string;
  timeMax: string;
  warning?: string;
}

function todayInZone(now: Date, timezone: string): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

export function resolveDateRange(
  input: DateRangeInput,
  timezone: string,
  now: () => Date = () => new Date(),
): DateRange {
  if (input.today) {
    const todayStr = todayInZone(now(), timezone);
    const todayStart = parseDateTimeInZone(todayStr, timezone);
    const tomorrow = addDays(todayStart, 1);
    return {
      timeMin: formatDateTimeInZone(todayStart, timezone),
      timeMax: formatDateTimeInZone(tomorrow, timezone),
    };
  }

  if (input.from) {
    const fromDate = parseDateTimeInZone(input.from, timezone);
    const toDate = input.to
      ? addDays(parseDateTimeInZone(input.to, timezone), 1)
      : addDays(fromDate, 7);
    return {
      timeMin: formatDateTimeInZone(fromDate, timezone),
      timeMax: formatDateTimeInZone(toDate, timezone),
    };
  }

  // --to without --from: default from to today with warning
  if (input.to) {
    const todayStr = todayInZone(now(), timezone);
    const fromDate = parseDateTimeInZone(todayStr, timezone);
    const toDate = addDays(parseDateTimeInZone(input.to, timezone), 1);
    return {
      timeMin: formatDateTimeInZone(fromDate, timezone),
      timeMax: formatDateTimeInZone(toDate, timezone),
      warning: "--from not specified, defaulting to today",
    };
  }

  // Default: --days (default 7)
  const days = input.days ?? 7;
  if (days <= 0) {
    throw new Error("--days must be a positive integer");
  }
  const todayStr = todayInZone(now(), timezone);
  const todayStart = parseDateTimeInZone(todayStr, timezone);
  const end = addDays(todayStart, days);
  return {
    timeMin: formatDateTimeInZone(todayStart, timezone),
    timeMax: formatDateTimeInZone(end, timezone),
  };
}

/**
 * Convert the API query window into the inclusive range of calendar dates the
 * text output should cover. `timeMax` is exclusive, so a midnight boundary
 * belongs to the previous day.
 */
export function toDayRange(range: Pick<DateRange, "timeMin" | "timeMax">): DayRange {
  const from = range.timeMin.slice(0, 10);
  const endsAtMidnight = range.timeMax.slice(11, 16) === "00:00";
  const to = endsAtMidnight
    ? addDaysToDateString(range.timeMax.slice(0, 10), -1)
    : range.timeMax.slice(0, 10);
  return { from, to: to < from ? from : to };
}

export interface ListHandlerDeps {
  listEvents: (
    calendarId: string,
    calendarName: string,
    options: ListEventsOptions,
  ) => Promise<CalendarEvent[]>;
  loadConfig: () => AppConfig;
  write: (msg: string) => void;
  writeErr?: (msg: string) => void;
  now?: () => Date;
}

export interface ListOptions {
  today?: boolean;
  days?: number;
  from?: string;
  to?: string;
  format: OutputFormat;
  quiet: boolean;
  calendar?: string[];
  timezone?: string;
  busy?: boolean;
  free?: boolean;
  confirmed?: boolean;
  includeTentative?: boolean;
}

interface CommandResult {
  exitCode: number;
}

export async function handleList(
  options: ListOptions,
  deps: ListHandlerDeps,
): Promise<CommandResult> {
  const config = deps.loadConfig();
  const timezone = resolveTimezone(options.timezone, config.timezone);
  const nowFn = deps.now ?? (() => new Date());

  const dateRangeInput: DateRangeInput = {};
  if (options.today) dateRangeInput.today = options.today;
  if (options.days !== undefined) dateRangeInput.days = options.days;
  if (options.from) dateRangeInput.from = options.from;
  if (options.to) dateRangeInput.to = options.to;

  const dateRange = resolveDateRange(dateRangeInput, timezone, nowFn);

  if (dateRange.warning && deps.writeErr) {
    deps.writeErr(dateRange.warning);
  }

  const calendars = selectCalendars(
    options.calendar && options.calendar.length > 0 ? options.calendar : undefined,
    config,
  );
  const apiOptions: ListEventsOptions = {
    timeMin: dateRange.timeMin,
    timeMax: dateRange.timeMax,
  };

  const writeErr = deps.writeErr ?? (() => {});
  const { events: allEvents, failedCalendars } = await fetchFromCalendars(
    calendars,
    (cal) => deps.listEvents(cal.id, cal.name, apiOptions),
    writeErr,
  );

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  // Apply filters
  const filterOpts: Parameters<typeof applyFilters>[1] = {};
  if (options.busy) filterOpts.transparency = "busy";
  else if (options.free) filterOpts.transparency = "free";
  if (options.confirmed) filterOpts.confirmed = true;
  if (options.includeTentative) filterOpts.includeTentative = true;
  const filtered = applyFilters(allEvents, filterOpts);

  // A day booked solid with all-day events would otherwise come back empty.
  const hiddenAllDay = findHiddenAllDayEvents(allEvents, filterOpts);
  if (hiddenAllDay.length > 0) {
    writeErr(formatHiddenAllDayWarning(hiddenAllDay));
  }

  // Output
  if (options.format === "json") {
    deps.write(
      formatJsonSuccess({
        events: filtered,
        count: filtered.length,
        failed_calendars: failedCalendars,
      }),
    );
  } else {
    const dayRange = toDayRange(dateRange);
    if (options.quiet) {
      deps.write(formatQuietText(filtered, dayRange));
    } else {
      const text = formatEventListText(filtered, dayRange) || "No events found.";
      const note = formatFailedCalendarsNote(failedCalendars);
      deps.write(note ? `${text}\n\n${note}` : text);
    }
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createListCommand(): Command {
  const cmd = new Command("list").description("List events within a date range");

  cmd.option("-c, --calendar <id>", "Target calendar ID (repeatable)", collect, []);
  cmd.option("--today", "Show today's events");
  cmd.option("--days <n>", "Events for next n days (default: 7)", (v: string) =>
    Number.parseInt(v, 10),
  );
  cmd.option("--from <date>", "Start date (ISO 8601 or YYYY-MM-DD)");
  cmd.option("--to <date>", "End date (ISO 8601 or YYYY-MM-DD)");
  cmd.option("--busy", "Show only busy (opaque) events");
  cmd.option("--free", "Show only free (transparent) events");
  cmd.option("--confirmed", "Show only confirmed events");
  cmd.option("--include-tentative", "Include tentative events (excluded by default)");

  // Mutual exclusivity
  const todayOpt = cmd.options.find((o) => o.long === "--today")!;
  const daysOpt = cmd.options.find((o) => o.long === "--days")!;
  const fromOpt = cmd.options.find((o) => o.long === "--from")!;
  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;

  const toOpt = cmd.options.find((o) => o.long === "--to")!;

  todayOpt.conflicts(["days", "from"]);
  daysOpt.conflicts(["today", "from", "to"]);
  fromOpt.conflicts(["today", "days"]);
  toOpt.conflicts(["days"]);
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  return cmd;
}
