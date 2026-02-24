import { google } from "googleapis";
import type { Command } from "commander";
import { createAuthCommand, handleAuth, handleAuthStatus, handleAuthLogout } from "./auth.ts";
import { createSearchCommand } from "./search.ts";
import { createShowCommand, handleShow } from "./show.ts";
import { createListCommand, handleList, type ListHandlerDeps } from "./list.ts";
import { createUpdateCommand, handleUpdate } from "./update.ts";
import { createAddCommand, handleAdd, type AddHandlerDeps } from "./add.ts";
import { createDeleteCommand, handleDelete } from "./delete.ts";
import { createCalendarsCommand, handleCalendars } from "./calendars.ts";
import { createInitCommand, handleInit } from "./init.ts";
import { fsAdapter, createGoogleCalendarApi } from "./shared.ts";
import { resolveGlobalOptions, handleError } from "../cli.ts";
import { loadConfig, selectCalendars } from "../lib/config.ts";
import {
  getAuthenticatedClient,
  getClientCredentials,
  startOAuthFlow,
} from "../lib/auth.ts";
import { listCalendars, listEvents, createEvent } from "../lib/api.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { resolveTimezone } from "../lib/timezone.ts";
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

  const showCmd = createShowCommand();
  showCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const showOpts = showCmd.opts();
    try {
      const config = loadConfig(fsAdapter);
      const auth = await getAuthenticatedClient(fsAdapter);
      const calendarApi = google.calendar({ version: "v3", auth });
      const api = createGoogleCalendarApi(calendarApi);

      const calendarId = showOpts.calendar ?? (globalOpts.calendar.length > 0 ? globalOpts.calendar[0] : undefined);
      let cal: { id: string; name: string };
      if (calendarId) {
        const found = config.calendars.find((c) => c.id === calendarId);
        cal = found ? { id: found.id, name: found.name } : { id: calendarId, name: calendarId };
      } else {
        const enabled = config.calendars.filter((c) => c.enabled);
        cal = enabled[0] ?? { id: "primary", name: "Primary" };
      }

      const result = await handleShow({
        api,
        eventId: showCmd.args[0]!,
        calendarId: cal.id,
        calendarName: cal.name,
        format: globalOpts.format,
        write: (msg) => process.stdout.write(msg + "\n"),
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(showCmd);

  const deleteCmd = createDeleteCommand();
  deleteCmd.action(async (eventId: string) => {
    const globalOpts = resolveGlobalOptions(program);
    const deleteOpts = deleteCmd.opts();
    try {
      const config = loadConfig(fsAdapter);
      const auth = await getAuthenticatedClient(fsAdapter);
      const calendarApi = google.calendar({ version: "v3", auth });
      const api = createGoogleCalendarApi(calendarApi);

      const calendars = selectCalendars(
        deleteOpts.calendar ? [deleteOpts.calendar] : globalOpts.calendar,
        config,
      );
      const resolvedCalendarId = calendars[0]?.id ?? "primary";

      const result = await handleDelete({
        api,
        eventId,
        calendarId: resolvedCalendarId,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        write: (msg) => process.stdout.write(msg + "\n"),
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(deleteCmd);

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

  const initCmd = createInitCommand();
  initCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const initOpts = initCmd.opts<{ force?: boolean; all?: boolean; local?: boolean; timezone?: string }>();
    const write = (msg: string) => process.stdout.write(msg + "\n");

    try {
      let apiRef: GoogleCalendarApi | null = null;

      const getApi = async (): Promise<GoogleCalendarApi> => {
        if (!apiRef) {
          const oauth2Client = await getAuthenticatedClient(fsAdapter);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });
          apiRef = createGoogleCalendarApi(calendar);
        }
        return apiRef;
      };

      const result = await handleInit({
        listCalendars: async () => {
          const api = await getApi();
          return listCalendars(api);
        },
        requestAuth: async () => {
          apiRef = null;
          const credentials = getClientCredentials(fsAdapter);
          const { authUrl, waitForCode, server } = await startOAuthFlow(
            credentials,
            fsAdapter,
            globalThis.fetch,
          );
          write(`Not authenticated. Starting OAuth flow...`);
          write(`Open this URL in your browser:\n${authUrl}`);
          try {
            await waitForCode;
            write("Authentication successful.");
          } finally {
            server.close();
          }
        },
        fs: fsAdapter,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        write,
        force: initOpts.force ?? false,
        all: initOpts.all ?? false,
        local: initOpts.local ?? false,
        timezone: initOpts.timezone ?? globalOpts.timezone,
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(initCmd);

  const updateCmd = createUpdateCommand();
  updateCmd.action(async (eventId: string) => {
    const globalOpts = resolveGlobalOptions(program);
    const updateOpts = updateCmd.opts();

    try {
      const config = loadConfig(fsAdapter);
      const oauth2Client = await getAuthenticatedClient(fsAdapter);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const api = createGoogleCalendarApi(calendar);
      const timezone = resolveTimezone(globalOpts.timezone, config.timezone);
      const calendars = selectCalendars(globalOpts.calendar, config);
      const cal = calendars[0]!;

      const result = await handleUpdate({
        api,
        eventId,
        calendarId: cal.id,
        calendarName: cal.name,
        format: globalOpts.format,
        timezone,
        write: (msg) => process.stdout.write(msg + "\n"),
        ...updateOpts,
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(updateCmd);
}
