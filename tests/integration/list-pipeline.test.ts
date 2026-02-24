import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleList, type ListHandlerDeps } from "../../src/commands/list.ts";
import { listEvents } from "../../src/lib/api.ts";
import { loadConfig } from "../../src/lib/config.ts";
import {
  createMockApi,
  createMockFs,
  makeGoogleEvent,
  makeAllDayGoogleEvent,
  SAMPLE_CONFIG_TOML,
  SINGLE_CALENDAR_CONFIG_TOML,
  captureWrite,
} from "./helpers.ts";

describe("list command pipeline: config → API → filter → output", () => {
  const NOW = () => new Date("2026-02-23T10:00:00+09:00");

  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads config, selects enabled calendars, calls API, and formats JSON output", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "e1", summary: "Morning Standup" })],
        "work@group.calendar.google.com": [
          makeGoogleEvent({
            id: "e2",
            summary: "Design Review",
            start: { dateTime: "2026-02-23T14:00:00+09:00" },
            end: { dateTime: "2026-02-23T15:00:00+09:00" },
          }),
        ],
      },
    });
    const mockFs = createMockFs(SAMPLE_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    const result = await handleList({ today: true, format: "json", quiet: false }, deps);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(out.output());
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(2);
    expect(json.data.events[0].title).toBe("Morning Standup");
    expect(json.data.events[1].title).toBe("Design Review");
  });

  it("skips disabled calendars from config", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "e1" })],
        "work@group.calendar.google.com": [makeGoogleEvent({ id: "e2" })],
        "hobby@group.calendar.google.com": [makeGoogleEvent({ id: "e3" })],
      },
    });
    const mockFs = createMockFs(SAMPLE_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "json", quiet: false }, deps);

    // API should only be called for primary and work (enabled), not hobby (disabled)
    const listFn = mockApi.events.list as ReturnType<typeof vi.fn>;
    const calendarIds = listFn.mock.calls.map(
      (c: unknown[]) => (c[0] as { calendarId: string }).calendarId,
    );
    expect(calendarIds).toContain("primary");
    expect(calendarIds).toContain("work@group.calendar.google.com");
    expect(calendarIds).not.toContain("hobby@group.calendar.google.com");
  });

  it("calendar override (-c) overrides config calendars in API calls", async () => {
    const mockApi = createMockApi({
      events: {
        "custom@group.calendar.google.com": [
          makeGoogleEvent({ id: "e1", summary: "Custom Event" }),
        ],
      },
    });
    const mockFs = createMockFs(SAMPLE_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList(
      { today: true, format: "json", quiet: false, calendar: ["custom@group.calendar.google.com"] },
      deps,
    );

    const listFn = mockApi.events.list as ReturnType<typeof vi.fn>;
    expect(listFn).toHaveBeenCalledTimes(1);
    const calendarId = listFn.mock.calls[0]![0].calendarId;
    expect(calendarId).toBe("custom@group.calendar.google.com");

    const json = JSON.parse(out.output());
    expect(json.data.events[0].title).toBe("Custom Event");
  });

  it("timezone override (--tz) flows through to API date range parameters", async () => {
    const mockApi = createMockApi({
      events: { primary: [] },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList(
      { today: true, format: "json", quiet: false, timezone: "America/New_York" },
      deps,
    );

    const listFn = mockApi.events.list as ReturnType<typeof vi.fn>;
    const params = listFn.mock.calls[0]![0];
    // timeMin should use America/New_York offset (-05:00)
    expect(params.timeMin).toContain("-05:00");
    expect(params.timeMax).toContain("-05:00");
  });

  it("applies --busy filter through the full pipeline", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({ id: "busy-1", summary: "Busy Event", transparency: "opaque" }),
          makeGoogleEvent({ id: "free-1", summary: "Free Event", transparency: "transparent" }),
        ],
      },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "json", quiet: false, busy: true }, deps);

    const json = JSON.parse(out.output());
    expect(json.data.count).toBe(1);
    expect(json.data.events[0].id).toBe("busy-1");
  });

  it("handles mixed timed and all-day events, sorts and groups correctly in text output", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeAllDayGoogleEvent({ id: "allday-1", summary: "Company Holiday" }),
          makeGoogleEvent({
            id: "timed-1",
            summary: "Team Meeting",
            start: { dateTime: "2026-02-23T10:00:00+09:00" },
            end: { dateTime: "2026-02-23T11:00:00+09:00" },
          }),
        ],
      },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "text", quiet: false }, deps);

    const output = out.output();
    expect(output).toContain("2026-02-23 (Mon)");
    expect(output).toContain("Company Holiday");
    expect(output).toContain("Team Meeting");
    expect(output).toContain("Main Calendar");
  });

  it("merges events from multiple calendars and sorts by start time", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({
            id: "e2",
            summary: "Later Event",
            start: { dateTime: "2026-02-23T14:00:00+09:00" },
            end: { dateTime: "2026-02-23T15:00:00+09:00" },
          }),
        ],
        "work@group.calendar.google.com": [
          makeGoogleEvent({
            id: "e1",
            summary: "Earlier Event",
            start: { dateTime: "2026-02-23T09:00:00+09:00" },
            end: { dateTime: "2026-02-23T10:00:00+09:00" },
          }),
        ],
      },
    });
    const mockFs = createMockFs(SAMPLE_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse(out.output());
    expect(json.data.events[0].title).toBe("Earlier Event");
    expect(json.data.events[1].title).toBe("Later Event");
  });

  it("excludes cancelled and tentative events by default", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({ id: "e1", summary: "Confirmed", status: "confirmed" }),
          makeGoogleEvent({ id: "e2", summary: "Tentative", status: "tentative" }),
          makeGoogleEvent({ id: "e3", summary: "Cancelled", status: "cancelled" }),
        ],
      },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse(out.output());
    expect(json.data.count).toBe(1);
    expect(json.data.events[0].title).toBe("Confirmed");
  });

  it("includes tentative events when --include-tentative is set", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({ id: "e1", status: "confirmed" }),
          makeGoogleEvent({ id: "e2", status: "tentative" }),
          makeGoogleEvent({ id: "e3", status: "cancelled" }),
        ],
      },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: NOW,
    };

    await handleList({ today: true, format: "json", quiet: false, includeTentative: true }, deps);

    const json = JSON.parse(out.output());
    expect(json.data.count).toBe(2);
  });
});
