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
      attendees: [],
      meet_link: null,
      conference: null,
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
      attendees: [],
      meet_link: null,
      conference: null,
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

  it("returns an empty array when the event has no attendees", () => {
    const googleEvent = {
      id: "evt6",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.attendees).toEqual([]);
  });

  it("normalizes attendees", () => {
    const googleEvent = {
      id: "evt7",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      attendees: [
        {
          email: "alice@example.com",
          displayName: "Alice",
          responseStatus: "accepted",
          organizer: true,
          self: true,
        },
        { email: "bob@example.com", responseStatus: "needsAction", optional: true },
      ],
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.attendees).toEqual([
      {
        email: "alice@example.com",
        display_name: "Alice",
        response_status: "accepted",
        optional: false,
        organizer: true,
        self: true,
      },
      {
        email: "bob@example.com",
        display_name: null,
        response_status: "needsAction",
        optional: true,
        organizer: false,
        self: false,
      },
    ]);
  });

  it("falls back to needsAction for invalid attendee response statuses", () => {
    const googleEvent = {
      id: "evt8",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      attendees: [{ email: "carol@example.com", responseStatus: "INVALID_STATUS" }],
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.attendees[0]?.response_status).toBe("needsAction");
  });

  it("skips attendees without an email address", () => {
    const googleEvent = {
      id: "evt9",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      attendees: [{ displayName: "Room A" }, { email: "dave@example.com" }],
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.attendees).toHaveLength(1);
    expect(result.attendees[0]?.email).toBe("dave@example.com");
  });

  it("reads meet_link from hangoutLink", () => {
    const googleEvent = {
      id: "evt10",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("falls back to the video entry point when hangoutLink is absent", () => {
    const googleEvent = {
      id: "evt11",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+81-3-0000-0000" },
          { entryPointType: "video", uri: "https://meet.google.com/xyz-uvwx-rst" },
        ],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBe("https://meet.google.com/xyz-uvwx-rst");
  });

  it("prefers hangoutLink over the video entry point", () => {
    const googleEvent = {
      id: "evt12",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://meet.google.com/from-hangout-link",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/from-entry-point" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBe("https://meet.google.com/from-hangout-link");
  });

  it("returns null meet_link when the event has no conference", () => {
    const googleEvent = {
      id: "evt13",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBeNull();
  });

  it("does not call a third-party conference a Meet link", () => {
    const googleEvent = {
      id: "evt15",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      conferenceData: {
        conferenceSolution: { key: { type: "addOn" }, name: "Zoom Meeting" },
        entryPoints: [{ entryPointType: "video", uri: "https://example.zoom.us/j/123" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBeNull();
    expect(result.conference).toEqual({ type: "addOn", uri: "https://example.zoom.us/j/123" });
  });

  it("reports a hangoutsMeet conference as both meet_link and conference", () => {
    const googleEvent = {
      id: "evt16",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      conferenceData: {
        conferenceSolution: { key: { type: "hangoutsMeet" }, name: "Google Meet" },
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
    expect(result.conference).toEqual({
      type: "hangoutsMeet",
      uri: "https://meet.google.com/abc-defg-hij",
    });
  });

  it("does not trust hangoutLink when the solution is classic Hangouts", () => {
    // hangoutLink predates Meet and is still set for eventHangout /
    // eventNamedHangout, so it cannot settle whether a conference is Meet.
    const googleEvent = {
      id: "evt19",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://hangouts.google.com/hangouts/_/abc",
      conferenceData: {
        conferenceSolution: { key: { type: "eventHangout" } },
        entryPoints: [
          { entryPointType: "video", uri: "https://hangouts.google.com/hangouts/_/abc" },
        ],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBeNull();
    expect(result.conference?.type).toBe("eventHangout");
  });

  it("does not trust hangoutLink when a third-party add-on is attached", () => {
    const googleEvent = {
      id: "evt20",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://meet.google.com/stale-link",
      conferenceData: {
        conferenceSolution: { key: { type: "addOn" } },
        entryPoints: [{ entryPointType: "video", uri: "https://example.zoom.us/j/123" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBeNull();
    expect(result.conference).toEqual({ type: "addOn", uri: "https://example.zoom.us/j/123" });
  });

  it("returns a null conference while the conference is still pending", () => {
    const googleEvent = {
      id: "evt21",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "pending" } },
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    // Nothing is known about it yet, so there is nothing to describe.
    expect(result.conference).toBeNull();
    expect(result.meet_link).toBeNull();
  });

  it("treats a conference of unknown solution as Meet", () => {
    // With no conferenceSolution to go on there is nothing to veto the link,
    // so hangoutLink is the best answer available -- note this is a fallback,
    // not evidence: hangoutLink alone never establishes that a conference is Meet.
    const googleEvent = {
      id: "evt17",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
    expect(result.conference).toEqual({
      type: null,
      uri: "https://meet.google.com/abc-defg-hij",
    });
  });

  it("returns a null conference when the event has none", () => {
    const googleEvent = {
      id: "evt18",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.conference).toBeNull();
  });

  it("returns null meet_link when conferenceData has no video entry point", () => {
    const googleEvent = {
      id: "evt14",
      start: { dateTime: "2024-03-15T09:00:00+09:00" },
      end: { dateTime: "2024-03-15T10:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "pending" } },
        entryPoints: [{ entryPointType: "phone", uri: "tel:+81-3-0000-0000" }],
      },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.meet_link).toBeNull();
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
      delete: vi
        .fn()
        .mockImplementation(async (params: { calendarId: string; eventId: string }) => {
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
      sendUpdates: "none",
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
      sendUpdates: "none",
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
      sendUpdates: "none",
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
      sendUpdates: "none",
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
      sendUpdates: "none",
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

    const input = {
      start: "2024-03-15T09:00:00Z",
      end: "2024-03-15T10:00:00Z",
    } as UpdateEventInput;

    await expect(updateEvent(api, "cal1", "Cal", "evt1", input)).rejects.toThrow(
      "start, end, and allDay must all be provided together",
    );
    expect(api.events.patch).not.toHaveBeenCalled();
  });

  it("maps API errors correctly", async () => {
    const patchFn = vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
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

describe("attendees and notifications", () => {
  const returnedEvent = {
    id: "evt1",
    summary: "Meeting",
    start: { dateTime: "2024-03-15T09:00:00+09:00" },
    end: { dateTime: "2024-03-15T10:00:00+09:00" },
  };

  const baseInput: CreateEventInput = {
    title: "Meeting",
    start: "2024-03-15T09:00:00+09:00",
    end: "2024-03-15T10:00:00+09:00",
    allDay: false,
  };

  it("createEvent sends sendUpdates: none by default", async () => {
    const api = createMockApi({ inserted: returnedEvent });

    await createEvent(api, "cal1", "Cal", baseInput);

    expect(api.events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sendUpdates: "none" }),
    );
  });

  it("createEvent sends attendees when provided", async () => {
    const api = createMockApi({ inserted: returnedEvent });

    await createEvent(api, "cal1", "Cal", {
      ...baseInput,
      attendees: [{ email: "alice@example.com" }, { email: "bob@example.com", optional: true }],
      sendUpdates: "all",
    });

    expect(api.events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: "all",
        requestBody: expect.objectContaining({
          attendees: [{ email: "alice@example.com" }, { email: "bob@example.com", optional: true }],
        }),
      }),
    );
  });

  it("createEvent omits attendees when not provided", async () => {
    const api = createMockApi({ inserted: returnedEvent });

    await createEvent(api, "cal1", "Cal", baseInput);

    const call = vi.mocked(api.events.insert).mock.calls[0]?.[0];
    expect(call?.requestBody).not.toHaveProperty("attendees");
  });

  it("createEvent round-trips displayName and responseStatus", async () => {
    const api = createMockApi({ inserted: returnedEvent });

    await createEvent(api, "cal1", "Cal", {
      ...baseInput,
      attendees: [{ email: "alice@example.com", displayName: "Alice", responseStatus: "accepted" }],
    });

    expect(api.events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          attendees: [
            { email: "alice@example.com", displayName: "Alice", responseStatus: "accepted" },
          ],
        }),
      }),
    );
  });

  it("updateEvent sends an empty attendees array to clear the guest list", async () => {
    const api = createMockApi({ patched: returnedEvent });

    await updateEvent(api, "cal1", "Cal", "evt1", { attendees: [] });

    expect(api.events.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        sendUpdates: "none",
        requestBody: { attendees: [] },
      }),
    );
  });

  it("updateEvent omits attendees when not provided", async () => {
    const api = createMockApi({ patched: returnedEvent });

    await updateEvent(api, "cal1", "Cal", "evt1", { title: "Renamed" });

    const call = vi.mocked(api.events.patch).mock.calls[0]?.[0];
    expect(call?.requestBody).not.toHaveProperty("attendees");
  });

  it("deleteEvent forwards sendUpdates", async () => {
    const api = createMockApi({});

    await deleteEvent(api, "cal1", "evt1", "all");

    expect(api.events.delete).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
      sendUpdates: "all",
    });
  });

  it("deleteEvent defaults to sendUpdates: none", async () => {
    const api = createMockApi({});

    await deleteEvent(api, "cal1", "evt1");

    expect(api.events.delete).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt1",
      sendUpdates: "none",
    });
  });
});

describe("updateEvent attendee diff", () => {
  const patchedEvent = {
    id: "evt1",
    summary: "Meeting",
    start: { dateTime: "2024-03-15T09:00:00+09:00" },
    end: { dateTime: "2024-03-15T10:00:00+09:00" },
  };

  /** Raw attendee objects as the API returns them, fields the CLI models or not. */
  function withAttendees(attendees: unknown[]) {
    return { ...patchedEvent, attendees };
  }

  function patchedAttendees(api: GoogleCalendarApi): unknown {
    return vi.mocked(api.events.patch).mock.calls[0]?.[0]?.requestBody?.attendees;
  }

  it("appends a guest and writes the existing attendees back untouched", async () => {
    const api = createMockApi({
      evt1: withAttendees([
        {
          email: "alice@example.com",
          responseStatus: "accepted",
          comment: "joining 10 min late",
          additionalGuests: 2,
        },
      ]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: { add: [{ email: "bob@example.com" }], removeEmails: [] },
    });

    expect(api.events.get).toHaveBeenCalledTimes(1);
    expect(patchedAttendees(api)).toEqual([
      {
        email: "alice@example.com",
        responseStatus: "accepted",
        comment: "joining 10 min late",
        additionalGuests: 2,
      },
      { email: "bob@example.com" },
    ]);
  });

  it("removes by address case-insensitively and keeps attendees that have none", async () => {
    const api = createMockApi({
      evt1: withAttendees([
        { email: "alice@example.com", responseStatus: "accepted" },
        { displayName: "Meeting Room A", resource: true, responseStatus: "accepted" },
        { email: "bob@example.com", responseStatus: "needsAction" },
      ]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: { add: [], removeEmails: ["BOB@Example.COM"] },
    });

    expect(patchedAttendees(api)).toEqual([
      { email: "alice@example.com", responseStatus: "accepted" },
      { displayName: "Meeting Room A", resource: true, responseStatus: "accepted" },
    ]);
  });

  it("omits attendees from the patch when nothing was added or removed", async () => {
    const api = createMockApi({
      evt1: withAttendees([{ email: "alice@example.com", responseStatus: "accepted" }]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: {
        add: [{ email: "ALICE@example.com" }],
        removeEmails: ["dave@example.com"],
      },
      sendUpdates: "all",
    });

    const params = vi.mocked(api.events.patch).mock.calls[0]?.[0];
    expect(params?.requestBody).not.toHaveProperty("attendees");
    expect(params?.sendUpdates).toBe("all");
  });

  it("still applies the other fields when the diff turns out to be empty", async () => {
    const api = createMockApi({
      evt1: withAttendees([{ email: "alice@example.com" }]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      title: "Renamed",
      attendeeDiff: { add: [], removeEmails: ["dave@example.com"] },
    });

    const params = vi.mocked(api.events.patch).mock.calls[0]?.[0];
    expect(params?.requestBody.summary).toBe("Renamed");
    expect(params?.requestBody).not.toHaveProperty("attendees");
  });

  it("treats a missing attendees array as an empty guest list", async () => {
    const api = createMockApi({ evt1: patchedEvent, patched: patchedEvent });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: { add: [{ email: "bob@example.com" }], removeEmails: [] },
    });

    expect(patchedAttendees(api)).toEqual([{ email: "bob@example.com" }]);
  });

  it("merges the caller's snapshot without reading the event again", async () => {
    const api = createMockApi({
      // A second read would see this, so a fetch here is visible in the result.
      evt1: withAttendees([{ email: "zoe@example.com", responseStatus: "accepted" }]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: {
        add: [{ email: "bob@example.com" }],
        removeEmails: [],
        base: [
          {
            email: "alice@example.com",
            responseStatus: "tentative",
            comment: "joining 10 min late",
          },
        ],
      },
    });

    expect(api.events.get).not.toHaveBeenCalled();
    expect(patchedAttendees(api)).toEqual([
      { email: "alice@example.com", responseStatus: "tentative", comment: "joining 10 min late" },
      { email: "bob@example.com" },
    ]);
  });

  it("takes an empty caller snapshot at face value instead of reading", async () => {
    const api = createMockApi({
      evt1: withAttendees([{ email: "zoe@example.com" }]),
      patched: patchedEvent,
    });

    await updateEvent(api, "cal1", "Cal", "evt1", {
      attendeeDiff: { add: [{ email: "bob@example.com" }], removeEmails: [], base: [] },
    });

    expect(api.events.get).not.toHaveBeenCalled();
    expect(patchedAttendees(api)).toEqual([{ email: "bob@example.com" }]);
  });

  it("does not fetch the event when no attendee diff is given", async () => {
    const api = createMockApi({ patched: patchedEvent });

    await updateEvent(api, "cal1", "Cal", "evt1", { title: "Renamed" });

    expect(api.events.get).not.toHaveBeenCalled();
  });

  it("rejects a whole-list replacement combined with a diff", async () => {
    const api = createMockApi({ evt1: withAttendees([]), patched: patchedEvent });

    const error = await updateEvent(api, "cal1", "Cal", "evt1", {
      attendees: [{ email: "alice@example.com" }],
      attendeeDiff: { add: [{ email: "bob@example.com" }], removeEmails: [] },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "INVALID_ARGS" });
    expect(api.events.patch).not.toHaveBeenCalled();
  });
});

describe("Google Meet conferencing", () => {
  const timedInput: CreateEventInput = {
    title: "Design review",
    start: "2026-09-01T10:00:00+09:00",
    end: "2026-09-01T11:00:00+09:00",
    allDay: false,
  };

  /**
   * events.get is scripted as a queue so a test can walk the pending -> success
   * transition one poll at a time.
   */
  function createConferenceApi(inserted: unknown, gets: unknown[] = []): GoogleCalendarApi {
    const queue = [...gets];
    const api = createMockApi({ inserted, patched: inserted });
    api.events.get = vi.fn().mockImplementation(async () => {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error("events.get called more times than the test scripted");
      }
      return { data: next };
    });
    return api;
  }

  function pendingEvent(id: string) {
    return {
      id,
      summary: "Design review",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "pending" } },
      },
    };
  }

  function successEvent(id: string, link = "https://meet.google.com/abc-defg-hij") {
    return {
      id,
      summary: "Design review",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
      hangoutLink: link,
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "success" } },
        entryPoints: [{ entryPointType: "video", uri: link }],
      },
    };
  }

  it("requests a conference with conferenceDataVersion: 1 when meet is set", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));

    const result = await createEvent(
      api,
      "cal1",
      "My Cal",
      { ...timedInput, meet: true },
      { generateRequestId: () => "fixed-request-id" },
    );

    expect(api.events.insert).toHaveBeenCalledWith({
      calendarId: "cal1",
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "Design review",
        start: { dateTime: "2026-09-01T10:00:00+09:00" },
        end: { dateTime: "2026-09-01T11:00:00+09:00" },
        transparency: "opaque",
        conferenceData: { createRequest: { requestId: "fixed-request-id" } },
      },
    });
    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("generates a fresh requestId for every call", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));

    await createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true });
    await createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true });

    const insert = api.events.insert as ReturnType<typeof vi.fn>;
    const first = insert.mock.calls[0]![0].requestBody.conferenceData.createRequest.requestId;
    const second = insert.mock.calls[1]![0].requestBody.conferenceData.createRequest.requestId;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("omits conferenceData and conferenceDataVersion when meet is not requested", async () => {
    const api = createConferenceApi(successEvent("evt-plain"));

    await createEvent(api, "cal1", "My Cal", timedInput);

    const insert = api.events.insert as ReturnType<typeof vi.fn>;
    const params = insert.mock.calls[0]![0];
    expect(params.requestBody).not.toHaveProperty("conferenceData");
    expect(params).not.toHaveProperty("conferenceDataVersion");
  });

  it("polls until the pending conference resolves", async () => {
    const api = createConferenceApi(pendingEvent("evt-meet"), [successEvent("evt-meet")]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await createEvent(
      api,
      "cal1",
      "My Cal",
      { ...timedInput, meet: true },
      { sleep },
    );

    expect(api.events.get).toHaveBeenCalledTimes(1);
    expect(api.events.get).toHaveBeenCalledWith({ calendarId: "cal1", eventId: "evt-meet" });
    expect(sleep).toHaveBeenCalledWith(500);
    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("gives up after three polls and returns the event with a null meet_link", async () => {
    const api = createConferenceApi(pendingEvent("evt-meet"), [
      pendingEvent("evt-meet"),
      pendingEvent("evt-meet"),
      pendingEvent("evt-meet"),
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await createEvent(
      api,
      "cal1",
      "My Cal",
      { ...timedInput, meet: true },
      { sleep },
    );

    expect(api.events.get).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000, 2000]);
    expect(result.id).toBe("evt-meet");
    expect(result.meet_link).toBeNull();
  });

  it("throws API_ERROR when the conference request fails", async () => {
    const failed = {
      id: "evt-meet",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "failure" } },
      },
    };
    const api = createConferenceApi(failed);

    await expect(createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true })).rejects.toThrow(
      ApiError,
    );
    await expect(createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true })).rejects.toThrow(
      /failure/,
    );
  });

  it("raises API_ERROR when failure only shows up on the last poll", async () => {
    const failed = {
      id: "evt-meet",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "failure" } },
      },
    };
    const api = createConferenceApi(pendingEvent("evt-meet"), [
      pendingEvent("evt-meet"),
      pendingEvent("evt-meet"),
      failed,
    ]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true }, { sleep }),
    ).rejects.toThrow(/failure/);
  });

  it("names the saved event when the conference request fails", async () => {
    const failed = {
      id: "evt-orphan",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
      conferenceData: {
        createRequest: { requestId: "req-1", status: { statusCode: "failure" } },
      },
    };
    const api = createConferenceApi(failed);

    // The event is already on the calendar, so the error has to say which one
    // it is or the user cannot clean it up.
    await expect(createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true })).rejects.toThrow(
      /evt-orphan/,
    );
  });

  it("hints at --meet when updateEvent draws a 400", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));
    const error = new Error("Invalid conference type value.") as Error & { code: number };
    error.code = 400;
    api.events.patch = vi.fn().mockRejectedValue(error);

    await expect(updateEvent(api, "cal1", "My Cal", "evt-meet", { meet: true })).rejects.toThrow(
      /--meet was requested/,
    );
  });

  it("polls on update until the pending conference resolves", async () => {
    const api = createConferenceApi(pendingEvent("evt-meet"), [successEvent("evt-meet")]);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await updateEvent(api, "cal1", "My Cal", "evt-meet", { meet: true }, { sleep });

    expect(api.events.get).toHaveBeenCalledTimes(1);
    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("hints at calendar support when the API rejects a conference request with 400", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));
    const error = new Error("Invalid conference type value.") as Error & { code: number };
    error.code = 400;
    api.events.insert = vi.fn().mockRejectedValue(error);

    await expect(createEvent(api, "cal1", "My Cal", { ...timedInput, meet: true })).rejects.toThrow(
      /--meet was requested/,
    );
  });

  it("does not add the conference hint to 400s on plain events", async () => {
    const api = createConferenceApi(successEvent("evt-plain"));
    const error = new Error("Invalid start time.") as Error & { code: number };
    error.code = 400;
    api.events.insert = vi.fn().mockRejectedValue(error);

    await expect(createEvent(api, "cal1", "My Cal", timedInput)).rejects.toThrow(
      /^Invalid start time\.$/,
    );
  });

  it("keeps the created event when polling for the conference fails", async () => {
    const api = createConferenceApi(pendingEvent("evt-meet"));
    const boom = new Error("Backend Error") as Error & { code: number };
    boom.code = 500;
    api.events.get = vi.fn().mockRejectedValue(boom);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await createEvent(
      api,
      "cal1",
      "My Cal",
      { ...timedInput, meet: true },
      { sleep },
    );

    // The event was already written, so a failed poll must not fail the command.
    expect(result.id).toBe("evt-meet");
    expect(result.meet_link).toBeNull();
  });

  it("attaches a conference on update with conferenceDataVersion: 1", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));

    const result = await updateEvent(
      api,
      "cal1",
      "My Cal",
      "evt-meet",
      { meet: true },
      { generateRequestId: () => "fixed-request-id" },
    );

    expect(api.events.patch).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt-meet",
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: { conferenceData: { createRequest: { requestId: "fixed-request-id" } } },
    });
    expect(result.meet_link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("removes a conference by patching conferenceData: null", async () => {
    const plain = {
      id: "evt-meet",
      start: { dateTime: "2026-09-01T10:00:00+09:00" },
      end: { dateTime: "2026-09-01T11:00:00+09:00" },
    };
    const api = createConferenceApi(plain);

    const result = await updateEvent(api, "cal1", "My Cal", "evt-meet", { removeMeet: true });

    expect(api.events.patch).toHaveBeenCalledWith({
      calendarId: "cal1",
      eventId: "evt-meet",
      sendUpdates: "none",
      conferenceDataVersion: 1,
      requestBody: { conferenceData: null },
    });
    expect(result.meet_link).toBeNull();
  });

  it("leaves conferenceData untouched when neither meet nor removeMeet is given", async () => {
    const api = createConferenceApi(successEvent("evt-meet"));

    await updateEvent(api, "cal1", "My Cal", "evt-meet", { title: "Renamed" });

    const patch = api.events.patch as ReturnType<typeof vi.fn>;
    const params = patch.mock.calls[0]![0];
    expect(params.requestBody).not.toHaveProperty("conferenceData");
    expect(params).not.toHaveProperty("conferenceDataVersion");
  });
});

describe("deleteEvent", () => {
  it("sends delete request and returns success", async () => {
    const api = createMockApi({ evt1: "exists" });

    await deleteEvent(api, "cal1", "evt1");

    expect(api.events.delete).toHaveBeenCalledWith({
      calendarId: "cal1",
      sendUpdates: "none",
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
