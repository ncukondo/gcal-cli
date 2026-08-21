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
    attendees: [],
    meet_link: null,
    conference: null,
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
    task_lists: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AddHandlerDeps> = {}): AddHandlerDeps {
  return {
    createEvent: vi.fn().mockResolvedValue(makeEvent()),
    loadConfig: vi.fn().mockReturnValue(makeConfig()),
    write: vi.fn(),
    writeStderr: vi.fn(),
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

  it("--quiet outputs only event ID (text)", async () => {
    const event = makeEvent({ id: "new-evt-1" });
    const deps = makeDeps({ createEvent: vi.fn().mockResolvedValue(event) });

    await handleAdd(baseOptions({ quiet: true }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toBe("new-evt-1");
  });

  it("--quiet does not affect JSON output", async () => {
    const event = makeEvent({ title: "Team Meeting" });
    const deps = makeDeps({ createEvent: vi.fn().mockResolvedValue(event) });

    await handleAdd(baseOptions({ title: "Team Meeting", format: "json", quiet: true }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const json = JSON.parse(output);
    expect(json.success).toBe(true);
    expect(json.data.event).toBeDefined();
    expect(json.data.message).toBe("Event created");
  });

  it("--quiet with --dry-run still shows dry-run output", async () => {
    const deps = makeDeps();

    await handleAdd(baseOptions({ quiet: true, dryRun: true }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("DRY RUN");
  });

  it("propagates API errors from deps.createEvent", async () => {
    const deps = makeDeps({
      createEvent: vi.fn().mockRejectedValue(new Error("API failure")),
    });

    await expect(handleAdd(baseOptions(), deps)).rejects.toThrow("API failure");
  });
});

describe("handleAdd attendees and notifications", () => {
  it("passes attendees to createEvent", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ attendee: ["alice@example.com", "bob@example.com"] }), deps);

    expect(mockCreate).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({
        attendees: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
      }),
    );
  });

  it("de-duplicates repeated attendees", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ attendee: ["alice@example.com", "ALICE@example.com"] }), deps);

    expect(mockCreate).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({ attendees: [{ email: "alice@example.com" }] }),
    );
  });

  it("omits attendees when none are given", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions(), deps);

    expect(mockCreate.mock.calls[0]?.[2]).not.toHaveProperty("attendees");
  });

  it("defaults sendUpdates to none", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ attendee: ["alice@example.com"] }), deps);

    expect(mockCreate).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({ sendUpdates: "none" }),
    );
  });

  it("maps --notify all to sendUpdates all", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ attendee: ["alice@example.com"], notify: "all" }), deps);

    expect(mockCreate).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({ sendUpdates: "all" }),
    );
  });

  it("maps --notify external to sendUpdates externalOnly", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(baseOptions({ notify: "external" }), deps);

    expect(mockCreate).toHaveBeenCalledWith(
      "primary",
      "Main Calendar",
      expect.objectContaining({ sendUpdates: "externalOnly" }),
    );
  });

  it("rejects an invalid attendee address", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ attendee: ["not-an-email"] }), deps);

    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    expect(deps.createEvent).not.toHaveBeenCalled();
    const written = vi.mocked(deps.write).mock.calls.flat().join("\n");
    expect(written).toContain("INVALID_ARGS");
  });

  it("rejects an invalid --notify value", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ notify: "everyone" }), deps);

    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    expect(deps.createEvent).not.toHaveBeenCalled();
  });

  it("includes attendees and notify in the dry-run preview", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ attendee: ["alice@example.com"], notify: "all", dryRun: true, format: "json" }),
      deps,
    );

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(deps.createEvent).not.toHaveBeenCalled();
    const json = JSON.parse(vi.mocked(deps.write).mock.calls.flat().join(""));
    expect(json.data.event.attendees).toEqual(["alice@example.com"]);
    expect(json.data.event.notify).toBe("all");
  });

  it("omits attendees from the dry-run preview when none are given", async () => {
    const deps = makeDeps();
    await handleAdd(baseOptions({ dryRun: true, format: "json" }), deps);

    const json = JSON.parse(vi.mocked(deps.write).mock.calls.flat().join(""));
    expect(json.data.event).not.toHaveProperty("attendees");
    expect(json.data.event).not.toHaveProperty("notify");
  });
});

describe("handleAdd with --meet", () => {
  it("asks the API for a conference", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ meet: true }), deps);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const input = (deps.createEvent as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(input.meet).toBe(true);
  });

  it("does not mention meet when the flag is absent", async () => {
    const deps = makeDeps();
    await handleAdd(baseOptions(), deps);

    const input = (deps.createEvent as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(input).not.toHaveProperty("meet");
  });

  it("allows --meet on an all-day event", async () => {
    // Both the API and the Google Calendar web UI permit this, so the CLI does
    // not invent a restriction of its own.
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ start: "2026-03-01", meet: true }), deps);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const input = (deps.createEvent as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(input.meet).toBe(true);
    expect(input.allDay).toBe(true);
  });

  it("shows meet in the text dry-run preview without calling the API", async () => {
    const deps = makeDeps();
    const result = await handleAdd(baseOptions({ meet: true, dryRun: true }), deps);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(deps.createEvent).not.toHaveBeenCalled();
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("meet: true");
  });

  it("shows meet in the json dry-run preview", async () => {
    const deps = makeDeps();
    await handleAdd(baseOptions({ meet: true, dryRun: true, format: "json" }), deps);

    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(JSON.parse(output).data.event.meet).toBe(true);
  });

  it("notes on stderr when the conference is not ready yet", async () => {
    const writeStderr = vi.fn();
    const deps = makeDeps({
      createEvent: vi.fn().mockResolvedValue(makeEvent({ id: "evt-pending", meet_link: null })),
      writeStderr,
    });

    await handleAdd(baseOptions({ meet: true }), deps);

    expect(writeStderr).toHaveBeenCalledTimes(1);
    expect(writeStderr.mock.calls[0]![0]).toContain("gcal show evt-pending");
  });

  it("stays quiet when the conference link came back", async () => {
    const writeStderr = vi.fn();
    const deps = makeDeps({
      createEvent: vi
        .fn()
        .mockResolvedValue(makeEvent({ meet_link: "https://meet.google.com/abc-defg-hij" })),
      writeStderr,
    });

    await handleAdd(baseOptions({ meet: true }), deps);

    expect(writeStderr).not.toHaveBeenCalled();
  });

  it("warns when the calendar attached something other than Meet", async () => {
    const writeStderr = vi.fn();
    const deps = makeDeps({
      createEvent: vi.fn().mockResolvedValue(
        makeEvent({
          meet_link: null,
          conference: { type: "addOn", uri: "https://example.zoom.us/j/123" },
        }),
      ),
      writeStderr,
    });

    await handleAdd(baseOptions({ meet: true }), deps);

    expect(writeStderr).toHaveBeenCalledTimes(1);
    const note = writeStderr.mock.calls[0]![0];
    expect(note).toContain("addOn");
    expect(note).toContain("https://example.zoom.us/j/123");
    // The conference exists, so this is not the "still being generated" case.
    expect(note).not.toContain("still being generated");
  });

  it("suppresses the pending note in quiet mode", async () => {
    const writeStderr = vi.fn();
    const deps = makeDeps({
      createEvent: vi.fn().mockResolvedValue(makeEvent({ meet_link: null })),
      writeStderr,
    });

    await handleAdd(baseOptions({ meet: true, quiet: true }), deps);

    expect(writeStderr).not.toHaveBeenCalled();
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

  it("has -c, --calendar single option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--calendar");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-c");
  });

  it("-c accepts a single value (not repeatable)", () => {
    const cmd = createAddCommand();
    cmd.parse(["node", "add", "-t", "Test", "-s", "2026-03-01", "-c", "mycal"]);
    const opts = cmd.opts();
    expect(opts.calendar).toBe("mycal");
  });

  it("-a, --attendee is repeatable and defaults to an empty array", () => {
    const cmd = createAddCommand();
    cmd.parse(["node", "add", "-t", "Test", "-s", "2026-03-01"]);
    expect(cmd.opts().attendee).toEqual([]);

    const cmd2 = createAddCommand();
    cmd2.parse([
      "node",
      "add",
      "-t",
      "Test",
      "-s",
      "2026-03-01",
      "-a",
      "alice@example.com",
      "--attendee",
      "bob@example.com",
    ]);
    expect(cmd2.opts().attendee).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("accepts a --notify option", () => {
    const cmd = createAddCommand();
    cmd.parse(["node", "add", "-t", "Test", "-s", "2026-03-01", "--notify", "all"]);
    expect(cmd.opts().notify).toBe("all");
  });

  it("--meet is a boolean flag that defaults to undefined", () => {
    const cmd = createAddCommand();
    cmd.parse(["node", "add", "-t", "Test", "-s", "2026-03-01T10:00"]);
    expect(cmd.opts().meet).toBeUndefined();
  });

  it("--meet sets the flag", () => {
    const cmd = createAddCommand();
    cmd.parse(["node", "add", "-t", "Test", "-s", "2026-03-01T10:00", "--meet"]);
    expect(cmd.opts().meet).toBe(true);
  });
});
