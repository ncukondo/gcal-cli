import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { CalendarEvent } from "../types/index.ts";
import { createSearchCommand, handleSearch } from "./search.ts";
import type { SearchHandlerOptions } from "./search.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Team Meeting",
    description: null,
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

function makeMockApi(events: CalendarEvent[] = []): GoogleCalendarApi {
  return {
    calendarList: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
    events: {
      list: vi.fn().mockResolvedValue({
        data: {
          items: events.map((e) => ({
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
          })),
        },
      }),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}

interface SearchOpts {
  query: string;
  format?: "text" | "json";
  days?: number;
  from?: string;
  to?: string;
  busy?: boolean;
  free?: boolean;
  confirmed?: boolean;
  includeTentative?: boolean;
  calendars?: Array<{ id: string; name: string; enabled: boolean }>;
  timezone?: string;
}

function runSearch(api: GoogleCalendarApi, opts: SearchOpts) {
  const output: string[] = [];
  const errOutput: string[] = [];
  const handlerOpts: SearchHandlerOptions = {
    api,
    query: opts.query,
    format: opts.format ?? "text",
    calendars: opts.calendars ?? [{ id: "primary", name: "Main Calendar", enabled: true }],
    timezone: opts.timezone ?? "UTC",
    write: (msg: string) => {
      output.push(msg);
    },
    writeErr: (msg: string) => {
      errOutput.push(msg);
    },
  };
  if (opts.days !== undefined) handlerOpts.days = opts.days;
  if (opts.from !== undefined) handlerOpts.from = opts.from;
  if (opts.to !== undefined) handlerOpts.to = opts.to;
  if (opts.busy !== undefined) handlerOpts.busy = opts.busy;
  if (opts.free !== undefined) handlerOpts.free = opts.free;
  if (opts.confirmed !== undefined) handlerOpts.confirmed = opts.confirmed;
  if (opts.includeTentative !== undefined) handlerOpts.includeTentative = opts.includeTentative;
  return handleSearch(handlerOpts).then((result) => ({ ...result, output, errOutput }));
}

describe("search command", () => {
  describe("query handling", () => {
    it("passes query string to API q parameter", async () => {
      const api = makeMockApi([]);
      await runSearch(api, { query: "meeting" });

      expect(api.events.list).toHaveBeenCalledWith(expect.objectContaining({ q: "meeting" }));
    });
  });

  describe("date range", () => {
    it("defaults to 30-day search range", async () => {
      const api = makeMockApi([]);
      await runSearch(api, { query: "test", timezone: "UTC" });

      const call = (api.events.list as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const timeMin = new Date(call.timeMin);
      const timeMax = new Date(call.timeMax);
      const diffDays = (timeMax.getTime() - timeMin.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(30);
    });

    it("--days overrides default search range", async () => {
      const api = makeMockApi([]);
      await runSearch(api, { query: "test", days: 60, timezone: "UTC" });

      const call = (api.events.list as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const timeMin = new Date(call.timeMin);
      const timeMax = new Date(call.timeMax);
      const diffDays = (timeMax.getTime() - timeMin.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(60);
    });

    it("--from and --to set explicit search range", async () => {
      const api = makeMockApi([]);
      await runSearch(api, {
        query: "test",
        from: "2026-03-01",
        to: "2026-03-31",
        timezone: "UTC",
      });

      const call = (api.events.list as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.timeMin).toContain("2026-03-01");
      expect(call.timeMax).toContain("2026-03-31");
    });

    it("--from/--to use configured timezone, not system timezone", async () => {
      const api = makeMockApi([]);
      // User configured timezone is Asia/Tokyo (UTC+9)
      // If code incorrectly uses system TZ (e.g. UTC), the offset would be +00:00
      await runSearch(api, {
        query: "test",
        from: "2026-03-01",
        to: "2026-03-31",
        timezone: "Asia/Tokyo",
      });

      const call = (api.events.list as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      // timeMin should be 2026-03-01T00:00:00+09:00 (midnight in Asia/Tokyo)
      expect(call.timeMin).toBe("2026-03-01T00:00:00+09:00");
      // timeMax should be 2026-03-31T23:59:59+09:00 (end of day in Asia/Tokyo)
      expect(call.timeMax).toBe("2026-03-31T23:59:59+09:00");
    });
  });

  describe("multi-calendar", () => {
    it("fetches from all enabled calendars", async () => {
      const api = makeMockApi([]);
      await runSearch(api, {
        query: "test",
        calendars: [
          { id: "cal1", name: "Calendar 1", enabled: true },
          { id: "cal2", name: "Calendar 2", enabled: true },
        ],
      });

      expect(api.events.list).toHaveBeenCalledTimes(2);
      expect(api.events.list).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "cal1" }));
      expect(api.events.list).toHaveBeenCalledWith(expect.objectContaining({ calendarId: "cal2" }));
    });

    it("fetches calendars in parallel", async () => {
      const callOrder: string[] = [];
      const api = makeMockApi([]);
      // Override events.list to track concurrency
      (api.events.list as ReturnType<typeof vi.fn>).mockImplementation(
        (params: { calendarId: string }) => {
          callOrder.push(`start:${params.calendarId}`);
          return new Promise((resolve) => {
            setTimeout(() => {
              callOrder.push(`end:${params.calendarId}`);
              resolve({ data: { items: [] } });
            }, 10);
          });
        },
      );

      await runSearch(api, {
        query: "test",
        calendars: [
          { id: "cal1", name: "Calendar 1", enabled: true },
          { id: "cal2", name: "Calendar 2", enabled: true },
        ],
      });

      // With parallel fetching, both starts happen before any end
      expect(callOrder[0]).toBe("start:cal1");
      expect(callOrder[1]).toBe("start:cal2");
    });
  });

  describe("filtering", () => {
    it("filters by transparency and status", async () => {
      const events = [
        makeEvent({
          id: "e1",
          title: "Confirmed Meeting",
          transparency: "opaque",
          status: "confirmed",
        }),
        makeEvent({
          id: "e2",
          title: "Cancelled Meeting",
          transparency: "transparent",
          status: "confirmed",
        }),
        makeEvent({
          id: "e3",
          title: "Tentative Meeting",
          transparency: "opaque",
          status: "tentative",
        }),
      ];
      const api = makeMockApi(events);
      const result = await runSearch(api, { query: "meeting", busy: true });

      // busy filter: only opaque; default status filter: only confirmed
      const text = result.output.join("\n");
      expect(text).toContain("1 event");
      expect(text).toContain("Confirmed Meeting");
      expect(text).not.toContain("Cancelled Meeting");
      expect(text).not.toContain("Tentative Meeting");
    });
  });

  describe("text output", () => {
    it("shows match count and flat event list", async () => {
      const events = [
        makeEvent({ id: "e1", title: "Team Meeting" }),
        makeEvent({
          id: "e2",
          title: "Project Meeting",
          start: "2026-02-02T09:00:00+09:00",
          end: "2026-02-02T10:00:00+09:00",
        }),
      ];
      const api = makeMockApi(events);
      const result = await runSearch(api, { query: "meeting" });

      const text = result.output.join("\n");
      expect(text).toContain('Found 2 events matching "meeting":');
      expect(text).toContain("Team Meeting");
      expect(text).toContain("Project Meeting");
    });

    it("shows zero results message", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "nonexistent" });

      const text = result.output.join("\n");
      expect(text).toContain('Found 0 events matching "nonexistent".');
    });
  });

  describe("JSON output", () => {
    it("includes query field with events and count", async () => {
      const events = [makeEvent({ id: "e1", title: "Team Meeting" })];
      const api = makeMockApi(events);
      const result = await runSearch(api, { query: "meeting", format: "json" });

      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.query).toBe("meeting");
      expect(json.data.count).toBe(1);
      expect(json.data.events).toHaveLength(1);
      expect(json.data.events[0].title).toBe("Team Meeting");
    });
  });

  describe("exit code", () => {
    it("returns exit code 0 on success", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test" });
      expect(result.exitCode).toBe(0);
    });
  });

  describe("negative --days", () => {
    it("--days -30 searches past 30 days (30 days ago to now)", async () => {
      const api = makeMockApi([]);
      await runSearch(api, { query: "test", days: -30, timezone: "UTC" });

      const call = (api.events.list as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const timeMin = new Date(call.timeMin);
      const timeMax = new Date(call.timeMax);
      // timeMin should be 30 days before timeMax
      const diffDays = (timeMax.getTime() - timeMin.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(30);
      // timeMax should be close to now (timeMin is in the past)
      expect(timeMin.getTime()).toBeLessThan(timeMax.getTime());
    });
  });

  describe("stderr feedback", () => {
    it("outputs search range message with default 30 days", async () => {
      const api = makeMockApi([]);
      vi.useFakeTimers({ now: new Date("2026-02-24T12:00:00Z") });
      try {
        const result = await runSearch(api, { query: "test", timezone: "UTC" });
        const stderr = result.errOutput.join("\n");
        expect(stderr).toContain("Searching: 2026-02-24 to 2026-03-26");
      } finally {
        vi.useRealTimers();
      }
    });

    it("outputs search range message with --days 60", async () => {
      const api = makeMockApi([]);
      vi.useFakeTimers({ now: new Date("2026-02-24T12:00:00Z") });
      try {
        const result = await runSearch(api, { query: "test", days: 60, timezone: "UTC" });
        const stderr = result.errOutput.join("\n");
        expect(stderr).toContain("Searching: 2026-02-24 to 2026-04-25");
      } finally {
        vi.useRealTimers();
      }
    });

    it("outputs search range message with --days -30 (past direction)", async () => {
      const api = makeMockApi([]);
      vi.useFakeTimers({ now: new Date("2026-02-24T12:00:00Z") });
      try {
        const result = await runSearch(api, { query: "test", days: -30, timezone: "UTC" });
        const stderr = result.errOutput.join("\n");
        expect(stderr).toContain("Searching: 2026-01-25 to 2026-02-24");
      } finally {
        vi.useRealTimers();
      }
    });

    it("outputs search range message with --from/--to", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, {
        query: "test",
        from: "2026-03-01",
        to: "2026-03-31",
        timezone: "UTC",
      });
      const stderr = result.errOutput.join("\n");
      expect(stderr).toContain("Searching: 2026-03-01 to 2026-03-31");
    });

    it("outputs hint message when using default range", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test", timezone: "UTC" });
      const stderr = result.errOutput.join("\n");
      expect(stderr).toContain("Tip: Use --days <n> or --from/--to to change the search range.");
    });

    it("suppresses hint when --days is specified", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test", days: 60, timezone: "UTC" });
      const stderr = result.errOutput.join("\n");
      expect(stderr).not.toContain("Tip:");
    });

    it("suppresses hint when --from is specified", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test", from: "2026-03-01", timezone: "UTC" });
      const stderr = result.errOutput.join("\n");
      expect(stderr).not.toContain("Tip:");
    });

    it("suppresses hint when --to is specified", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test", to: "2026-03-31", timezone: "UTC" });
      const stderr = result.errOutput.join("\n");
      expect(stderr).not.toContain("Tip:");
    });

    it("suppresses hint when --from and --to are specified", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, {
        query: "test",
        from: "2026-03-01",
        to: "2026-03-31",
        timezone: "UTC",
      });
      const stderr = result.errOutput.join("\n");
      expect(stderr).not.toContain("Tip:");
    });

    it("suppresses hint when --days is negative", async () => {
      const api = makeMockApi([]);
      const result = await runSearch(api, { query: "test", days: -30, timezone: "UTC" });
      const stderr = result.errOutput.join("\n");
      expect(stderr).not.toContain("Tip:");
    });

    it("does not affect stdout output", async () => {
      const events = [makeEvent({ id: "e1", title: "Team Meeting" })];
      const api = makeMockApi(events);
      const result = await runSearch(api, { query: "meeting" });

      // stdout should contain events as before
      const stdout = result.output.join("\n");
      expect(stdout).toContain("Team Meeting");
      // stdout should NOT contain stderr messages
      expect(stdout).not.toContain("Searching:");
      expect(stdout).not.toContain("Tip:");
    });
  });

  describe("option conflicts", () => {
    function parseSearch(args: string[]): { error: string | null } {
      const cmd = createSearchCommand();
      // Prevent Commander from calling process.exit on error
      cmd.exitOverride();
      try {
        cmd.parse(["node", "search", ...args]);
        return { error: null };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    }

    it("rejects --to and --days together", () => {
      const result = parseSearch(["test", "--to", "2026-03-01", "--days", "60"]);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("cannot be used with");
    });

    it("rejects --days and --from together", () => {
      const result = parseSearch(["test", "--days", "60", "--from", "2026-03-01"]);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("cannot be used with");
    });

    it("rejects --days and --to together", () => {
      const result = parseSearch(["test", "--days", "60", "--to", "2026-03-31"]);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("cannot be used with");
    });

    it("allows --from and --to together", () => {
      const result = parseSearch(["test", "--from", "2026-03-01", "--to", "2026-03-31"]);
      expect(result.error).toBeNull();
    });

    it("allows --days alone", () => {
      const result = parseSearch(["test", "--days", "60"]);
      expect(result.error).toBeNull();
    });
  });
});
