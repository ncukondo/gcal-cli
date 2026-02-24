import { describe, it, expect, vi } from "vitest";
import {
  normalizeEvent,
  normalizeCalendar,
  listCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  ApiError,
  MAX_PAGES,
  type GoogleCalendarApi,
  type CreateEventInput,
  type UpdateEventInput,
} from "./api.ts";

describe("normalizeEvent", () => {
  it("handles all-day events (date field)", () => {
    const googleEvent = {
      id: "evt1",
      summary: "All Day Event",
      description: "A full day event",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      htmlLink: "https://calendar.google.com/event?eid=evt1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-01T12:00:00.000Z",
    };

    const result = normalizeEvent(googleEvent, "cal1", "My Calendar");

    expect(result).toEqual({
      id: "evt1",
      title: "All Day Event",
      description: "A full day event",
      start: "2024-03-15",
      end: "2024-03-16",
      all_day: true,
      calendar_id: "cal1",
      calendar_name: "My Calendar",
      html_link: "https://calendar.google.com/event?eid=evt1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-01T12:00:00.000Z",
    });
  });

  it("handles timed events (dateTime field with offset)", () => {
    const googleEvent = {
      id: "evt2",
      summary: "Meeting",
      description: null,
      start: { dateTime: "2024-03-15T09:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2024-03-15T10:00:00+09:00", timeZone: "Asia/Tokyo" },
      htmlLink: "https://calendar.google.com/event?eid=evt2",
      status: "tentative",
      transparency: "transparent",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-02T08:00:00.000Z",
    };

    const result = normalizeEvent(googleEvent, "cal2", "Work");

    expect(result).toEqual({
      id: "evt2",
      title: "Meeting",
      description: null,
      start: "2024-03-15T09:00:00+09:00",
      end: "2024-03-15T10:00:00+09:00",
      all_day: false,
      calendar_id: "cal2",
      calendar_name: "Work",
      html_link: "https://calendar.google.com/event?eid=evt2",
      status: "tentative",
      transparency: "transparent",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-02T08:00:00.000Z",
    });
  });

  it("defaults missing fields", () => {
    const googleEvent = {
      id: "evt3",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.title).toBe("");
    expect(result.description).toBeNull();
    expect(result.html_link).toBe("");
    expect(result.status).toBe("confirmed");
    expect(result.transparency).toBe("opaque");
    expect(result.created).toBe("");
    expect(result.updated).toBe("");
  });

  it("falls back to defaults for invalid status values", () => {
    const googleEvent = {
      id: "evt4",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      status: "INVALID_STATUS",
      transparency: "opaque",
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.status).toBe("confirmed");
  });

  it("falls back to defaults for invalid transparency values", () => {
    const googleEvent = {
      id: "evt5",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      status: "confirmed",
      transparency: "INVALID_TRANSPARENCY",
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.transparency).toBe("opaque");
  });
});

describe("normalizeCalendar", () => {
  it("maps Google API fields to internal Calendar type", () => {
    const googleCalendar = {
      id: "primary",
      summary: "My Calendar",
      description: "Personal calendar",
      primary: true,
    };

    const result = normalizeCalendar(googleCalendar);

    expect(result).toEqual({
      id: "primary",
      name: "My Calendar",
      description: "Personal calendar",
      primary: true,
      enabled: true,
    });
  });

  it("defaults missing fields", () => {
    const googleCalendar = {
      id: "cal2",
      summary: "Work",
    };

    const result = normalizeCalendar(googleCalendar);

    expect(result).toEqual({
      id: "cal2",
      name: "Work",
      description: null,
      primary: false,
      enabled: true,
    });
  });
});

function createMockApi(responses: Record<string, unknown>): GoogleCalendarApi {
  return {
    calendarList: {
      list: vi.fn().mockImplementation(async (params?: { pageToken?: string }) => {
        const key = params?.pageToken ?? "default";
        return { data: responses[key] ?? responses["default"] };
      }),
    },
    events: {
      list: vi
        .fn()
        .mockImplementation(async (params: { calendarId: string; pageToken?: string }) => {
          const key = params.pageToken ?? "default";
          return { data: responses[key] ?? responses["default"] };
        }),
      get: vi.fn().mockImplementation(async (params: { calendarId: string; eventId: string }) => {
        const key = params.eventId;
        const response = responses[key];
        if (!response) {
          const error = new Error("Not Found") as Error & { code: number };
          error.code = 404;
          throw error;
        }
        return { data: response };
      }),
      insert: vi.fn().mockImplementation(async () => {
        return { data: responses["inserted"] ?? responses["default"] };
      }),
      patch: vi.fn().mockImplementation(async () => {
        return { data: responses["patched"] ?? responses["default"] };
      }),
      delete: vi.fn().mockImplementation(async (params: { calendarId: string; eventId: string }) => {
        const key = params.eventId;
        if (responses[key] === "not_found") {
          const error = new Error("Not Found") as Error & { code: number };
          error.code = 404;
          throw error;
        }
      }),
    },
  };
}

describe("listCalendars", () => {
  it("returns normalized Calendar[] from Google API response", async () => {
    const api = createMockApi({
      default: {
        items: [
          { id: "cal1", summary: "Primary", description: "Main", primary: true },
          { id: "cal2", summary: "Work", description: null, primary: false },
        ],
      },
    });

    const result = await listCalendars(api);

    expect(result).toEqual([
      { id: "cal1", name: "Primary", description: "Main", primary: true, enabled: true },
      { id: "cal2", name: "Work", description: null, primary: false, enabled: true },
    ]);
  });

  it("handles pagination (nextPageToken)", async () => {
    const api = createMockApi({
      default: {
        items: [{ id: "cal1", summary: "First" }],
        nextPageToken: "page2",
      },
      page2: {
        items: [{ id: "cal2", summary: "Second" }],
      },
    });

    const result = await listCalendars(api);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("cal1");
    expect(result[1]!.id).toBe("cal2");
  });

  it("throws API_ERROR when pagination exceeds MAX_PAGES", async () => {
    const api: GoogleCalendarApi = {
      calendarList: {
        list: vi.fn().mockResolvedValue({
          data: { items: [{ id: "cal1", summary: "Cal" }], nextPageToken: "next" },
        }),
      },
      events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };

    const error = await listCalendars(api).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
    expect(error.message).toContain(`${MAX_PAGES}`);
  });
});

describe("listEvents", () => {
  it("returns normalized CalendarEvent[] from Google API response", async () => {
    const api = createMockApi({
      default: {
        items: [
          {
            id: "evt1",
            summary: "Lunch",
            start: { dateTime: "2024-03-15T12:00:00+09:00" },
            end: { dateTime: "2024-03-15T13:00:00+09:00" },
            status: "confirmed",
          },
        ],
      },
    });

    const result = await listEvents(api, "cal1", "My Cal");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("evt1");
    expect(result[0]!.title).toBe("Lunch");
    expect(result[0]!.calendar_id).toBe("cal1");
    expect(result[0]!.calendar_name).toBe("My Cal");
  });

  it("handles all-day events (date vs dateTime fields)", async () => {
    const api = createMockApi({
      default: {
        items: [
          {
            id: "evt1",
            summary: "Holiday",
            start: { date: "2024-03-15" },
            end: { date: "2024-03-16" },
          },
        ],
      },
    });

    const result = await listEvents(api, "cal1", "Cal");

    expect(result[0]!.all_day).toBe(true);
    expect(result[0]!.start).toBe("2024-03-15");
  });

  it("handles timed events with timezone offset", async () => {
    const api = createMockApi({
      default: {
        items: [
          {
            id: "evt1",
            summary: "Call",
            start: { dateTime: "2024-03-15T15:00:00-05:00" },
            end: { dateTime: "2024-03-15T16:00:00-05:00" },
          },
        ],
      },
    });

    const result = await listEvents(api, "cal1", "Cal");

    expect(result[0]!.all_day).toBe(false);
    expect(result[0]!.start).toBe("2024-03-15T15:00:00-05:00");
  });

  it("supports timeMin/timeMax parameters", async () => {
    const listFn = vi.fn().mockResolvedValue({ data: { items: [] } });
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: listFn,
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    await listEvents(api, "cal1", "Cal", {
      timeMin: "2024-03-01T00:00:00Z",
      timeMax: "2024-03-31T23:59:59Z",
    });

    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "cal1",
        timeMin: "2024-03-01T00:00:00Z",
        timeMax: "2024-03-31T23:59:59Z",
        singleEvents: true,
        orderBy: "startTime",
      }),
    );
  });

  it("supports q (search query) parameter", async () => {
    const listFn = vi.fn().mockResolvedValue({ data: { items: [] } });
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: listFn,
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    await listEvents(api, "cal1", "Cal", { q: "meeting" });

    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "meeting",
      }),
    );
  });

  it("handles pagination", async () => {
    const api = createMockApi({
      default: {
        items: [
          {
            id: "evt1",
            summary: "First",
            start: { date: "2024-03-15" },
            end: { date: "2024-03-16" },
          },
        ],
        nextPageToken: "page2",
      },
      page2: {
        items: [
          {
            id: "evt2",
            summary: "Second",
            start: { date: "2024-03-16" },
            end: { date: "2024-03-17" },
          },
        ],
      },
    });

    const result = await listEvents(api, "cal1", "Cal");

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("evt1");
    expect(result[1]!.id).toBe("evt2");
  });

  it("throws API_ERROR when pagination exceeds MAX_PAGES", async () => {
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: "evt1",
                summary: "E",
                start: { date: "2024-01-01" },
                end: { date: "2024-01-02" },
              },
            ],
            nextPageToken: "next",
          },
        }),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const error = await listEvents(api, "cal1", "Cal").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
    expect(error.message).toContain(`${MAX_PAGES}`);
  });
});

describe("getEvent", () => {
  it("returns a single normalized event by ID", async () => {
    const api = createMockApi({
      evt1: {
        id: "evt1",
        summary: "Standup",
        start: { dateTime: "2024-03-15T09:00:00+09:00" },
        end: { dateTime: "2024-03-15T09:30:00+09:00" },
        status: "confirmed",
      },
    });

    const result = await getEvent(api, "cal1", "My Cal", "evt1");

    expect(result.id).toBe("evt1");
    expect(result.title).toBe("Standup");
    expect(result.calendar_id).toBe("cal1");
  });

  it("throws NOT_FOUND for non-existent event", async () => {
    const api = createMockApi({});

    const error = await getEvent(api, "cal1", "Cal", "missing").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("API error mapping", () => {
  it("maps 401 errors to AUTH_REQUIRED", async () => {
    const api: GoogleCalendarApi = {
      calendarList: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
      },
      events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };

    const error = await listCalendars(api).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("maps 403 errors to AUTH_REQUIRED", async () => {
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 })),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const error = await listEvents(api, "cal1", "Cal").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("maps other HTTP errors to API_ERROR", async () => {
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn(),
        get: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Internal Server Error"), { code: 500 })),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const error = await getEvent(api, "cal1", "Cal", "evt1").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
  });

  it("re-throws non-HTTP errors as-is", async () => {
    const api: GoogleCalendarApi = {
      calendarList: {
        list: vi.fn().mockRejectedValue(new TypeError("Network error")),
      },
      events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };

    await expect(listCalendars(api)).rejects.toThrow(TypeError);
  });
});

describe("createEvent", () => {
  it("sends correct payload for timed event and returns normalized event", async () => {
    const returnedEvent = {
      id: "new1",
      summary: "Team Meeting",
      description: "Weekly sync",
      start: { dateTime: "2024-03-15T09:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2024-03-15T10:00:00+09:00", timeZone: "Asia/Tokyo" },
      htmlLink: "https://calendar.google.com/event?eid=new1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-15T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ inserted: returnedEvent });

    const input: CreateEventInput = {
      title: "Team Meeting",
      start: "2024-03-15T09:00:00+09:00",
      end: "2024-03-15T10:00:00+09:00",
      allDay: false,
      timeZone: "Asia/Tokyo",
      description: "Weekly sync",
    };

    const result = await createEvent(api, "cal1", "My Cal", input);

    expect(api.events.insert).toHaveBeenCalledWith({
      calendarId: "cal1",
      requestBody: {
        summary: "Team Meeting",
        description: "Weekly sync",
        start: { dateTime: "2024-03-15T09:00:00+09:00", timeZone: "Asia/Tokyo" },
        end: { dateTime: "2024-03-15T10:00:00+09:00", timeZone: "Asia/Tokyo" },
        transparency: "opaque",
      },
    });

    expect(result.id).toBe("new1");
    expect(result.title).toBe("Team Meeting");
    expect(result.calendar_id).toBe("cal1");
    expect(result.calendar_name).toBe("My Cal");
    expect(result.all_day).toBe(false);
  });

  it("handles all-day event creation (date vs dateTime)", async () => {
    const returnedEvent = {
      id: "new2",
      summary: "Vacation",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-17" },
      htmlLink: "https://calendar.google.com/event?eid=new2",
      status: "confirmed",
      transparency: "transparent",
      created: "2024-03-15T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ inserted: returnedEvent });

    const input: CreateEventInput = {
      title: "Vacation",
      start: "2024-03-15",
      end: "2024-03-17",
      allDay: true,
      transparency: "transparent",
    };

    const result = await createEvent(api, "cal1", "My Cal", input);

    expect(api.events.insert).toHaveBeenCalledWith({
      calendarId: "cal1",
      requestBody: {
        summary: "Vacation",
        start: { date: "2024-03-15" },
        end: { date: "2024-03-17" },
        transparency: "transparent",
      },
    });

    expect(result.all_day).toBe(true);
    expect(result.start).toBe("2024-03-15");
  });

  it("sets transparency (opaque/transparent)", async () => {
    const returnedEvent = {
      id: "new3",
      summary: "Focus Time",
      start: { dateTime: "2024-03-15T14:00:00Z" },
      end: { dateTime: "2024-03-15T16:00:00Z" },
      status: "confirmed",
      transparency: "transparent",
      created: "2024-03-15T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ inserted: returnedEvent });

    const input: CreateEventInput = {
      title: "Focus Time",
      start: "2024-03-15T14:00:00Z",
      end: "2024-03-15T16:00:00Z",
      allDay: false,
      transparency: "transparent",
    };

    await createEvent(api, "cal1", "Cal", input);

    expect(api.events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          transparency: "transparent",
        }),
      }),
    );
  });

  it("maps API errors correctly", async () => {
    const insertFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 }));
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: insertFn,
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const input: CreateEventInput = {
      title: "Test",
      start: "2024-03-15T09:00:00Z",
      end: "2024-03-15T10:00:00Z",
      allDay: false,
    };

    const error = await createEvent(api, "cal1", "Cal", input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("updateEvent", () => {
  it("sends partial update and returns normalized updated event", async () => {
    const returnedEvent = {
      id: "evt1",
      summary: "Updated Title",
      description: "Original desc",
      start: { dateTime: "2024-03-15T09:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2024-03-15T10:00:00+09:00", timeZone: "Asia/Tokyo" },
      htmlLink: "https://calendar.google.com/event?eid=evt1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ patched: returnedEvent });

    const input: UpdateEventInput = {
      title: "Updated Title",
    };

    const result = await updateEvent(api, "cal1", "My Cal", "evt1", input);

    expect(api.events.patch).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
      requestBody: {
        summary: "Updated Title",
      },
    });

    expect(result.id).toBe("evt1");
    expect(result.title).toBe("Updated Title");
    expect(result.calendar_id).toBe("cal1");
  });

  it("handles time field updates with timezone", async () => {
    const returnedEvent = {
      id: "evt1",
      summary: "Meeting",
      start: { dateTime: "2024-03-15T14:00:00-05:00", timeZone: "America/New_York" },
      end: { dateTime: "2024-03-15T15:00:00-05:00", timeZone: "America/New_York" },
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ patched: returnedEvent });

    const input: UpdateEventInput = {
      start: "2024-03-15T14:00:00-05:00",
      end: "2024-03-15T15:00:00-05:00",
      allDay: false,
      timeZone: "America/New_York",
    };

    const result = await updateEvent(api, "cal1", "Cal", "evt1", input);

    expect(api.events.patch).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
      requestBody: {
        start: { dateTime: "2024-03-15T14:00:00-05:00", timeZone: "America/New_York" },
        end: { dateTime: "2024-03-15T15:00:00-05:00", timeZone: "America/New_York" },
      },
    });

    expect(result.start).toBe("2024-03-15T14:00:00-05:00");
  });

  it("handles updating to all-day event", async () => {
    const returnedEvent = {
      id: "evt1",
      summary: "All Day",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T00:00:00.000Z",
      updated: "2024-03-15T00:00:00.000Z",
    };

    const api = createMockApi({ patched: returnedEvent });

    const input: UpdateEventInput = {
      start: "2024-03-15",
      end: "2024-03-16",
      allDay: true,
    };

    const result = await updateEvent(api, "cal1", "Cal", "evt1", input);

    expect(api.events.patch).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
      requestBody: {
        start: { date: "2024-03-15" },
        end: { date: "2024-03-16" },
      },
    });

    expect(result.all_day).toBe(true);
  });

  it("throws when partial time fields are provided (start without end/allDay)", async () => {
    const api = createMockApi({});

    const input = { start: "2024-03-15T09:00:00Z" } as UpdateEventInput;

    await expect(updateEvent(api, "cal1", "Cal", "evt1", input)).rejects.toThrow(
      "start, end, and allDay must all be provided together",
    );
    expect(api.events.patch).not.toHaveBeenCalled();
  });

  it("throws when start and end provided without allDay", async () => {
    const api = createMockApi({});

    const input = { start: "2024-03-15T09:00:00Z", end: "2024-03-15T10:00:00Z" } as UpdateEventInput;

    await expect(updateEvent(api, "cal1", "Cal", "evt1", input)).rejects.toThrow(
      "start, end, and allDay must all be provided together",
    );
    expect(api.events.patch).not.toHaveBeenCalled();
  });

  it("maps API errors correctly", async () => {
    const patchFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        patch: patchFn,
        delete: vi.fn(),
      },
    };

    const input: UpdateEventInput = { title: "New Title" };

    const error = await updateEvent(api, "cal1", "Cal", "missing", input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteEvent", () => {
  it("sends delete request and returns success", async () => {
    const api = createMockApi({ evt1: "exists" });

    await deleteEvent(api, "cal1", "evt1");

    expect(api.events.delete).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
    });
  });

  it("throws NOT_FOUND for non-existent event", async () => {
    const api = createMockApi({ missing: "not_found" });

    const error = await deleteEvent(api, "cal1", "missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps API errors correctly", async () => {
    const deleteFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Server Error"), { code: 500 }));
    const api: GoogleCalendarApi = {
      calendarList: { list: vi.fn() },
      events: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: deleteFn,
      },
    };

    const error = await deleteEvent(api, "cal1", "evt1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
  });
});
