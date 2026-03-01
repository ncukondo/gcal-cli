import * as nodeFs from "node:fs";
import { google } from "googleapis";
import type { AuthFsAdapter } from "../lib/auth.ts";
import type { GoogleCalendarApi, GoogleCalendar, GoogleEvent } from "../lib/api.ts";

export const fsAdapter: AuthFsAdapter = {
  existsSync: (p: string) => nodeFs.existsSync(p),
  readFileSync: (p: string) => nodeFs.readFileSync(p, "utf-8"),
  writeFileSync: (p: string, d: string) => nodeFs.writeFileSync(p, d, "utf-8"),
  mkdirSync: (p: string) => nodeFs.mkdirSync(p, { recursive: true }),
  unlinkSync: (p: string) => nodeFs.unlinkSync(p),
  chmodSync: (p: string, m: number) => nodeFs.chmodSync(p, m),
};

type CalendarClient = ReturnType<typeof google.calendar>;

type CalendarListData = {
  items?: GoogleCalendar[];
  nextPageToken?: string;
};

type EventListData = {
  items?: GoogleEvent[];
  nextPageToken?: string;
};

/** Commander option callback to collect repeatable values into an array. */
export function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
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
        const res = await calendar.events.insert(p);
        return { data: res.data };
      },
      patch: async (p) => {
        const res = await calendar.events.patch(p);
        return { data: res.data };
      },
      delete: async (p) => {
        await calendar.events.delete(p);
      },
    },
  };
}
