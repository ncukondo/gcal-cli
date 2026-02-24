import { vi } from "vitest";
import type { GoogleCalendarApi, GoogleEvent, GoogleCalendar } from "../../src/lib/api.ts";
import type { FsAdapter } from "../../src/lib/config.ts";

// --- Mock Google Calendar API ---

export interface MockApiData {
  events?: Record<string, GoogleEvent[]>; // calendarId -> events
  calendars?: GoogleCalendar[];
  insertedEvents?: GoogleEvent[];
  patchedEvents?: GoogleEvent[];
  deletedEvents?: { calendarId: string; eventId: string }[];
  errors?: {
    listEvents?: Error;
    getEvent?: Error;
    insertEvent?: Error;
    patchEvent?: Error;
    deleteEvent?: Error;
  };
}

export function createMockApi(data: MockApiData = {}): GoogleCalendarApi {
  const insertedEvents = data.insertedEvents ?? [];
  const patchedEvents = data.patchedEvents ?? [];
  const deletedEvents = data.deletedEvents ?? [];

  return {
    calendarList: {
      list: vi.fn().mockImplementation(async () => {
        return { data: { items: data.calendars ?? [] } };
      }),
    },
    events: {
      list: vi.fn().mockImplementation(async (params: { calendarId: string }) => {
        if (data.errors?.listEvents) throw data.errors.listEvents;
        const events = data.events?.[params.calendarId] ?? [];
        return { data: { items: events } };
      }),
      get: vi.fn().mockImplementation(async (params: { calendarId: string; eventId: string }) => {
        if (data.errors?.getEvent) throw data.errors.getEvent;
        const events = data.events?.[params.calendarId] ?? [];
        const event = events.find((e) => e.id === params.eventId);
        if (!event) {
          const err = new Error("Not Found") as Error & { code: number };
          err.code = 404;
          throw err;
        }
        return { data: event };
      }),
      insert: vi
        .fn()
        .mockImplementation(async (params: { calendarId: string; requestBody: unknown }) => {
          if (data.errors?.insertEvent) throw data.errors.insertEvent;
          const body = params.requestBody as Record<string, unknown>;
          const event: GoogleEvent = {
            id: `new-event-${String(insertedEvents.length + 1)}`,
            summary: body.summary as string,
            description: (body.description as string) ?? null,
            start: (body.start as GoogleEvent["start"]) ?? null,
            end: (body.end as GoogleEvent["end"]) ?? null,
            transparency: (body.transparency as string) ?? "opaque",
            status: "confirmed",
            htmlLink: "https://calendar.google.com/event/new-event",
            created: "2026-01-01T00:00:00Z",
            updated: "2026-01-01T00:00:00Z",
          };
          insertedEvents.push(event);
          return { data: event };
        }),
      patch: vi
        .fn()
        .mockImplementation(
          async (params: { calendarId: string; eventId: string; requestBody: unknown }) => {
            if (data.errors?.patchEvent) throw data.errors.patchEvent;
            const events = data.events?.[params.calendarId] ?? [];
            const existing = events.find((e) => e.id === params.eventId);
            if (!existing) {
              const err = new Error("Not Found") as Error & { code: number };
              err.code = 404;
              throw err;
            }
            const body = params.requestBody as Record<string, unknown>;
            const merged = {
              ...existing,
              ...(body.summary !== undefined ? { summary: body.summary } : {}),
              ...(body.description !== undefined ? { description: body.description } : {}),
              ...(body.start !== undefined ? { start: body.start } : {}),
              ...(body.end !== undefined ? { end: body.end } : {}),
              ...(body.transparency !== undefined ? { transparency: body.transparency } : {}),
              updated: "2026-02-01T00:00:00Z",
            };
            const updated = merged as GoogleEvent;
            patchedEvents.push(updated);
            return { data: updated };
          },
        ),
      delete: vi
        .fn()
        .mockImplementation(async (params: { calendarId: string; eventId: string }) => {
          if (data.errors?.deleteEvent) throw data.errors.deleteEvent;
          deletedEvents.push({ calendarId: params.calendarId, eventId: params.eventId });
        }),
    },
  };
}

// --- Mock FS for config ---

export function createMockFs(configContent?: string, configPath?: string): FsAdapter {
  const path = configPath ?? "/home/test/.config/gcal-cli/config.toml";
  return {
    existsSync: vi.fn().mockImplementation((p: string) => {
      if (configContent === undefined) return false;
      return p === path;
    }),
    readFileSync: vi.fn().mockImplementation((p: string) => {
      if (p === path && configContent !== undefined) return configContent;
      throw new Error(`File not found: ${p}`);
    }),
  };
}

// --- Sample config TOML ---

export const SAMPLE_CONFIG_TOML = `
timezone = "Asia/Tokyo"

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true

[[calendars]]
id = "work@group.calendar.google.com"
name = "Work"
enabled = true

[[calendars]]
id = "hobby@group.calendar.google.com"
name = "Hobby"
enabled = false
`;

export const SINGLE_CALENDAR_CONFIG_TOML = `
timezone = "Asia/Tokyo"

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true
`;

// --- Sample Google API events ---

export function makeGoogleEvent(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "evt-1",
    summary: "Team Meeting",
    description: null,
    start: { dateTime: "2026-02-23T10:00:00+09:00" },
    end: { dateTime: "2026-02-23T11:00:00+09:00" },
    status: "confirmed",
    transparency: "opaque",
    htmlLink: "https://calendar.google.com/event/evt-1",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeAllDayGoogleEvent(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "evt-allday-1",
    summary: "Company Holiday",
    description: null,
    start: { date: "2026-02-23" },
    end: { date: "2026-02-24" },
    status: "confirmed",
    transparency: "opaque",
    htmlLink: "https://calendar.google.com/event/evt-allday-1",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- Output capture helper ---

export function captureWrite(): { write: (msg: string) => void; output: () => string } {
  const messages: string[] = [];
  return {
    write: (msg: string) => messages.push(msg),
    output: () => messages.join("\n"),
  };
}
