import * as nodeFs from "node:fs";
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type { AuthFsAdapter } from "../lib/auth.ts";
import type {
  GoogleCalendarApi,
  GoogleCalendar,
  GoogleEvent,
  GoogleEventWriteBody,
} from "../lib/api.ts";
import { MEET_SOLUTION_TYPE } from "../lib/api.ts";
import type { CalendarEvent } from "../types/index.ts";
import type { GoogleTasksClient, GoogleRawTaskList, GoogleRawTask } from "../lib/tasks-api.ts";

export const fsAdapter: AuthFsAdapter = {
  existsSync: (p: string) => nodeFs.existsSync(p),
  readFileSync: (p: string) => nodeFs.readFileSync(p, "utf-8"),
  writeFileSync: (p: string, d: string) => nodeFs.writeFileSync(p, d, "utf-8"),
  mkdirSync: (p: string) => nodeFs.mkdirSync(p, { recursive: true }),
  unlinkSync: (p: string) => nodeFs.unlinkSync(p),
  chmodSync: (p: string, m: number) => nodeFs.chmodSync(p, m),
};

type CalendarClient = ReturnType<typeof google.calendar>;
type TasksClient = ReturnType<typeof google.tasks>;

type CalendarListData = {
  items?: GoogleCalendar[];
  nextPageToken?: string;
};

type EventListData = {
  items?: GoogleEvent[];
  nextPageToken?: string;
};

/**
 * What to tell the user on stderr after a `--meet` write, or null when the
 * request produced a Google Meet link and there is nothing to say. Both `add`
 * and `update` go through here so the two cannot drift apart.
 */
export function meetFollowUpNote(event: CalendarEvent): string | null {
  const conference = event.conference;
  if (conference && conference.type !== null && conference.type !== MEET_SOLUTION_TYPE) {
    const url = conference.uri ? ` Conference URL: ${conference.uri}` : "";
    return `Note: this calendar attached a ${conference.type} conference, not Google Meet.${url}`;
  }
  if (event.meet_link === null) {
    return `Note: Google Meet link is still being generated. Run \`gcal show ${event.id}\` in a few seconds to get it.`;
  }
  return null;
}

/** Commander option callback to collect repeatable values into an array. */
export function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function createGoogleTasksClient(tasks: TasksClient): GoogleTasksClient {
  return {
    tasklists: {
      list: async (p) => {
        const res = await tasks.tasklists.list(p);
        const data: { items?: GoogleRawTaskList[]; nextPageToken?: string } = {};
        if (res.data.items) data.items = res.data.items as GoogleRawTaskList[];
        if (res.data.nextPageToken) data.nextPageToken = res.data.nextPageToken;
        return { data };
      },
    },
    tasks: {
      list: async (p) => {
        const res = await tasks.tasks.list(p);
        const data: { items?: GoogleRawTask[]; nextPageToken?: string } = {};
        if (res.data.items) data.items = res.data.items as GoogleRawTask[];
        if (res.data.nextPageToken) data.nextPageToken = res.data.nextPageToken;
        return { data };
      },
      get: async (p) => {
        const res = await tasks.tasks.get(p);
        return { data: res.data as GoogleRawTask };
      },
      insert: async (p) => {
        const res = await tasks.tasks.insert(p);
        return { data: res.data as GoogleRawTask };
      },
      patch: async (p) => {
        const res = await tasks.tasks.patch(p);
        return { data: res.data as GoogleRawTask };
      },
      delete: async (p) => {
        await tasks.tasks.delete(p);
      },
    },
  };
}

/**
 * googleapis types `Schema$Event.conferenceData` as non-nullable, but the REST
 * API takes `conferenceData: null` to detach a conference from an event. Only
 * the body needs the cast; every other parameter stays type-checked, so a
 * misspelled `sendUpdates` or `conferenceDataVersion` still fails to compile.
 */
function toEventBody(
  requestBody: Partial<GoogleEventWriteBody> | undefined,
): calendar_v3.Schema$Event {
  return requestBody as calendar_v3.Schema$Event;
}

function toEventInsertParams(
  params: Parameters<GoogleCalendarApi["events"]["insert"]>[0],
): calendar_v3.Params$Resource$Events$Insert {
  return { ...params, requestBody: toEventBody(params.requestBody) };
}

function toEventPatchParams(
  params: Parameters<GoogleCalendarApi["events"]["patch"]>[0],
): calendar_v3.Params$Resource$Events$Patch {
  return { ...params, requestBody: toEventBody(params.requestBody) };
}

export function createGoogleCalendarApi(calendar: CalendarClient): GoogleCalendarApi {
  return {
    calendarList: {
      list: async (p) => {
        const res = await calendar.calendarList.list(p);
        const data: CalendarListData = {};
        if (res.data.items) data.items = res.data.items;
        if (res.data.nextPageToken) data.nextPageToken = res.data.nextPageToken;
        return { data };
      },
    },
    events: {
      list: async (p) => {
        const res = await calendar.events.list(p);
        const data: EventListData = {};
        if (res.data.items) data.items = res.data.items;
        if (res.data.nextPageToken) data.nextPageToken = res.data.nextPageToken;
        return { data };
      },
      get: async (p) => {
        const res = await calendar.events.get(p);
        return { data: res.data };
      },
      insert: async (p) => {
        const res = await calendar.events.insert(toEventInsertParams(p));
        return { data: res.data };
      },
      patch: async (p) => {
        const res = await calendar.events.patch(toEventPatchParams(p));
        return { data: res.data };
      },
      delete: async (p) => {
        await calendar.events.delete(p);
      },
    },
  };
}
