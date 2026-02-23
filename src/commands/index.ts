import { google } from "googleapis";
import type { Command } from "commander";
import { createCalendarsCommand, handleCalendars } from "./calendars.ts";
import { fsAdapter, createGoogleCalendarApi } from "./shared.ts";
import { resolveGlobalOptions } from "../cli.ts";
import { loadConfig } from "../lib/config.ts";
import { getAuthenticatedClient } from "../lib/auth.ts";

export function registerCommands(program: Command): void {
  const calendarsCmd = createCalendarsCommand();
  calendarsCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const config = loadConfig(fsAdapter);
    const oauth2Client = await getAuthenticatedClient(fsAdapter);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const api = createGoogleCalendarApi(calendar);
    const result = await handleCalendars({
      api,
      format: globalOpts.format,
      quiet: globalOpts.quiet,
      write: (msg) => process.stdout.write(msg + "\n"),
      configCalendars: config.calendars,
    });
    process.exit(result.exitCode);
  });
  program.addCommand(calendarsCmd);
}
