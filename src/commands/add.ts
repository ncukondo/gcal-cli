import { Command } from "commander";
import type { CalendarEvent, AppConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import type { CreateEventInput } from "../lib/api.ts";
import { resolveTimezone, formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { selectCalendars } from "../lib/config.ts";
import { formatJsonSuccess, formatJsonError, formatEventDetailText } from "../lib/output.ts";

export interface AddOptions {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string;
  calendar?: string;
  busy?: boolean;
  free?: boolean;
  format: OutputFormat;
  timezone?: string;
}

export interface AddHandlerDeps {
  createEvent: (calendarId: string, calendarName: string, input: CreateEventInput) => Promise<CalendarEvent>;
  loadConfig: () => AppConfig;
  write: (msg: string) => void;
}

interface CommandResult {
  exitCode: number;
}

export async function handleAdd(options: AddOptions, deps: AddHandlerDeps): Promise<CommandResult> {
  if (!options.title) {
    deps.write(formatJsonError("INVALID_ARGS", "--title is required"));
    return { exitCode: ExitCode.ARGUMENT };
  }
  if (!options.start) {
    deps.write(formatJsonError("INVALID_ARGS", "--start is required"));
    return { exitCode: ExitCode.ARGUMENT };
  }
  if (!options.end) {
    deps.write(formatJsonError("INVALID_ARGS", "--end is required"));
    return { exitCode: ExitCode.ARGUMENT };
  }

  const config = deps.loadConfig();
  const timezone = resolveTimezone(options.timezone, config.timezone);

  // Determine target calendar
  const calendars = selectCalendars(options.calendar ? [options.calendar] : undefined, config);
  const { id: calendarId, name: calendarName } = calendars[0]!;

  // Build create input
  let transparency: "transparent" | "opaque" = "opaque";
  if (options.busy) transparency = "opaque";
  if (options.free) transparency = "transparent";

  let start: string;
  let end: string;
  if (options.allDay) {
    // All-day events use date-only strings
    start = options.start.slice(0, 10);
    end = options.end.slice(0, 10);
  } else {
    // Timed events: parse in timezone and format with offset
    const startDate = parseDateTimeInZone(options.start, timezone);
    const endDate = parseDateTimeInZone(options.end, timezone);
    start = formatDateTimeInZone(startDate, timezone);
    end = formatDateTimeInZone(endDate, timezone);
  }

  const input: CreateEventInput = {
    title: options.title,
    start,
    end,
    allDay: options.allDay ?? false,
    timeZone: timezone,
    transparency,
  };

  if (options.description !== undefined) {
    input.description = options.description;
  }

  const event = await deps.createEvent(calendarId, calendarName, input);

  if (options.format === "json") {
    deps.write(formatJsonSuccess({ event, message: "Event created" }));
  } else {
    const detail = formatEventDetailText(event);
    deps.write(`Event created\n\n${detail}`);
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createAddCommand(): Command {
  const cmd = new Command("add").description("Create a new event");

  cmd.option("-t, --title <title>", "Event title");
  cmd.option("-s, --start <datetime>", "Start datetime (ISO 8601)");
  cmd.option("-e, --end <datetime>", "End datetime (ISO 8601)");
  cmd.option("--all-day", "Create all-day event (use date only)");
  cmd.option("-d, --description <text>", "Event description");
  cmd.option("--busy", "Mark as busy (default)");
  cmd.option("--free", "Mark as free (transparent)");

  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  return cmd;
}
