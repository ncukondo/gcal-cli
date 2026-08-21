import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { ApiError, deleteEvent } from "../lib/api.ts";
import { formatJsonSuccess } from "../lib/output.ts";
import { NOTIFY_CHOICES, parseNotify } from "../lib/attendees.ts";
import type { CommandResult, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export interface DeleteHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  format: OutputFormat;
  quiet: boolean;
  dryRun?: boolean;
  notify?: string;
  write: (msg: string) => void;
}

export async function handleDelete(opts: DeleteHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, format, quiet, dryRun = false, write } = opts;

  if (!eventId) {
    throw new ApiError("INVALID_ARGS", "event-id is required");
  }

  let sendUpdates;
  try {
    sendUpdates = parseNotify(opts.notify);
  } catch (err) {
    throw new ApiError("INVALID_ARGS", (err as Error).message);
  }

  if (dryRun) {
    if (format === "json") {
      write(
        formatJsonSuccess({
          dry_run: true,
          action: "delete",
          event_id: eventId,
          calendar_id: calendarId,
        }),
      );
    } else {
      write(`DRY RUN: Would delete event "${eventId}" from calendar "${calendarId}"`);
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  await deleteEvent(api, calendarId, eventId, sendUpdates);

  if (!quiet) {
    if (format === "json") {
      write(formatJsonSuccess({ deleted_id: eventId, message: "Event deleted" }));
    } else {
      write("Event deleted");
    }
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createDeleteCommand(): Command {
  return new Command("delete")
    .description("Delete a calendar event")
    .argument("<event-id>", "Event ID")
    .option("-c, --calendar <id>", "Calendar ID to query")
    .option(
      "--notify <scope>",
      `Send cancellation emails to ${NOTIFY_CHOICES.join(" | ")} (default: none)`,
    )
    .option("--dry-run", "Preview without executing");
}
