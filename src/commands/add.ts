import { Command } from "commander";
import type { CalendarEvent, AppConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import type { CreateEventInput } from "../lib/api.ts";
import { resolveTimezone, formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { selectCalendars } from "../lib/config.ts";
import { formatJsonSuccess, formatJsonError, formatEventDetailText } from "../lib/output.ts";
import { isDateOnly, addDaysToDateString } from "../lib/date-utils.ts";
import { parseDuration } from "../lib/duration.ts";

export interface AddOptions {
  title: string;
  start: string;
  end?: string;
  duration?: string;
  description?: string;
  calendar?: string;
  busy?: boolean;
  free?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
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
    start = options.start;

    if (options.end) {
      // Inclusive end → exclusive (+1 day for API)
      end = addDaysToDateString(options.end, 1);
    } else if (options.duration) {
      let durationMs: number;
      try {
        durationMs = parseDuration(options.duration);
      } catch {
        deps.write(
          formatJsonError(
            "INVALID_ARGS",
            `Invalid duration: "${options.duration}". Use formats like 30m, 1h, 2d, 1h30m.`,
          ),
        );
        return { exitCode: ExitCode.ARGUMENT };
      }
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      if (durationMs % MS_PER_DAY !== 0) {
        deps.write(
          formatJsonError(
            "INVALID_ARGS",
            "All-day events require day-unit duration (e.g. 1d, 2d). Sub-day durations like hours or minutes are not allowed.",
          ),
        );
        return { exitCode: ExitCode.ARGUMENT };
      }
      const days = durationMs / MS_PER_DAY;
      end = addDaysToDateString(options.start, days);
    } else {
      // Default: same day → exclusive end is +1 day
      end = addDaysToDateString(options.start, 1);
    }
  } else {
    // Timed events
    const startDate = parseDateTimeInZone(options.start, timezone);
    start = formatDateTimeInZone(startDate, timezone);

    if (options.end) {
      const endDate = parseDateTimeInZone(options.end, timezone);
      end = formatDateTimeInZone(endDate, timezone);
    } else if (options.duration) {
      let durationMs: number;
      try {
        durationMs = parseDuration(options.duration);
      } catch {
        deps.write(
          formatJsonError(
            "INVALID_ARGS",
            `Invalid duration: "${options.duration}". Use formats like 30m, 1h, 2d, 1h30m.`,
          ),
        );
        return { exitCode: ExitCode.ARGUMENT };
      }
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

  if (options.dryRun) {
    const preview: Record<string, unknown> = {
      title: input.title,
      start: input.start,
      end: input.end,
    };
    if (input.description !== undefined) preview.description = input.description;
    if (input.transparency !== "opaque") preview.transparency = input.transparency;

    if (options.format === "json") {
      deps.write(formatJsonSuccess({ dry_run: true, action: "add", event: preview }));
    } else {
      const lines = ["DRY RUN: Would create event:"];
      lines.push(`  title: "${preview.title}"`);
      lines.push(`  start: "${preview.start}"`);
      lines.push(`  end: "${preview.end}"`);
      if (preview.description !== undefined) lines.push(`  description: "${preview.description}"`);
      if (preview.transparency !== undefined) lines.push(`  transparency: ${preview.transparency}`);
      deps.write(lines.join("\n"));
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  const event = await deps.createEvent(calendarId, calendarName, input);

  if (options.format === "json") {
    deps.write(formatJsonSuccess({ event, message: "Event created" }));
  } else if (options.quiet) {
    deps.write(event.id);
  } else {
    const detail = formatEventDetailText(event);
    deps.write(`Event created\n\n${detail}`);
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createAddCommand(): Command {
  const cmd = new Command("add").description("Create a new event");

  cmd.requiredOption("-t, --title <title>", "Event title");
  cmd.requiredOption(
    "-s, --start <datetime>",
    "Start date or datetime. Date-only (YYYY-MM-DD) creates all-day event. Datetime (YYYY-MM-DDTHH:MM) creates timed event.",
  );
  cmd.option(
    "-e, --end <datetime>",
    "End date or datetime. Optional. Default: same day (all-day) or +1h (timed). All-day end is inclusive.",
  );
  cmd.option(
    "--duration <duration>",
    "Duration instead of --end (e.g. 30m, 1h, 2d, 1h30m). Mutually exclusive with --end.",
  );
  cmd.option("-c, --calendar <id>", "Target calendar ID");
  cmd.option("-d, --description <text>", "Event description");
  cmd.option("--busy", "Mark as busy (default)");
  cmd.option("--free", "Mark as free (transparent)");
  cmd.option("--dry-run", "Preview without executing");

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
