import { Command } from "commander";
import type { CalendarEvent, AppConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import type { CreateEventInput } from "../lib/api.ts";
import { resolveTimezone, formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { selectCalendars } from "../lib/config.ts";
import { formatJsonSuccess, formatJsonError, formatEventDetailText } from "../lib/output.ts";
import { isDateOnly } from "../lib/date-utils.ts";
import { parseDuration } from "../lib/duration.ts";
import { addDays } from "date-fns";

export interface AddOptions {
  title: string;
  start: string;
  end?: string;
  duration?: string;
  description?: string;
  calendar?: string;
  busy?: boolean;
  free?: boolean;
  format: OutputFormat;
  timezone?: string;
}

export interface AddHandlerDeps {
  createEvent: (
    calendarId: string,
    calendarName: string,
    input: CreateEventInput,
  ) => Promise<CalendarEvent>;
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

  // Validate --end and --duration are not both specified
  if (options.end && options.duration) {
    deps.write(formatJsonError("INVALID_ARGS", "--end and --duration cannot be used together"));
    return { exitCode: ExitCode.ARGUMENT };
  }

  const allDay = isDateOnly(options.start);

  // Validate start/end type consistency
  if (options.end) {
    const endIsDateOnly = isDateOnly(options.end);
    if (allDay !== endIsDateOnly) {
      deps.write(
        formatJsonError(
          "INVALID_ARGS",
          "--start and --end must be the same type (both date-only or both datetime)",
        ),
      );
      return { exitCode: ExitCode.ARGUMENT };
    }
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

  if (allDay) {
    start = options.start.slice(0, 10);

    if (options.end) {
      // Inclusive end → exclusive (+1 day for API)
      const endDate = new Date(options.end + "T00:00:00");
      const exclusiveEnd = addDays(endDate, 1);
      end = exclusiveEnd.toISOString().slice(0, 10);
    } else if (options.duration) {
      const durationMs = parseDuration(options.duration);
      const startDate = new Date(options.start + "T00:00:00");
      const endDate = new Date(startDate.getTime() + durationMs);
      end = endDate.toISOString().slice(0, 10);
    } else {
      // Default: same day → exclusive end is +1 day
      const startDate = new Date(options.start + "T00:00:00");
      const exclusiveEnd = addDays(startDate, 1);
      end = exclusiveEnd.toISOString().slice(0, 10);
    }
  } else {
    // Timed events
    const startDate = parseDateTimeInZone(options.start, timezone);
    start = formatDateTimeInZone(startDate, timezone);

    if (options.end) {
      const endDate = parseDateTimeInZone(options.end, timezone);
      end = formatDateTimeInZone(endDate, timezone);
    } else if (options.duration) {
      const durationMs = parseDuration(options.duration);
      const endDate = new Date(startDate.getTime() + durationMs);
      end = formatDateTimeInZone(endDate, timezone);
    } else {
      // Default: +1 hour
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      end = formatDateTimeInZone(endDate, timezone);
    }
  }

  const input: CreateEventInput = {
    title: options.title,
    start,
    end,
    allDay,
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

  cmd.option("-t, --title <title>", "Event title (required)");
  cmd.option(
    "-s, --start <datetime>",
    "Start date or datetime (required). Date-only (YYYY-MM-DD) creates all-day event. Datetime (YYYY-MM-DDTHH:MM) creates timed event.",
  );
  cmd.option(
    "-e, --end <datetime>",
    "End date or datetime. Optional. Default: same day (all-day) or +1h (timed). All-day end is inclusive.",
  );
  cmd.option(
    "--duration <duration>",
    "Duration instead of --end (e.g. 30m, 1h, 2d, 1h30m). Mutually exclusive with --end.",
  );
  cmd.option("-d, --description <text>", "Event description");
  cmd.option("--busy", "Mark as busy (default)");
  cmd.option("--free", "Mark as free (transparent)");

  const endOpt = cmd.options.find((o) => o.long === "--end")!;
  const durationOpt = cmd.options.find((o) => o.long === "--duration")!;
  endOpt.conflicts(["duration"]);
  durationOpt.conflicts(["end"]);

  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  cmd.addHelpText(
    "after",
    `
Examples:
  gcal add -t "Holiday" -s "2026-01-24"                                   # All-day, 1 day
  gcal add -t "Vacation" -s "2026-01-24" -e "2026-01-26"                  # All-day, 3 days (inclusive)
  gcal add -t "Camp" -s "2026-01-24" --duration 2d                        # All-day, 2 days
  gcal add -t "Meeting" -s "2026-01-24T10:00"                             # Timed, 1h default
  gcal add -t "Meeting" -s "2026-01-24T10:00" -e "2026-01-24T11:30"      # Timed, explicit end
  gcal add -t "Standup" -s "2026-01-24T10:00" --duration 30m             # Timed, 30 min
  gcal add -t "Focus" -s "2026-01-24T09:00" --duration 2h --free         # Timed, free
`,
  );

  return cmd;
}
