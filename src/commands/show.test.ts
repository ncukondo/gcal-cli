import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { CalendarEvent } from "../types/index.ts";
import { createShowCommand, handleShow } from "./show.ts";
import type { ShowHandlerOptions } from "./show.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Team Meeting",
    description: "Weekly sync",
    start: "2026-02-01T10:00:00+09:00",
    end: "2026-02-01T11:00:00+09:00",
    all_day: false,
    calendar_id: "primary",
    calendar_name: "Main Calendar",
    html_link: "https://calendar.google.com/event?eid=evt1",
    status: "confirmed",
    transparency: "opaque",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function toGoogleEvent(e: CalendarEvent) {
  return {
    id: e.id,
    summary: e.title,
    description: e.description,
    start: e.all_day ? { date: e.start } : { dateTime: e.start },
    end: e.all_day ? { date: e.end } : { dateTime: e.end },
    htmlLink: e.html_link,
    status: e.status,
    transparency: e.transparency,
    created: e.created,
    updated: e.updated,
  };
}

function makeMockApi(event?: CalendarEvent): GoogleCalendarApi {
  return {
    calendarList: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
    events: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      get: event
        ? vi.fn().mockResolvedValue({ data: toGoogleEvent(event) })
        : vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 })),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function runShow(
  api: GoogleCalendarApi,
  opts: {
    eventId?: string;
    calendarId?: string;
    calendarName?: string;
    format?: "text" | "json";
  } = {},
) {
  const output: string[] = [];
  const handlerOpts: ShowHandlerOptions = {
    api,
    eventId: opts.eventId ?? "evt1",
    calendarId: opts.calendarId ?? "primary",
    calendarName: opts.calendarName ?? "Main Calendar",
    format: opts.format ?? "text",
    write: (msg: string) => {
      output.push(msg);
    },
  };
  return handleShow(handlerOpts).then((result) => ({ ...result, output }));
}

describe("show command", () => {
  describe("API interaction", () => {
    it("fetches single event by ID from API", async () => {
      const event = makeEvent();
      const api = makeMockApi(event);
      await runShow(api, { eventId: "evt1", calendarId: "primary" });

      expect(api.events.get).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
      });
    });

    it("returns NOT_FOUND error for non-existent event ID with exit code 1", async () => {
      const api = makeMockApi(); // no event → 404
      const result = await runShow(api, { eventId: "nonexistent" });

      expect(result.exitCode).toBe(1);
      const text = result.output.join("\n");
      expect(text).toContain("Not Found");
    });
  });

  describe("text output", () => {
    it("shows all event fields", async () => {
      const event = makeEvent({
        title: "Team Meeting",
        description: "Weekly sync",
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
        calendar_name: "Main Calendar",
        status: "confirmed",
        transparency: "opaque",
        html_link: "https://calendar.google.com/event?eid=evt1",
      });
      const api = makeMockApi(event);
      const result = await runShow(api);

      const text = result.output.join("\n");
      expect(text).toContain("Team Meeting");
      expect(text).toContain("2026-02-01");
      expect(text).toContain("10:00 - 11:00");
      expect(text).toContain("Main Calendar");
      expect(text).toContain("confirmed");
      expect(text).toContain("busy");
      expect(text).toContain("Weekly sync");
      expect(text).toContain("https://calendar.google.com/event?eid=evt1");
    });

    it("displays all-day event with date range without times", async () => {
      const event = makeEvent({
        title: "Vacation",
        all_day: true,
        start: "2026-02-01",
        end: "2026-02-04",
        description: null,
      });
      const api = makeMockApi(event);
      const result = await runShow(api);

      const text = result.output.join("\n");
      expect(text).toContain("Vacation");
      expect(text).toContain("2026-02-01 - 2026-02-03");
      expect(text).toContain("All Day");
    });

    it("displays single all-day event with just one date", async () => {
      const event = makeEvent({
        title: "Holiday",
        all_day: true,
        start: "2026-02-01",
        end: "2026-02-02",
        description: null,
      });
      const api = makeMockApi(event);
      const result = await runShow(api);

      const text = result.output.join("\n");
      expect(text).toContain("Holiday");
      expect(text).toContain("2026-02-01");
      expect(text).not.toContain("2026-02-01 -");
    });

    it("displays timed event with datetime and timezone", async () => {
      const event = makeEvent({
        title: "Standup",
        start: "2026-02-01T09:00:00+09:00",
        end: "2026-02-01T09:30:00+09:00",
      });
      const api = makeMockApi(event);
      const result = await runShow(api);

      const text = result.output.join("\n");
      expect(text).toContain("Standup");
      expect(text).toContain("2026-02-01");
      expect(text).toContain("09:00 - 09:30");
    });
  });

  describe("JSON output", () => {
    it("returns event in success envelope", async () => {
      const event = makeEvent();
      const api = makeMockApi(event);
      const result = await runShow(api, { format: "json" });

      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.event).toBeDefined();
      expect(json.data.event.id).toBe("evt1");
      expect(json.data.event.title).toBe("Team Meeting");
    });

    it("returns NOT_FOUND error in JSON format", async () => {
      const api = makeMockApi(); // no event → 404
      const result = await runShow(api, { format: "json", eventId: "nonexistent" });

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  describe("exit code", () => {
    it("returns exit code 0 on success", async () => {
      const event = makeEvent();
      const api = makeMockApi(event);
      const result = await runShow(api);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("createShowCommand", () => {
    it("creates a command named 'show'", () => {
      const cmd = createShowCommand();
      expect(cmd.name()).toBe("show");
    });

    it("requires an event-id argument", () => {
      const cmd = createShowCommand();
      cmd.exitOverride();
      expect(() => cmd.parse(["node", "show"])).toThrow();
    });

    it("accepts an event-id argument", () => {
      const cmd = createShowCommand();
      cmd.exitOverride();
      cmd.parse(["node", "show", "abc123"]);
      expect(cmd.args[0]).toBe("abc123");
    });
  });
});
