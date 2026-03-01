import { google } from "googleapis";
import type { Command } from "commander";
import { createAuthCommand, handleAuth, handleAuthStatus, handleAuthLogout } from "./auth.ts";
import { createSearchCommand, handleSearch } from "./search.ts";
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
  getClientCredentialsOrPrompt,
  startOAuthFlow,
} from "../lib/auth.ts";
import { createReadlinePrompt } from "../lib/prompt.ts";
import { listCalendars, listEvents, createEvent, getEvent } from "../lib/api.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { resolveTimezone } from "../lib/timezone.ts";
import { resolveEventCalendar } from "../lib/resolve-calendar.ts";
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
          promptFn: createReadlinePrompt(),
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
    try {
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
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(calendarsCmd);

  const listCmd = createListCommand();
  listCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const listOpts = listCmd.opts();

    try {
      const auth = await getAuthenticatedClient(fsAdapter);
      const api = createGoogleCalendarApi(google.calendar({ version: "v3", auth }));

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
      };
      if (globalOpts.timezone) handleOpts.timezone = globalOpts.timezone;

      const result = await handleList(handleOpts, deps);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(listCmd);

  const searchCmd = createSearchCommand();
  searchCmd.action(async (query: string) => {
    const globalOpts = resolveGlobalOptions(program);
    const searchOpts = searchCmd.opts();

    try {
      const config = loadConfig(fsAdapter);
      const auth = await getAuthenticatedClient(fsAdapter);
      const calendarApi = google.calendar({ version: "v3", auth });
      const api = createGoogleCalendarApi(calendarApi);
      const timezone = resolveTimezone(globalOpts.timezone, config.timezone);
      const calendars = selectCalendars(
        searchOpts.calendar.length > 0 ? searchOpts.calendar : undefined,
        config,
      );

      const result = await handleSearch({
        api,
        query,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        calendars,
        timezone,
        days: searchOpts.days,
        from: searchOpts.from,
        to: searchOpts.to,
        busy: searchOpts.busy,
        free: searchOpts.free,
        confirmed: searchOpts.confirmed,
        includeTentative: searchOpts.includeTentative,
        write: (msg) => process.stdout.write(msg + "\n"),
        writeErr: (msg) => process.stderr.write(msg + "\n"),
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(searchCmd);

  const showCmd = createShowCommand();
  showCmd.action(async (eventId: string) => {
    const globalOpts = resolveGlobalOptions(program);
    const showOpts = showCmd.opts();
    try {
      const config = loadConfig(fsAdapter);
      const auth = await getAuthenticatedClient(fsAdapter);
      const calendarApi = google.calendar({ version: "v3", auth });
      const api = createGoogleCalendarApi(calendarApi);

      const calendarId = showOpts.calendar;
      let cal: { id: string; name: string };
      if (calendarId) {
        const found = config.calendars.find((c) => c.id === calendarId);
        cal = found ? { id: found.id, name: found.name } : { id: calendarId, name: calendarId };
      } else {
        const calendars = selectCalendars(undefined, config);
        const resolved = await resolveEventCalendar(api, eventId, calendars);
        cal = resolved;
      }

      const timezone = resolveTimezone(globalOpts.timezone, config.timezone);

      const result = await handleShow({
        api,
        eventId,
        calendarId: cal.id,
        calendarName: cal.name,
        format: globalOpts.format,
        timezone,
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

      let resolvedCalendarId: string;
      if (deleteOpts.calendar) {
        const calendars = selectCalendars([deleteOpts.calendar], config);
        resolvedCalendarId = calendars[0]?.id ?? "primary";
      } else {
        const calendars = selectCalendars(undefined, config);
        const resolved = await resolveEventCalendar(api, eventId, calendars);
        resolvedCalendarId = resolved.id;
      }

      const result = await handleDelete({
        api,
        eventId,
        calendarId: resolvedCalendarId,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        dryRun: deleteOpts.dryRun ?? false,
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
        duration: addOpts.duration,
        description: addOpts.description,
        busy: addOpts.busy,
        free: addOpts.free,
        dryRun: addOpts.dryRun,
        format: globalOpts.format,
      };
      if (addOpts.calendar) handleOpts.calendar = addOpts.calendar;
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
    const initOpts = initCmd.opts<{
      force?: boolean;
      all?: boolean;
      local?: boolean;
      timezone?: string;
    }>();
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
          const promptFn = createReadlinePrompt();
          const credentials =
            globalOpts.format === "text"
              ? await getClientCredentialsOrPrompt(fsAdapter, write, promptFn)
              : getClientCredentials(fsAdapter);
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
      const updateOpsCalendar = updateOpts.calendar as string | undefined;
      let cal: { id: string; name: string };
      if (updateOpsCalendar) {
        const calendars = selectCalendars([updateOpsCalendar], config);
        cal = calendars[0]!;
      } else {
        const calendars = selectCalendars(undefined, config);
        const resolved = await resolveEventCalendar(api, eventId, calendars);
        cal = resolved;
      }

      const result = await handleUpdate({
        api,
        eventId,
        calendarId: cal.id,
        calendarName: cal.name,
        format: globalOpts.format,
        timezone,
        write: (msg) => process.stdout.write(msg + "\n"),
        writeStderr: (msg) => process.stderr.write(msg + "\n"),
        getEvent: (calId, calName, evtId, tz) => getEvent(api, calId, calName, evtId, tz),
        ...updateOpts,
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(updateCmd);
}
