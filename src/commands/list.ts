import { Command } from "commander";
import type { CalendarEvent, AppConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import type { ListEventsOptions } from "../lib/api.ts";
import { resolveTimezone, formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { selectCalendars } from "../lib/config.ts";
import { applyFilters } from "../lib/filter.ts";
import { formatEventListText, formatJsonSuccess, formatTimeRange } from "../lib/output.ts";
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

export interface ListHandlerDeps {
  listEvents: (calendarId: string, calendarName: string, options: ListEventsOptions) => Promise<CalendarEvent[]>;
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

function formatQuietText(events: CalendarEvent[]): string {
  if (events.length === 0) return "No events found.";

  const lines: string[] = [];
  for (const event of events) {
    const month = event.start.slice(5, 7);
    const day = event.start.slice(8, 10);
    const datePrefix = `${month}/${day}`;
    if (event.all_day) {
      lines.push(`${datePrefix} All day      ${event.title}`);
    } else {
      const time = formatTimeRange(event);
      lines.push(`${datePrefix} ${time}  ${event.title}`);
    }
  }
  return lines.join("\n");
}

export async function handleList(options: ListOptions, deps: ListHandlerDeps): Promise<CommandResult> {
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

  const calendars = selectCalendars(options.calendar, config);
  const apiOptions: ListEventsOptions = {
    timeMin: dateRange.timeMin,
    timeMax: dateRange.timeMax,
  };

  const writeErr = deps.writeErr ?? (() => {});
  const settled = await Promise.allSettled(
    calendars.map((cal) => deps.listEvents(cal.id, cal.name, apiOptions)),
  );
  const allEvents: CalendarEvent[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    if (result.status === "fulfilled") {
      allEvents.push(...result.value);
    } else {
      writeErr(`Warning: failed to fetch calendar "${calendars[i]!.name}": ${result.reason}`);
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  // Apply filters
  const filterOpts: Parameters<typeof applyFilters>[1] = {};
  if (options.busy) filterOpts.transparency = "busy";
  else if (options.free) filterOpts.transparency = "free";
  if (options.confirmed) filterOpts.confirmed = true;
  if (options.includeTentative) filterOpts.includeTentative = true;
  const filtered = applyFilters(allEvents, filterOpts);

  // Output
  if (options.format === "json") {
    deps.write(formatJsonSuccess({ events: filtered, count: filtered.length }));
  } else if (options.quiet) {
    deps.write(formatQuietText(filtered));
  } else {
    const text = formatEventListText(filtered);
    deps.write(text || "No events found.");
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createListCommand(): Command {
  const cmd = new Command("list").description("List events within a date range");

  cmd.option("--today", "Show today's events");
  cmd.option("--days <n>", "Events for next n days (default: 7)", (v: string) => Number.parseInt(v, 10));
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

  todayOpt.conflicts(["days", "from"]);
  daysOpt.conflicts(["today", "from"]);
  fromOpt.conflicts(["today", "days"]);
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  return cmd;
}
