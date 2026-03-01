import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CalendarEvent, AppConfig } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { resolveDateRange, handleList, createListCommand, type ListHandlerDeps } from "./list.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Test Event",
    description: null,
    start: "2026-02-23T10:00:00+09:00",
    end: "2026-02-23T11:00:00+09:00",
    all_day: false,
    calendar_id: "primary",
    calendar_name: "Main Calendar",
    html_link: "https://calendar.google.com/event/evt1",
    status: "confirmed",
    transparency: "opaque",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    default_format: "text",
    calendars: [
      { id: "primary", name: "Main Calendar", enabled: true },
      { id: "work@group.calendar.google.com", name: "Work", enabled: true },
    ],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ListHandlerDeps> = {}): ListHandlerDeps {
  return {
    listEvents: vi.fn().mockResolvedValue([]),
    loadConfig: vi.fn().mockReturnValue(makeConfig()),
    write: vi.fn(),
    writeErr: vi.fn(),
    now: () => new Date("2026-02-23T10:00:00+09:00"),
    ...overrides,
  };
}

describe("resolveDateRange", () => {
  const tz = "Asia/Tokyo";
  const now = () => new Date("2026-02-23T10:00:00+09:00");

  it("--today sets date range to current day in resolved timezone", () => {
    const { timeMin, timeMax } = resolveDateRange({ today: true }, tz, now);
    // Should be start and end of 2026-02-23 in Asia/Tokyo
    expect(timeMin).toBe("2026-02-23T00:00:00+09:00");
    expect(timeMax).toBe("2026-02-24T00:00:00+09:00");
  });

  it("--days <n> sets date range to next n days (default 7)", () => {
    const { timeMin, timeMax } = resolveDateRange({ days: 7 }, tz, now);
    expect(timeMin).toBe("2026-02-23T00:00:00+09:00");
    expect(timeMax).toBe("2026-03-02T00:00:00+09:00");
  });

  it("--days defaults to 7 when no options given", () => {
    const { timeMin, timeMax } = resolveDateRange({}, tz, now);
    expect(timeMin).toBe("2026-02-23T00:00:00+09:00");
    expect(timeMax).toBe("2026-03-02T00:00:00+09:00");
  });

  it("--from and --to set explicit date range", () => {
    const { timeMin, timeMax } = resolveDateRange(
      { from: "2026-03-01", to: "2026-03-15" },
      tz,
      now,
    );
    expect(timeMin).toBe("2026-03-01T00:00:00+09:00");
    expect(timeMax).toBe("2026-03-16T00:00:00+09:00");
  });

  it("--from without --to defaults to 7 days from --from", () => {
    const { timeMin, timeMax } = resolveDateRange({ from: "2026-03-01" }, tz, now);
    expect(timeMin).toBe("2026-03-01T00:00:00+09:00");
    expect(timeMax).toBe("2026-03-08T00:00:00+09:00");
  });

  it("resolves today's date in target timezone, not system timezone", () => {
    // System time is UTC 2026-02-23T22:00:00Z.
    // In Asia/Tokyo (+09:00), that's already 2026-02-24T07:00:00.
    // The bug: startOfDay(now()) would compute Feb 23 (system UTC date),
    // but today in Tokyo is Feb 24.
    const utcNow = () => new Date("2026-02-23T22:00:00Z");
    const { timeMin, timeMax } = resolveDateRange({ today: true }, "Asia/Tokyo", utcNow);
    expect(timeMin).toBe("2026-02-24T00:00:00+09:00");
    expect(timeMax).toBe("2026-02-25T00:00:00+09:00");
  });

  it("resolves default --days range in target timezone when system TZ differs", () => {
    // Same scenario: UTC 22:00 is next day in Tokyo
    const utcNow = () => new Date("2026-02-23T22:00:00Z");
    const { timeMin, timeMax } = resolveDateRange({}, "Asia/Tokyo", utcNow);
    expect(timeMin).toBe("2026-02-24T00:00:00+09:00");
    expect(timeMax).toBe("2026-03-03T00:00:00+09:00");
  });

  it("--to without --from defaults from to today and returns warning", () => {
    const result = resolveDateRange({ to: "2026-03-15" }, tz, now);
    expect(result.timeMin).toBe("2026-02-23T00:00:00+09:00");
    expect(result.timeMax).toBe("2026-03-16T00:00:00+09:00");
    expect(result.warning).toBe("--from not specified, defaulting to today");
  });

  it("--days 0 throws an error", () => {
    expect(() => resolveDateRange({ days: 0 }, tz, now)).toThrow(
      "--days must be a positive integer",
    );
  });

  it("--days -1 throws an error", () => {
    expect(() => resolveDateRange({ days: -1 }, tz, now)).toThrow(
      "--days must be a positive integer",
    );
  });
});

describe("handleList", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fetches events from all enabled calendars", async () => {
    const mockListEvents = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ listEvents: mockListEvents });

    await handleList({ today: true, format: "text", quiet: false }, deps);

    // Should be called for each enabled calendar
    expect(mockListEvents).toHaveBeenCalledTimes(2);
    expect(mockListEvents).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({ timeMin: expect.any(String), timeMax: expect.any(String) }),
    );
    expect(mockListEvents).toHaveBeenCalledWith(
      "work@group.calendar.google.com",
      "Work",
      expect.objectContaining({ timeMin: expect.any(String), timeMax: expect.any(String) }),
    );
  });

  it("-c flag overrides config calendars", async () => {
    const mockListEvents = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ listEvents: mockListEvents });

    await handleList(
      { today: true, format: "text", quiet: false, calendar: ["custom@group.calendar.google.com"] },
      deps,
    );

    expect(mockListEvents).toHaveBeenCalledTimes(1);
    expect(mockListEvents).toHaveBeenCalledWith(
      "custom@group.calendar.google.com",
      "custom",
      expect.any(Object),
    );
  });

  it("filters events by transparency (--busy)", async () => {
    const events = [
      makeEvent({ id: "e1", transparency: "opaque" }),
      makeEvent({ id: "e2", transparency: "transparent" }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false, busy: true }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].id).toBe("e1");
  });

  it("filters events by transparency (--free)", async () => {
    const events = [
      makeEvent({ id: "e1", transparency: "opaque" }),
      makeEvent({ id: "e2", transparency: "transparent" }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false, free: true }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].id).toBe("e2");
  });

  it("filters events by status (--confirmed)", async () => {
    const events = [
      makeEvent({ id: "e1", status: "confirmed" }),
      makeEvent({ id: "e2", status: "tentative" }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false, confirmed: true }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].id).toBe("e1");
  });

  it("filters events by status (--include-tentative)", async () => {
    const events = [
      makeEvent({ id: "e1", status: "confirmed" }),
      makeEvent({ id: "e2", status: "tentative" }),
      makeEvent({ id: "e3", status: "cancelled" }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false, includeTentative: true }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toHaveLength(2);
    expect(json.data.events.map((e: CalendarEvent) => e.id)).toEqual(["e1", "e2"]);
  });

  it("text output groups events by date with day-of-week header", async () => {
    const events = [
      makeEvent({
        start: "2026-02-23T10:00:00+09:00",
        end: "2026-02-23T11:00:00+09:00",
        title: "Morning",
      }),
      makeEvent({
        start: "2026-02-24T14:00:00+09:00",
        end: "2026-02-24T15:00:00+09:00",
        title: "Afternoon",
      }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: false, days: 7, format: "text", quiet: false }, deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("2026-02-23 (Mon)");
    expect(output).toContain("2026-02-24 (Tue)");
    expect(output).toContain("Morning");
    expect(output).toContain("Afternoon");
  });

  it("JSON output returns events array with count in envelope", async () => {
    const events = [makeEvent({ id: "e1" }), makeEvent({ id: "e2" })];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json).toEqual({
      success: true,
      data: {
        events: expect.any(Array),
        count: 2,
      },
    });
    expect(json.data.events).toHaveLength(2);
  });

  it("--quiet flag outputs date prefix with minimal event info (text)", async () => {
    const events = [
      makeEvent({
        start: "2026-02-23T10:00:00+09:00",
        end: "2026-02-23T11:00:00+09:00",
        title: "Meeting",
        description: "Long description",
      }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "text", quiet: true }, deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // Quiet mode should include date prefix, time and title but not calendar name or tags
    expect(output).toContain("02/23 10:00-11:00");
    expect(output).toContain("Meeting");
    expect(output).not.toContain("Main");
    expect(output).not.toContain("[busy]");
  });

  it("--quiet flag includes date prefix for multi-day and all-day events", async () => {
    const events = [
      makeEvent({
        start: "2026-02-23T09:00:00+09:00",
        end: "2026-02-23T10:00:00+09:00",
        title: "Team Standup",
      }),
      makeEvent({
        start: "2026-02-23T14:00:00+09:00",
        end: "2026-02-23T15:30:00+09:00",
        title: "Design Review",
      }),
      makeEvent({
        start: "2026-02-24T10:00:00+09:00",
        end: "2026-02-24T11:00:00+09:00",
        title: "1on1 with Manager",
      }),
      makeEvent({
        id: "allday1",
        start: "2026-02-24",
        end: "2026-02-25",
        all_day: true,
        title: "Company Holiday",
      }),
    ];
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue(events) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ days: 2, format: "text", quiet: true }, deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const lines = output.split("\n");
    expect(lines[0]).toBe("02/23 09:00-10:00  Team Standup");
    expect(lines[1]).toBe("02/23 14:00-15:30  Design Review");
    expect(lines[2]).toBe("02/24 All day      Company Holiday");
    expect(lines[3]).toBe("02/24 10:00-11:00  1on1 with Manager");
  });

  it("--timezone flag overrides event display timezone", async () => {
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue([]) });

    await handleList(
      { today: true, format: "text", quiet: false, timezone: "America/New_York" },
      deps,
    );

    // The date range should be calculated in the overridden timezone
    const calls = (deps.listEvents as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // timeMin should reflect America/New_York offset (-05:00)
    const timeMin = calls[0]![2].timeMin;
    expect(timeMin).toContain("-05:00");
  });

  it("outputs empty message when no events found (text)", async () => {
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue([]) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "text", quiet: false }, deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("No events found");
  });

  it("outputs empty JSON when no events found", async () => {
    const deps = makeDeps({ listEvents: vi.fn().mockResolvedValue([]) });
    const config = makeConfig({ calendars: [{ id: "primary", name: "Main", enabled: true }] });
    deps.loadConfig = vi.fn().mockReturnValue(config);

    await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toEqual([]);
    expect(json.data.count).toBe(0);
  });

  it("sorts events by start time across calendars", async () => {
    const deps = makeDeps({
      listEvents: vi
        .fn()
        .mockResolvedValueOnce([
          makeEvent({
            id: "e2",
            start: "2026-02-23T14:00:00+09:00",
            end: "2026-02-23T15:00:00+09:00",
            calendar_name: "Cal A",
          }),
        ])
        .mockResolvedValueOnce([
          makeEvent({
            id: "e1",
            start: "2026-02-23T10:00:00+09:00",
            end: "2026-02-23T11:00:00+09:00",
            calendar_name: "Cal B",
          }),
        ]),
    });

    await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events[0].id).toBe("e1");
    expect(json.data.events[1].id).toBe("e2");
  });

  it("fetches calendars in parallel", async () => {
    const callOrder: string[] = [];
    const mockListEvents = vi.fn().mockImplementation(async (calendarId: string) => {
      callOrder.push(`start:${calendarId}`);
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));
      callOrder.push(`end:${calendarId}`);
      return [];
    });
    const deps = makeDeps({ listEvents: mockListEvents });

    await handleList({ today: true, format: "text", quiet: false }, deps);

    // Both fetches should be started before either finishes (parallel)
    expect(callOrder[0]).toBe("start:primary");
    expect(callOrder[1]).toBe("start:work@group.calendar.google.com");
  });

  it("returns partial results when one calendar fails", async () => {
    const events = [makeEvent({ id: "e1", calendar_name: "Main Calendar" })];
    const mockListEvents = vi
      .fn()
      .mockResolvedValueOnce(events)
      .mockRejectedValueOnce(new Error("API error"));
    const writeErr = vi.fn();
    const deps = makeDeps({ listEvents: mockListEvents, writeErr });

    const result = await handleList({ today: true, format: "json", quiet: false }, deps);

    const json = JSON.parse((deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(json.data.events).toHaveLength(1);
    expect(json.data.events[0].id).toBe("e1");
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining("Work"));
  });

  it("--to without --from emits warning to stderr", async () => {
    const writeErr = vi.fn();
    const deps = makeDeps({ writeErr });

    await handleList({ to: "2026-03-15", format: "text", quiet: false }, deps);

    expect(writeErr).toHaveBeenCalledWith(
      expect.stringContaining("--from not specified, defaulting to today"),
    );
  });

  it("returns exitCode SUCCESS", async () => {
    const deps = makeDeps();

    const result = await handleList({ today: true, format: "text", quiet: false }, deps);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });
});

describe("createListCommand", () => {
  it("creates a commander command named 'list'", () => {
    const cmd = createListCommand();
    expect(cmd.name()).toBe("list");
  });

  it("has --today option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--today");
    expect(opt).toBeDefined();
  });

  it("has --days option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--days");
    expect(opt).toBeDefined();
  });

  it("has --from option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--from");
    expect(opt).toBeDefined();
  });

  it("has --to option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--to");
    expect(opt).toBeDefined();
  });

  it("has --busy option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--busy");
    expect(opt).toBeDefined();
  });

  it("has --free option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--free");
    expect(opt).toBeDefined();
  });

  it("has --confirmed option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--confirmed");
    expect(opt).toBeDefined();
  });

  it("has --include-tentative option", () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === "--include-tentative");
    expect(opt).toBeDefined();
  });

  it("--today conflicts with --days and --from", () => {
    const cmd = createListCommand();
    const todayOpt = cmd.options.find((o) => o.long === "--today") as any;
    expect(todayOpt).toBeDefined();
    expect(todayOpt.conflictsWith).toContain("days");
    expect(todayOpt.conflictsWith).toContain("from");
  });

  it("--days conflicts with --today and --from", () => {
    const cmd = createListCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as any;
    expect(daysOpt).toBeDefined();
    expect(daysOpt.conflictsWith).toContain("today");
    expect(daysOpt.conflictsWith).toContain("from");
  });

  it("--from conflicts with --today and --days", () => {
    const cmd = createListCommand();
    const fromOpt = cmd.options.find((o) => o.long === "--from") as any;
    expect(fromOpt).toBeDefined();
    expect(fromOpt.conflictsWith).toContain("today");
    expect(fromOpt.conflictsWith).toContain("days");
  });

  it("--busy conflicts with --free", () => {
    const cmd = createListCommand();
    const busyOpt = cmd.options.find((o) => o.long === "--busy") as any;
    expect(busyOpt).toBeDefined();
    expect(busyOpt.conflictsWith).toContain("free");
  });

  it("--free conflicts with --busy", () => {
    const cmd = createListCommand();
    const freeOpt = cmd.options.find((o) => o.long === "--free") as any;
    expect(freeOpt).toBeDefined();
    expect(freeOpt.conflictsWith).toContain("busy");
  });

  it("--days conflicts with --to", () => {
    const cmd = createListCommand();
    const daysOpt = cmd.options.find((o) => o.long === "--days") as any;
    expect(daysOpt).toBeDefined();
    expect(daysOpt.conflictsWith).toContain("to");
  });

  it("--to conflicts with --days", () => {
    const cmd = createListCommand();
    const toOpt = cmd.options.find((o) => o.long === "--to") as any;
    expect(toOpt).toBeDefined();
    expect(toOpt.conflictsWith).toContain("days");
  });
});
