import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent, AppConfig } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { handleAdd, createAddCommand, type AddHandlerDeps, type AddOptions } from "./add.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "new-evt-1",
    title: "Test Event",
    description: null,
    start: "2026-02-24T10:00:00+09:00",
    end: "2026-02-24T11:00:00+09:00",
    all_day: false,
    calendar_id: "primary",
    calendar_name: "Main Calendar",
    html_link: "https://calendar.google.com/event/new-evt-1",
    status: "confirmed",
    transparency: "opaque",
    created: "2026-02-24T00:00:00Z",
    updated: "2026-02-24T00:00:00Z",
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

function makeDeps(overrides: Partial<AddHandlerDeps> = {}): AddHandlerDeps {
  return {
    createEvent: vi.fn().mockResolvedValue(makeEvent()),
    loadConfig: vi.fn().mockReturnValue(makeConfig()),
    write: vi.fn(),
    ...overrides,
  };
}

function baseOptions(overrides: Partial<AddOptions> = {}): AddOptions {
  return {
    title: "Test Event",
    start: "2026-02-24T10:00",
    format: "text",
    ...overrides,
  };
}

describe("handleAdd", () => {
  it("validates --title is required", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ title: undefined as unknown as string }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("validates --start is required", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ start: undefined as unknown as string }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("missing required option returns INVALID_ARGS error with exit code 3", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ title: "" }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  // --- Auto-detection of allDay from start format ---

  it("auto-detects all-day event when --start is date-only (YYYY-MM-DD)", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-02" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.allDay).toBe(true);
    expect(input.start).toBe("2026-03-01");
  });

  it("auto-detects timed event when --start is datetime", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01T10:00", timezone: "Asia/Tokyo" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.allDay).toBe(false);
  });

  // --- End defaults ---

  it("defaults end to same day for all-day event (end omitted)", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-02" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    // All-day end is exclusive in API: same day → +1 day
    expect(input.end).toBe("2026-03-02");
  });

  it("defaults end to start + 1h for timed event (end omitted)", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01T10:00", timezone: "Asia/Tokyo" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.start).toContain("10:00");
    expect(input.end).toContain("11:00");
  });

  // --- TZ safety for all-day events ---

  it("all-day date calculations are TZ-safe (uses UTC internally, no local TZ dependency)", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-02" }));
    const deps = makeDeps({ createEvent: mockCreate });

    // This test verifies the fix for the bug where new Date(date + "T00:00:00")
    // interpreted dates in local TZ but .toISOString() extracted UTC date,
    // causing off-by-one errors in UTC+ timezones (e.g. Asia/Tokyo).
    await handleAdd(baseOptions({ start: "2026-03-01" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.start).toBe("2026-03-01");
    expect(input.end).toBe("2026-03-02");
  });

  it("inclusive end conversion is TZ-safe for all-day events", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-04" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01", end: "2026-03-03" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    // Inclusive "2026-03-03" → exclusive "2026-03-04"
    expect(input.end).toBe("2026-03-04");
  });

  it("duration calculation is TZ-safe for all-day events", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-03" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01", duration: "2d" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.end).toBe("2026-03-03");
  });

  // --- Inclusive end for all-day events ---

  it("converts inclusive --end to exclusive for all-day events (+1 day)", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-04" }));
    const deps = makeDeps({ createEvent: mockCreate });

    // User says end "2026-03-03" (inclusive, last day)
    await handleAdd(baseOptions({ start: "2026-03-01", end: "2026-03-03" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    // API gets exclusive end: 2026-03-04
    expect(input.end).toBe("2026-03-04");
  });

  // --- Duration support ---

  it("computes end from --duration for timed event", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ start: "2026-03-01T10:00", duration: "30m", timezone: "Asia/Tokyo" }),
      deps,
    );

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.start).toContain("10:00");
    expect(input.end).toContain("10:30");
  });

  it("computes end from --duration for all-day event", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-03" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ start: "2026-03-01", duration: "2d" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    // 2d from 03-01 → end is 03-03 (exclusive for API)
    expect(input.end).toBe("2026-03-03");
  });

  // --- Validation ---

  it("rejects --end and --duration together", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ start: "2026-03-01T10:00", end: "2026-03-01T11:00", duration: "30m" }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("rejects start/end type mismatch (date start, datetime end)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ start: "2026-03-01", end: "2026-03-01T11:00" }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("rejects start/end type mismatch (datetime start, date end)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ start: "2026-03-01T10:00", end: "2026-03-01" }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("rejects sub-day duration for all-day events (e.g. 2h)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ start: "2026-03-01", duration: "2h" }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
    expect(output).toContain("day-unit duration");
  });

  it("rejects mixed day+hour duration for all-day events (e.g. 1d2h)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ start: "2026-03-01", duration: "1d2h" }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("returns INVALID_ARGS for invalid duration string (timed event)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ start: "2026-03-01T10:00", duration: "abc" }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("returns INVALID_ARGS for invalid duration string (all-day event)", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ start: "2026-03-01", duration: "xyz" }), deps);
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("allows day-unit duration for all-day events (e.g. 3d)", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(makeEvent({ all_day: true, start: "2026-03-01", end: "2026-03-04" }));
    const deps = makeDeps({ createEvent: mockCreate });

    const result = await handleAdd(baseOptions({ start: "2026-03-01", duration: "3d" }), deps);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.end).toBe("2026-03-04");
  });

  // --- Existing behavior preserved ---

  it("creates timed event with correct datetime in resolved timezone", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ start: "2026-02-24T10:00", end: "2026-02-24T11:00", timezone: "Asia/Tokyo" }),
      deps,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [_calendarId, _calendarName, input] = mockCreate.mock.calls[0]!;
    expect(input.allDay).toBe(false);
    expect(input.timeZone).toBe("Asia/Tokyo");
    expect(input.start).toContain("+09:00");
    expect(input.end).toContain("+09:00");
  });

  it("creates event on first enabled calendar when no -c specified", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions(), deps);

    const [calendarId, calendarName] = mockCreate.mock.calls[0]!;
    expect(calendarId).toBe("primary");
    expect(calendarName).toBe("Main Calendar");
  });

  it("-c flag targets specified calendar", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(
        makeEvent({ calendar_id: "work@group.calendar.google.com", calendar_name: "Work" }),
      );
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ calendar: "work@group.calendar.google.com" }), deps);

    const [calendarId] = mockCreate.mock.calls[0]!;
    expect(calendarId).toBe("work@group.calendar.google.com");
  });

  it("--free flag sets transparency to transparent", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent({ transparency: "transparent" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ free: true }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.transparency).toBe("transparent");
  });

  it("default transparency is opaque (busy)", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions(), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.transparency).toBe("opaque");
  });

  it("--description sets event description", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent({ description: "My description" }));
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ description: "My description" }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.description).toBe("My description");
  });

  it("text output shows confirmation message with event details", async () => {
    const event = makeEvent({
      title: "Team Meeting",
      start: "2026-02-24T10:00:00+09:00",
      end: "2026-02-24T11:00:00+09:00",
    });
    const deps = makeDeps({ createEvent: vi.fn().mockResolvedValue(event) });

    await handleAdd(baseOptions({ title: "Team Meeting" }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("Event created");
    expect(output).toContain("Team Meeting");
  });

  it("JSON output returns { event, message: 'Event created' }", async () => {
    const event = makeEvent({ title: "Team Meeting" });
    const deps = makeDeps({ createEvent: vi.fn().mockResolvedValue(event) });

    await handleAdd(baseOptions({ title: "Team Meeting", format: "json" }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const json = JSON.parse(output);
    expect(json).toEqual({
      success: true,
      data: {
        event: expect.objectContaining({ title: "Team Meeting" }),
        message: "Event created",
      },
    });
  });

  it("returns exitCode SUCCESS on success", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions(), deps);
    expect(result.exitCode).toBe(ExitCode.SUCCESS);
  });

  it("--busy explicitly sets transparency to opaque", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ busy: true }), deps);

    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.transparency).toBe("opaque");
  });

  it("propagates API errors from deps.createEvent", async () => {
    const deps = makeDeps({
      createEvent: vi.fn().mockRejectedValue(new Error("API failure")),
    });

    await expect(handleAdd(baseOptions(), deps)).rejects.toThrow("API failure");
  });
});

describe("createAddCommand", () => {
  it("creates a commander command named 'add'", () => {
    const cmd = createAddCommand();
    expect(cmd.name()).toBe("add");
  });

  it("has --title, -t as required option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--title");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-t");
    expect(opt!.required).toBe(true);
  });

  it("has --start, -s as required option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--start");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-s");
    expect(opt!.required).toBe(true);
  });

  it("has --end, -e option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--end");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-e");
  });

  it("does NOT have --all-day option (removed)", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--all-day");
    expect(opt).toBeUndefined();
  });

  it("has --duration option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--duration");
    expect(opt).toBeDefined();
  });

  it("--end conflicts with --duration", () => {
    const cmd = createAddCommand();
    const endOpt = cmd.options.find((o) => o.long === "--end") as any;
    expect(endOpt.conflictsWith).toContain("duration");
  });

  it("--duration conflicts with --end", () => {
    const cmd = createAddCommand();
    const durationOpt = cmd.options.find((o) => o.long === "--duration") as any;
    expect(durationOpt.conflictsWith).toContain("end");
  });

  it("has --description, -d option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--description");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-d");
  });

  it("has --busy option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--busy");
    expect(opt).toBeDefined();
  });

  it("has --free option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--free");
    expect(opt).toBeDefined();
  });

  it("--busy conflicts with --free", () => {
    const cmd = createAddCommand();
    const busyOpt = cmd.options.find((o) => o.long === "--busy") as any;
    expect(busyOpt.conflictsWith).toContain("free");
  });

  it("--free conflicts with --busy", () => {
    const cmd = createAddCommand();
    const freeOpt = cmd.options.find((o) => o.long === "--free") as any;
    expect(freeOpt.conflictsWith).toContain("busy");
  });

  it("has afterHelp with examples", () => {
    const cmd = createAddCommand();
    // addHelpText("after") is not included in helpInformation(),
    // but we can capture it by writing help to a string
    let helpOutput = "";
    cmd.configureOutput({ writeOut: (str) => (helpOutput += str) });
    cmd.outputHelp();
    expect(helpOutput).toContain("Examples:");
  });
});
