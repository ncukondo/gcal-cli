import { google } from "googleapis";
import type { Command } from "commander";
import { createAuthCommand, handleAuth, handleAuthStatus, handleAuthLogout } from "./auth.ts";
import { createSearchCommand } from "./search.ts";
import { createListCommand, handleList, type ListHandlerDeps } from "./list.ts";
import { createAddCommand, handleAdd, type AddHandlerDeps } from "./add.ts";
import { createCalendarsCommand, handleCalendars } from "./calendars.ts";
import { fsAdapter, createGoogleCalendarApi } from "./shared.ts";
import { resolveGlobalOptions, handleError } from "../cli.ts";
import { loadConfig } from "../lib/config.ts";
import { getAuthenticatedClient } from "../lib/auth.ts";
import { listEvents, createEvent } from "../lib/api.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { ListOptions } from "./list.ts";
import type { AddOptions } from "./add.ts";

export function registerCommands(program: Command): void {
  const authCmd = createAuthCommand();
  authCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const authOpts = authCmd.opts();
    const write = (msg: string) => process.stdout.write(msg + "\n");
    const handlerOpts = {
      fs: fsAdapter,
      format: globalOpts.format,
      write,
      fetchFn: globalThis.fetch,
    };

    try {
      let result;
      if (authOpts.logout) {
        result = await handleAuthLogout(handlerOpts);
      } else if (authOpts.status) {
        result = await handleAuthStatus(handlerOpts);
      } else {
        result = await handleAuth({
          ...handlerOpts,
          openUrl: (url: string) => {
            write(`Open this URL in your browser:\n${url}`);
          },
        });
      }
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(authCmd);
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

  program.addCommand(createSearchCommand());

  const addCmd = createAddCommand();
  addCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const addOpts = addCmd.opts();

    try {
      const auth = await getAuthenticatedClient(fsAdapter);
      const api = createGoogleCalendarApi(google.calendar({ version: "v3", auth }));

      const deps: AddHandlerDeps = {
        createEvent: (calendarId, calendarName, input) =>
          createEvent(api, calendarId, calendarName, input),
        loadConfig: () => loadConfig(fsAdapter),
        write: (msg) => process.stdout.write(msg + "\n"),
      };

      const handleOpts: AddOptions = {
        title: addOpts.title,
        start: addOpts.start,
        end: addOpts.end,
        allDay: addOpts.allDay,
        description: addOpts.description,
        busy: addOpts.busy,
        free: addOpts.free,
        format: globalOpts.format,
      };
      if (globalOpts.calendar?.[0]) handleOpts.calendar = globalOpts.calendar[0];
      if (globalOpts.timezone) handleOpts.timezone = globalOpts.timezone;

      const result = await handleAdd(handleOpts, deps);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(addCmd);
}
