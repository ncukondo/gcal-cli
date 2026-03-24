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
import { createTasksCommand } from "./tasks/index.ts";
import { handleTaskLists } from "./tasks/lists.ts";
import { handleTaskList, type HandleTaskListOptions } from "./tasks/list.ts";
import { handleTaskShow, type HandleTaskShowOptions } from "./tasks/show.ts";
import { handleTaskAdd, type HandleTaskAddOptions } from "./tasks/add.ts";
import { handleTaskUpdate, type HandleTaskUpdateOptions } from "./tasks/update.ts";
import { handleTaskDone, type HandleTaskDoneOptions } from "./tasks/done.ts";
import { handleTaskUndone, type HandleTaskUndoneOptions } from "./tasks/undone.ts";
import { fsAdapter, createGoogleCalendarApi, createGoogleTasksClient } from "./shared.ts";
import type { GoogleTasksClient } from "../lib/tasks-api.ts";
import { resolveGlobalOptions, handleError } from "../cli.ts";
import { loadConfig, selectCalendars } from "../lib/config.ts";
import type { OutputFormat, TaskListConfig } from "../types/index.ts";
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

interface TaskActionDeps {
  client: GoogleTasksClient;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
}

async function runTaskAction(
  program: Command,
  handler: (deps: TaskActionDeps) => Promise<{ exitCode: number }>,
): Promise<void> {
  const globalOpts = resolveGlobalOptions(program);
  try {
    const config = loadConfig(fsAdapter);
    const oauth2Client = await getAuthenticatedClient(fsAdapter);
    const client = createGoogleTasksClient(google.tasks({ version: "v1", auth: oauth2Client }));
    const result = await handler({
      client,
      format: globalOpts.format,
      quiet: globalOpts.quiet,
      write: (msg) => process.stdout.write(msg + "\n"),
      configTaskLists: config.task_lists,
    });
    process.exit(result.exitCode);
  } catch (error) {
    handleError(error, globalOpts.format);
  }
}

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

  const {
    tasksCmd,
    listsCmd: tasksListsCmd,
    listCmd: tasksListCmd,
    showCmd: tasksShowCmd,
    addCmd: tasksAddCmd,
    updateCmd: tasksUpdateCmd,
    doneCmd: tasksDoneCmd,
    undoneCmd: tasksUndoneCmd,
  } = createTasksCommand();
  tasksListsCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    try {
      const config = loadConfig(fsAdapter);
      const oauth2Client = await getAuthenticatedClient(fsAdapter);
      const tasksClient = createGoogleTasksClient(
        google.tasks({ version: "v1", auth: oauth2Client }),
      );
      const result = await handleTaskLists({
        client: tasksClient,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        write: (msg) => process.stdout.write(msg + "\n"),
        configTaskLists: config.task_lists,
      });
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  tasksListCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const listOpts = tasksListCmd.opts<{
      list?: string;
      all?: boolean;
      completed?: boolean;
      dueBefore?: string;
      dueAfter?: string;
    }>();
    try {
      const config = loadConfig(fsAdapter);
      const oauth2Client = await getAuthenticatedClient(fsAdapter);
      const tasksClient = createGoogleTasksClient(
        google.tasks({ version: "v1", auth: oauth2Client }),
      );
      const opts: HandleTaskListOptions = {
        client: tasksClient,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        write: (msg) => process.stdout.write(msg + "\n"),
        configTaskLists: config.task_lists,
      };
      if (listOpts.list !== undefined) opts.list = listOpts.list;
      if (listOpts.all) opts.all = true;
      if (listOpts.completed) opts.completed = true;
      if (listOpts.dueBefore !== undefined) opts.dueBefore = listOpts.dueBefore;
      if (listOpts.dueAfter !== undefined) opts.dueAfter = listOpts.dueAfter;
      const result = await handleTaskList(opts);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  tasksShowCmd.action(async (taskId: string) => {
    const globalOpts = resolveGlobalOptions(program);
    const showOpts = tasksShowCmd.opts<{ list?: string }>();
    try {
      const config = loadConfig(fsAdapter);
      const oauth2Client = await getAuthenticatedClient(fsAdapter);
      const tasksClient = createGoogleTasksClient(
        google.tasks({ version: "v1", auth: oauth2Client }),
      );
      const opts: HandleTaskShowOptions = {
        client: tasksClient,
        taskId,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        write: (msg) => process.stdout.write(msg + "\n"),
        configTaskLists: config.task_lists,
      };
      if (showOpts.list !== undefined) opts.list = showOpts.list;
      const result = await handleTaskShow(opts);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  tasksAddCmd.action(async () => {
    const addOpts = tasksAddCmd.opts<{
      title: string;
      notes?: string;
      due?: string;
      list?: string;
      parent?: string;
    }>();
    await runTaskAction(program, (deps) => {
      const opts: HandleTaskAddOptions = { ...deps, title: addOpts.title };
      if (addOpts.notes !== undefined) opts.notes = addOpts.notes;
      if (addOpts.due !== undefined) opts.due = addOpts.due;
      if (addOpts.list !== undefined) opts.list = addOpts.list;
      if (addOpts.parent !== undefined) opts.parent = addOpts.parent;
      return handleTaskAdd(opts);
    });
  });
  tasksUpdateCmd.action(async (taskId: string) => {
    const updateOpts = tasksUpdateCmd.opts<{
      title?: string;
      notes?: string;
      due?: string;
      list?: string;
    }>();
    await runTaskAction(program, (deps) => {
      const opts: HandleTaskUpdateOptions = { ...deps, taskId };
      if (updateOpts.title !== undefined) opts.title = updateOpts.title;
      if (updateOpts.notes !== undefined) opts.notes = updateOpts.notes;
      if (updateOpts.due !== undefined) opts.due = updateOpts.due;
      if (updateOpts.list !== undefined) opts.list = updateOpts.list;
      return handleTaskUpdate(opts);
    });
  });
  tasksDoneCmd.action(async (taskId: string) => {
    const doneOpts = tasksDoneCmd.opts<{ list?: string }>();
    await runTaskAction(program, (deps) => {
      const opts: HandleTaskDoneOptions = { ...deps, taskId };
      if (doneOpts.list !== undefined) opts.list = doneOpts.list;
      return handleTaskDone(opts);
    });
  });
  tasksUndoneCmd.action(async (taskId: string) => {
    const undoneOpts = tasksUndoneCmd.opts<{ list?: string }>();
    await runTaskAction(program, (deps) => {
      const opts: HandleTaskUndoneOptions = { ...deps, taskId };
      if (undoneOpts.list !== undefined) opts.list = undoneOpts.list;
      return handleTaskUndone(opts);
    });
  });
  program.addCommand(tasksCmd);

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
        quiet: globalOpts.quiet,
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
        quiet: globalOpts.quiet,
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
        quiet: globalOpts.quiet,
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
