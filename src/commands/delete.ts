import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { ApiError, deleteEvent } from "../lib/api.ts";
import { formatJsonSuccess, formatJsonError, errorCodeToExitCode } from "../lib/output.ts";
import type { CommandResult, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export interface DeleteHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  format: OutputFormat;
  quiet: boolean;
  dryRun?: boolean;
  write: (msg: string) => void;
}

export async function handleDelete(opts: DeleteHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, format, quiet, dryRun = false, write } = opts;

  if (!eventId) {
    write(formatJsonError("INVALID_ARGS", "event-id is required"));
    return { exitCode: ExitCode.ARGUMENT };
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

  try {
    await deleteEvent(api, calendarId, eventId);

    if (!quiet) {
      if (format === "json") {
        write(formatJsonSuccess({ deleted_id: eventId, message: "Event deleted" }));
      } else {
        write("Event deleted");
      }
    }

    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    if (error instanceof ApiError) {
      if (format === "json") {
        write(formatJsonError(error.code, error.message));
      } else {
        write(`Error: ${error.message}`);
      }
      return { exitCode: errorCodeToExitCode(error.code) };
    }
    throw error;
  }
}

export function createDeleteCommand(): Command {
  return new Command("delete")
    .description("Delete a calendar event")
    .argument("<event-id>", "Event ID")
    .option("-c, --calendar <id>", "Calendar ID to query")
    .option("--dry-run", "Preview without executing");
}
