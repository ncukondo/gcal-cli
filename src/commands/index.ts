import { google } from "googleapis";
import type { Command } from "commander";
import { createListCommand, handleList, type ListHandlerDeps } from "./list.ts";
import { createCalendarsCommand, handleCalendars } from "./calendars.ts";
import { fsAdapter, createGoogleCalendarApi } from "./shared.ts";
import { resolveGlobalOptions, handleError } from "../cli.ts";
import { loadConfig } from "../lib/config.ts";
import { getAuthenticatedClient } from "../lib/auth.ts";
import { listEvents } from "../lib/api.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { ListOptions } from "./list.ts";

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

  const listCmd = createListCommand();
  listCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const listOpts = listCmd.opts();

    try {
      const auth = await getAuthenticatedClient(fsAdapter);
      const api = google.calendar({ version: "v3", auth }) as unknown as GoogleCalendarApi;

      const deps: ListHandlerDeps = {
        listEvents: (calendarId, calendarName, options) =>
          listEvents(api, calendarId, calendarName, options),
        loadConfig: () => loadConfig(fsAdapter),
        write: (msg) => process.stdout.write(msg + "\n"),
        writeErr: (msg) => process.stderr.write(msg + "\n"),
      };

      const handleOpts: ListOptions = {
        ...listOpts,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        calendar: globalOpts.calendar,
      };
      if (globalOpts.timezone) handleOpts.timezone = globalOpts.timezone;

      const result = await handleList(handleOpts, deps);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(listCmd);
}
