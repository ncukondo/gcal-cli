import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { ApiError, getEvent } from "../lib/api.ts";
import {
  formatEventDetailText,
  formatJsonSuccess,
  formatJsonError,
  errorCodeToExitCode,
} from "../lib/output.ts";
import type { CommandResult, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export interface ShowHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  write: (msg: string) => void;
}

export async function handleShow(opts: ShowHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, calendarName, format, write } = opts;

  try {
    const event = await getEvent(api, calendarId, calendarName, eventId);

    if (format === "json") {
      write(formatJsonSuccess({ event }));
    } else {
      write(formatEventDetailText(event));
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

export function createShowCommand(): Command {
  return new Command("show")
    .description("Show event details")
    .argument("<event-id>", "Event ID")
    .option("-c, --calendar <id>", "Calendar ID to query");
}
