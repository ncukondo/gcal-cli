import { Command } from "commander";
import type { GoogleCalendarApi, UpdateEventInput } from "../lib/api.ts";
import { updateEvent, ApiError } from "../lib/api.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import { formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { isDateOnly, addDaysToDateString } from "../lib/date-utils.ts";
import { parseDuration } from "../lib/duration.ts";
import type { OutputFormat, CommandResult, CalendarEvent } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UpdateHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  quiet?: boolean;
  timezone: string;
  write: (msg: string) => void;
  writeStderr: (msg: string) => void;
  getEvent: (
    calendarId: string,
    calendarName: string,
    eventId: string,
    timezone?: string,
  ) => Promise<CalendarEvent>;
  title?: string;
  start?: string;
  end?: string;
  duration?: string;
  description?: string;
  busy?: boolean;
  free?: boolean;
  dryRun?: boolean;
}

interface ResolvedTime {
  start: string;
  end: string;
  allDay: boolean;
  existingEvent?: CalendarEvent;
}

function resolveTimedEvent(startStr: string, endStr: string, timezone: string): ResolvedTime {
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const parsedEnd = parseDateTimeInZone(endStr, timezone);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(parsedEnd, timezone),
    allDay: false,
  };
}

function resolveAllDayEvent(startStr: string, endStr: string): ResolvedTime {
  // Inclusive end → exclusive end (+1 day)
  return {
    start: startStr,
    end: addDaysToDateString(endStr, 1),
    allDay: true,
  };
}

function resolveStartAndEnd(
  startStr: string,
  endStr: string,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    return resolveAllDayEvent(startStr, endStr);
  }
  return resolveTimedEvent(startStr, endStr, timezone);
}

function resolveStartAndDuration(
  startStr: string,
  durationMs: number,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const days = durationMs / MS_PER_DAY;
    return {
      start: startStr,
      end: addDaysToDateString(startStr, days),
      allDay: true,
    };
  }
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const endDate = new Date(parsedStart.getTime() + durationMs);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
  };
}

function resolveStartOnly(
  startStr: string,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const existingStartMs = new Date(existing.start).getTime();
    const existingEndMs = new Date(existing.end).getTime();
    const durationDays = Math.round((existingEndMs - existingStartMs) / MS_PER_DAY);
    return {
      start: startStr,
      end: addDaysToDateString(startStr, durationDays),
      allDay: true,
      existingEvent: existing,
    };
  }
  const existingStartMs = new Date(existing.start).getTime();
  const existingEndMs = new Date(existing.end).getTime();
  const durationMs = existingEndMs - existingStartMs;
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const endDate = new Date(parsedStart.getTime() + durationMs);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

function resolveEndOnly(
  endStr: string,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    return {
      start: existing.start,
      end: addDaysToDateString(endStr, 1),
      allDay: true,
      existingEvent: existing,
    };
  }
  const parsedEnd = parseDateTimeInZone(endStr, timezone);
  return {
    start: existing.start,
    end: formatDateTimeInZone(parsedEnd, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

function resolveDurationOnly(
  durationMs: number,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const days = durationMs / MS_PER_DAY;
    return {
      start: existing.start,
      end: addDaysToDateString(existing.start, days),
      allDay: true,
      existingEvent: existing,
    };
  }
  const existingStartMs = new Date(existing.start).getTime();
  const endDate = new Date(existingStartMs + durationMs);
  return {
    start: existing.start,
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

async function resolveTimeUpdate(opts: UpdateHandlerOptions): Promise<ResolvedTime | null> {
  const { timezone, calendarId, calendarName, eventId, getEvent } = opts;
  const hasStart = opts.start !== undefined;
  const hasEnd = opts.end !== undefined;
  const hasDuration = opts.duration !== undefined;

  if (!hasStart && !hasEnd && !hasDuration) return null;

  // Parse duration once when present
  const durationMs = hasDuration ? parseDuration(opts.duration!) : undefined;

  // Determine if we need to fetch the existing event
  const needExisting =
    (hasStart && !hasEnd && !hasDuration) || (hasEnd && !hasStart) || (hasDuration && !hasStart);
  let existing: CalendarEvent | undefined;
  if (needExisting) {
    existing = await getEvent(calendarId, calendarName, eventId, timezone);
  }

  // Determine allDay from start format, or from existing event
  const allDay = hasStart ? isDateOnly(opts.start!) : existing!.all_day;

  // Validate start/end type consistency
  if (hasStart && hasEnd) {
    const startIsDateOnly = isDateOnly(opts.start!);
    const endIsDateOnly = isDateOnly(opts.end!);
    if (startIsDateOnly !== endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--start and --end must be the same type (both date-only or both datetime)",
      );
    }
  }

  // Validate --end only format matches existing event type
  if (hasEnd && !hasStart && existing) {
    const endIsDateOnly = isDateOnly(opts.end!);
    if (existing.all_day && !endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--end format (datetime) does not match existing event type (all-day). Use date-only format (YYYY-MM-DD) or provide --start to change event type.",
      );
    }
    if (!existing.all_day && endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--end format (date-only) does not match existing event type (timed). Use datetime format (YYYY-MM-DDTHH:MM) or provide --start to change event type.",
      );
    }
  }

  // Validate all-day duration
  if (durationMs !== undefined && allDay) {
    if (durationMs % MS_PER_DAY !== 0) {
      throw new ApiError(
        "INVALID_ARGS",
        "All-day events require day-unit duration (e.g. 1d, 2d). Sub-day durations like hours or minutes are not allowed.",
      );
    }
  }

  if (hasStart && hasEnd) {
    return resolveStartAndEnd(opts.start!, opts.end!, allDay, timezone);
  }

  if (hasStart && durationMs !== undefined) {
    return resolveStartAndDuration(opts.start!, durationMs, allDay, timezone);
  }

  if (hasStart) {
    return resolveStartOnly(opts.start!, existing!, allDay, timezone);
  }

  if (hasEnd) {
    return resolveEndOnly(opts.end!, existing!, allDay, timezone);
  }

  if (durationMs !== undefined) {
    return resolveDurationOnly(durationMs, existing!, allDay, timezone);
  }

  return null;
}

export async function handleUpdate(opts: UpdateHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, calendarName, format, timezone, write } = opts;

  const hasUpdate =
    opts.title !== undefined ||
    opts.start !== undefined ||
    opts.end !== undefined ||
    opts.duration !== undefined ||
    opts.description !== undefined ||
    opts.busy !== undefined ||
    opts.free !== undefined;

  if (!hasUpdate) {
    throw new ApiError("INVALID_ARGS", "at least one update option must be provided");
  }

  const input: UpdateEventInput = {};

  if (opts.title !== undefined) {
    input.title = opts.title;
  }

  if (opts.description !== undefined) {
    input.description = opts.description;
  }

  if (opts.busy) {
    input.transparency = "opaque";
  } else if (opts.free) {
    input.transparency = "transparent";
  }

  const timeResult = await resolveTimeUpdate(opts);
  if (timeResult) {
    const withTime = input as UpdateEventInput & { start: string; end: string; allDay: boolean };
    withTime.start = timeResult.start;
    withTime.end = timeResult.end;
    withTime.allDay = timeResult.allDay;
    input.timeZone = timezone;

    // Type conversion warning (only fetch existing if not already available)
    if (timeResult.existingEvent) {
      const existing = timeResult.existingEvent;
      if (existing.all_day && !timeResult.allDay) {
        opts.writeStderr("\u26A0 Event type changed from all-day to timed");
      } else if (!existing.all_day && timeResult.allDay) {
        opts.writeStderr("\u26A0 Event type changed from timed to all-day");
      }
    }
  }

  if (opts.dryRun) {
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description;
    if (input.transparency !== undefined) changes.transparency = input.transparency;
    const withTime = input as UpdateEventInput & { start?: string; end?: string; allDay?: boolean };
    if (withTime.start !== undefined) changes.start = withTime.start;
    if (withTime.end !== undefined) changes.end = withTime.end;
    if (withTime.allDay !== undefined) changes.allDay = withTime.allDay;

    if (format === "json") {
      write(
        formatJsonSuccess({
          dry_run: true,
          action: "update",
          event_id: eventId,
          changes,
        }),
      );
    } else {
      const lines = [`DRY RUN: Would update event "${eventId}":`];
      if (changes.title !== undefined) lines.push(`  title: "${changes.title}"`);
      if (changes.start !== undefined) lines.push(`  start: "${changes.start}"`);
      if (changes.end !== undefined) lines.push(`  end: "${changes.end}"`);
      if (changes.description !== undefined) lines.push(`  description: "${changes.description}"`);
      if (changes.transparency !== undefined) lines.push(`  transparency: ${changes.transparency}`);
      write(lines.join("\n"));
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  const updated = await updateEvent(api, calendarId, calendarName, eventId, input);

  if (format === "json") {
    write(formatJsonSuccess({ event: updated, message: "Event updated" }));
  } else if (opts.quiet) {
    write(updated.id);
  } else {
    const detail = formatEventDetailText(updated);
    write(`Event updated\n\n${detail}`);
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createUpdateCommand(): Command {
  const cmd = new Command("update")
    .description("Update an existing event")
    .argument("<event-id>", "Event ID to update");

  cmd.option("-c, --calendar <id>", "Calendar ID");
  cmd.option("-t, --title <title>", "New title");
  cmd.option(
    "-s, --start <datetime>",
    "Start date or datetime. Date-only (YYYY-MM-DD) → all-day. Datetime (YYYY-MM-DDTHH:MM) → timed. Can be specified alone (preserves existing duration).",
  );
  cmd.option(
    "-e, --end <datetime>",
    "End date or datetime. Can be specified alone (preserves existing start). All-day end is inclusive.",
  );
  cmd.option(
    "--duration <duration>",
    "Duration instead of --end (e.g. 30m, 1h, 2d, 1h30m). Mutually exclusive with --end. Can be specified alone (preserves existing start).",
  );
  cmd.option("-d, --description <text>", "New description");
  cmd.option("--busy", "Mark as busy");
  cmd.option("--free", "Mark as free");
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
  gcal update abc123 -t "Updated Meeting"                                    # Title only
  gcal update abc123 -s "2026-01-24T11:00"                                   # Start only, keep duration
  gcal update abc123 -e "2026-01-24T12:00"                                   # End only, keep start
  gcal update abc123 --duration 2h                                           # Duration only, keep start
  gcal update abc123 -s "2026-01-24T11:00" -e "2026-01-24T12:30"            # Start + end
  gcal update abc123 -s "2026-01-24T10:00" --duration 30m                   # Start + duration
  gcal update abc123 -s "2026-03-01" -e "2026-03-03"                        # All-day, 3 days (inclusive)
  gcal update abc123 -s "2026-03-01" --duration 2d                          # All-day, 2 days
  gcal update abc123 --free                                                  # Transparency only
  gcal update abc123 --dry-run -t "Preview"                                  # Dry run
`,
  );

  return cmd;
}
