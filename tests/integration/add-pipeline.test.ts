import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleAdd, type AddHandlerDeps } from "../../src/commands/add.ts";
import { createEvent } from "../../src/lib/api.ts";
import { loadConfig } from "../../src/lib/config.ts";
import {
  createMockApi,
  createMockFs,
  SINGLE_CALENDAR_CONFIG_TOML,
  captureWrite,
} from "./helpers.ts";

describe("add command pipeline: config → timezone → API → output", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates a timed event with timezone resolution from config", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    const result = await handleAdd(
      {
        title: "New Meeting",
        start: "2026-03-01T10:00",
        end: "2026-03-01T11:00",
        format: "json",
      },
      deps,
    );

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(out.output());
    expect(json.success).toBe(true);
    expect(json.data.event.title).toBe("New Meeting");
    expect(json.data.message).toBe("Event created");

    // Verify the API received dateTime fields with timezone offset
    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("+09:00");
    expect(body.end.dateTime).toContain("+09:00");
  });

  it("creates an all-day event auto-detected from date-only start", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    const result = await handleAdd(
      {
        title: "Vacation",
        start: "2026-03-01",
        end: "2026-03-03",
        format: "json",
      },
      deps,
    );

    expect(result.exitCode).toBe(0);

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.date).toBe("2026-03-01");
    // User end "2026-03-03" (inclusive) → API end "2026-03-04" (exclusive)
    expect(body.end.date).toBe("2026-03-04");
    expect(body.start.dateTime).toBeUndefined();
  });

  it("defaults to 1-day all-day event when end omitted", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "Holiday",
        start: "2026-03-01",
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.date).toBe("2026-03-01");
    expect(body.end.date).toBe("2026-03-02"); // exclusive: same day + 1
  });

  it("defaults to +1h timed event when end omitted", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "Quick Meeting",
        start: "2026-03-01T10:00",
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("10:00");
    expect(body.end.dateTime).toContain("11:00");
  });

  it("--duration computes end for timed event", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "Standup",
        start: "2026-03-01T10:00",
        duration: "30m",
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("10:00");
    expect(body.end.dateTime).toContain("10:30");
  });

  it("timezone override (--tz) applies to the created event's datetime", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "NY Meeting",
        start: "2026-03-01T10:00",
        end: "2026-03-01T11:00",
        timezone: "America/New_York",
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("-05:00");
    expect(body.end.dateTime).toContain("-05:00");
    expect(body.start.timeZone).toBe("America/New_York");
  });

  it("--free flag sets transparency to transparent in API call", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "Focus Time",
        start: "2026-03-01T09:00",
        end: "2026-03-01T12:00",
        free: true,
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    const body = insertFn.mock.calls[0]![0].requestBody;
    expect(body.transparency).toBe("transparent");
  });

  it("calendar override (-c) targets the specified calendar", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "Work Event",
        start: "2026-03-01T10:00",
        end: "2026-03-01T11:00",
        calendar: "work@group.calendar.google.com",
        format: "json",
      },
      deps,
    );

    const insertFn = mockApi.events.insert as ReturnType<typeof vi.fn>;
    expect(insertFn.mock.calls[0]![0].calendarId).toBe("work@group.calendar.google.com");
  });

  it("text output shows event detail after creation", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      {
        title: "New Event",
        start: "2026-03-01T10:00",
        end: "2026-03-01T11:00",
        format: "text",
      },
      deps,
    );

    const output = out.output();
    expect(output).toContain("Event created");
    expect(output).toContain("New Event");
  });

  it("returns ARGUMENT exit code when required fields are missing", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    const result = await handleAdd(
      {
        title: "",
        start: "2026-03-01T10:00",
        format: "json",
      },
      deps,
    );

    expect(result.exitCode).toBe(3); // ExitCode.ARGUMENT
  });

  it("rejects start/end type mismatch (date + datetime)", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    const result = await handleAdd(
      {
        title: "Bad Event",
        start: "2026-03-01",
        end: "2026-03-01T11:00",
        format: "json",
      },
      deps,
    );

    expect(result.exitCode).toBe(3);
    expect(out.output()).toContain("INVALID_ARGS");
  });
});
