import { Command } from "commander";
import type { GoogleCalendarApi, UpdateEventInput } from "../lib/api.ts";
import { updateEvent, ApiError } from "../lib/api.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import { formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import type { OutputFormat, CommandResult } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export interface UpdateHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  timezone: string;
  write: (msg: string) => void;
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  busy?: boolean;
  free?: boolean;
  dryRun?: boolean;
}

export async function handleUpdate(opts: UpdateHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, calendarName, format, timezone, write } = opts;

  const hasUpdate =
    opts.title !== undefined ||
    opts.start !== undefined ||
    opts.end !== undefined ||
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

  if (opts.start !== undefined || opts.end !== undefined) {
    if (opts.start === undefined || opts.end === undefined) {
      throw new ApiError("INVALID_ARGS", "start, end, and allDay must all be provided together");
    }
    const startStr = opts.start;
    const endStr = opts.end;
    const parsedStart = parseDateTimeInZone(startStr, timezone);
    const parsedEnd = parseDateTimeInZone(endStr, timezone);
    const withTime = input as UpdateEventInput & { start: string; end: string; allDay: boolean };
    withTime.start = formatDateTimeInZone(parsedStart, timezone);
    withTime.end = formatDateTimeInZone(parsedEnd, timezone);
    withTime.allDay = false;
    input.timeZone = timezone;
  }

  if (opts.dryRun) {
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.description !== undefined) changes.description = input.description;
    if (input.transparency !== undefined) changes.transparency = input.transparency;
    const withTime = input as UpdateEventInput & { start?: string; end?: string };
    if (withTime.start !== undefined) changes.start = withTime.start;
    if (withTime.end !== undefined) changes.end = withTime.end;

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
    write(formatJsonSuccess({ event: updated }));
  } else {
    write(formatEventDetailText(updated));
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createUpdateCommand(): Command {
  const cmd = new Command("update")
    .description("Update an existing event")
    .argument("<event-id>", "Event ID to update");

  cmd.option("-c, --calendar <id>", "Calendar ID");
  cmd.option("-t, --title <title>", "New title");
  cmd.option("-s, --start <datetime>", "New start datetime");
  cmd.option("-e, --end <datetime>", "New end datetime");
  cmd.option("-d, --description <text>", "New description");
  cmd.option("--busy", "Mark as busy");
  cmd.option("--free", "Mark as free");
  cmd.option("--dry-run", "Preview without executing");

  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  return cmd;
}
