import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { listCalendars, ApiError } from "../lib/api.ts";
import { formatCalendarListText, formatJsonSuccess, formatJsonError } from "../lib/output.ts";
import { errorCodeToExitCode } from "../lib/output.ts";
import { ExitCode } from "../types/index.ts";
import type { Calendar, CalendarConfig, CommandResult, OutputFormat } from "../types/index.ts";

interface HandleCalendarsOptions {
  api: GoogleCalendarApi;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configCalendars: CalendarConfig[];
}

function mergeCalendarsWithConfig(
  apiCalendars: Calendar[],
  configCalendars: CalendarConfig[],
): Calendar[] {
  const configMap = new Map(configCalendars.map((c) => [c.id, c]));

  return apiCalendars.map((cal) => {
    const config = configMap.get(cal.id);
    return {
      ...cal,
      enabled: config ? config.enabled : cal.enabled,
    };
  });
}

export async function handleCalendars(opts: HandleCalendarsOptions): Promise<CommandResult> {
  const { api, format, quiet, write, configCalendars } = opts;

  let apiCalendars: Calendar[];
  try {
    apiCalendars = await listCalendars(api);
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      if (format === "json") {
        write(formatJsonError(error.code, error.message));
      } else {
        write(error.message);
      }
      return { exitCode: errorCodeToExitCode(error.code) };
    }
    throw error;
  }

  const calendars = mergeCalendarsWithConfig(apiCalendars, configCalendars);

  if (quiet) {
    write(calendars.map((c) => c.id).join("\n"));
    return { exitCode: ExitCode.SUCCESS };
  }

  if (format === "json") {
    write(formatJsonSuccess({ calendars }));
  } else {
    write(formatCalendarListText(calendars));
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createCalendarsCommand(): Command {
  return new Command("calendars").description("List available calendars");
}
