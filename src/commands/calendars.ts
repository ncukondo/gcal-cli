import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { listCalendars } from "../lib/api.ts";
import { formatCalendarListText, formatJsonSuccess } from "../lib/output.ts";
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

  const apiCalendars = await listCalendars(api);
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
