import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { getEvent } from "../lib/api.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import type { CommandResult, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export interface ShowHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  quiet?: boolean;
  timezone?: string;
  write: (msg: string) => void;
}

export async function handleShow(opts: ShowHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, calendarName, format, quiet, timezone, write } = opts;

  const event = await getEvent(api, calendarId, calendarName, eventId, timezone);

  if (format === "json") {
    write(formatJsonSuccess({ event }));
  } else if (quiet) {
    write(`${event.title}\t${event.start}\t${event.end}`);
  } else {
    write(formatEventDetailText(event));
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createShowCommand(): Command {
  return new Command("show")
    .description("Show event details")
    .argument("<event-id>", "Event ID")
    .option("-c, --calendar <id>", "Calendar ID to query");
}
