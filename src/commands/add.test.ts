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
    end: "2026-02-24T11:00",
    format: "text",
    ...overrides,
  };
}

describe("handleAdd", () => {
  it("validates --title is required", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ title: undefined as unknown as string }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("validates --start is required", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ start: undefined as unknown as string }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("validates --end is required", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ end: undefined as unknown as string }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("missing required option returns INVALID_ARGS error with exit code 3", async () => {
    const deps = makeDeps();
    const result = await handleAdd(
      baseOptions({ title: "" }),
      deps,
    );
    expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    const output = (deps.write as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(output).toContain("INVALID_ARGS");
  });

  it("creates timed event with correct datetime in resolved timezone", async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeEvent());
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ timezone: "Asia/Tokyo" }),
      deps,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [_calendarId, _calendarName, input] = mockCreate.mock.calls[0]!;
    expect(input.allDay).toBe(false);
    expect(input.timeZone).toBe("Asia/Tokyo");
    // Start/end should be ISO 8601 with offset
    expect(input.start).toContain("+09:00");
    expect(input.end).toContain("+09:00");
  });

  it("--all-day flag creates all-day event with date-only start/end", async () => {
    const mockCreate = vi.fn().mockResolvedValue(
      makeEvent({ all_day: true, start: "2026-02-24", end: "2026-02-26" }),
    );
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({
        start: "2026-02-24",
        end: "2026-02-26",
        allDay: true,
      }),
      deps,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [, , input] = mockCreate.mock.calls[0]!;
    expect(input.allDay).toBe(true);
    expect(input.start).toBe("2026-02-24");
    expect(input.end).toBe("2026-02-26");
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
    const mockCreate = vi.fn().mockResolvedValue(
      makeEvent({ calendar_id: "work@group.calendar.google.com", calendar_name: "Work" }),
    );
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ calendar: "work@group.calendar.google.com" }),
      deps,
    );

    const [calendarId] = mockCreate.mock.calls[0]!;
    expect(calendarId).toBe("work@group.calendar.google.com");
  });

  it("--free flag sets transparency to transparent", async () => {
    const mockCreate = vi.fn().mockResolvedValue(
      makeEvent({ transparency: "transparent" }),
    );
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ free: true }),
      deps,
    );

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
    const mockCreate = vi.fn().mockResolvedValue(
      makeEvent({ description: "My description" }),
    );
    const deps = makeDeps({ createEvent: mockCreate });

    await handleAdd(
      baseOptions({ description: "My description" }),
      deps,
    );

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

    await handleAdd(
      baseOptions({ title: "Team Meeting", format: "json" }),
      deps,
    );

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

  it("has --title, -t option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--title");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-t");
  });

  it("has --start, -s option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--start");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-s");
  });

  it("has --end, -e option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--end");
    expect(opt).toBeDefined();
    expect(opt!.short).toBe("-e");
  });

  it("has --all-day option", () => {
    const cmd = createAddCommand();
    const opt = cmd.options.find((o) => o.long === "--all-day");
    expect(opt).toBeDefined();
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
});
