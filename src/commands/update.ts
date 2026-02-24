import { Command } from "commander";
import type { GoogleCalendarApi, UpdateEventInput } from "../lib/api.ts";
import { updateEvent, ApiError } from "../lib/api.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import { formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import type { OutputFormat } from "../types/index.ts";
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
}

interface CommandResult {
  exitCode: number;
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
    (input as UpdateEventInput & { start: string; end: string; allDay: boolean }).start =
      formatDateTimeInZone(parsedStart, timezone);
    (input as UpdateEventInput & { start: string; end: string; allDay: boolean }).end =
      formatDateTimeInZone(parsedEnd, timezone);
    (input as UpdateEventInput & { start: string; end: string; allDay: boolean }).allDay = false;
    input.timeZone = timezone;
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

  cmd.option("-t, --title <title>", "New title");
  cmd.option("-s, --start <datetime>", "New start datetime");
  cmd.option("-e, --end <datetime>", "New end datetime");
  cmd.option("-d, --description <text>", "New description");
  cmd.option("--busy", "Mark as busy");
  cmd.option("--free", "Mark as free");

  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  return cmd;
}
