import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleList, type ListHandlerDeps } from "../../src/commands/list.ts";
import { handleSearch } from "../../src/commands/search.ts";
import { handleAdd, type AddHandlerDeps } from "../../src/commands/add.ts";
import { handleUpdate } from "../../src/commands/update.ts";
import { handleDelete } from "../../src/commands/delete.ts";
import { listEvents, createEvent } from "../../src/lib/api.ts";
import { loadConfig } from "../../src/lib/config.ts";
import {
  createMockApi,
  createMockFs,
  makeGoogleEvent,
  SINGLE_CALENDAR_CONFIG_TOML,
  captureWrite,
} from "./helpers.ts";

describe("JSON output envelope consistency across all commands", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function assertSuccessEnvelope(json: unknown): void {
    const obj = json as Record<string, unknown>;
    expect(obj).toHaveProperty("success", true);
    expect(obj).toHaveProperty("data");
    expect(typeof obj.data).toBe("object");
  }

  it("list command returns { success: true, data: { events, count } }", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent()] },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: () => new Date("2026-02-23T10:00:00+09:00"),
    };

    await handleList({ today: true, format: "json", quiet: false }, deps);
    const json = JSON.parse(out.output());

    assertSuccessEnvelope(json);
    expect(json.data).toHaveProperty("events");
    expect(json.data).toHaveProperty("count");
    expect(Array.isArray(json.data.events)).toBe(true);
    expect(typeof json.data.count).toBe("number");
  });

  it("search command returns { success: true, data: { query, events, count } }", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent()] },
    });
    const out = captureWrite();

    await handleSearch({
      api: mockApi,
      query: "meeting",
      format: "json",
      calendars: [{ id: "primary", name: "Main", enabled: true }],
      timezone: "Asia/Tokyo",
      write: out.write,
    });
    const json = JSON.parse(out.output());

    assertSuccessEnvelope(json);
    expect(json.data).toHaveProperty("query", "meeting");
    expect(json.data).toHaveProperty("events");
    expect(json.data).toHaveProperty("count");
  });

  it("add command returns { success: true, data: { event, message } }", async () => {
    const mockApi = createMockApi();
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: AddHandlerDeps = {
      createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
    };

    await handleAdd(
      { title: "Test", start: "2026-03-01T10:00", end: "2026-03-01T11:00", format: "json" },
      deps,
    );
    const json = JSON.parse(out.output());

    assertSuccessEnvelope(json);
    expect(json.data).toHaveProperty("event");
    expect(json.data).toHaveProperty("message", "Event created");
  });

  it("update command returns { success: true, data: { event } }", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent({ id: "evt-1" })] },
    });
    const out = captureWrite();

    await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main",
      format: "json",
      timezone: "Asia/Tokyo",
      write: out.write,
      writeStderr: vi.fn(),
      getEvent: async (calId, calName, evtId, tz) => {
        const { getEvent } = await import("../../src/lib/api.ts");
        return getEvent(mockApi, calId, calName, evtId, tz);
      },
      title: "Updated",
    });
    const json = JSON.parse(out.output());

    assertSuccessEnvelope(json);
    expect(json.data).toHaveProperty("event");
  });

  it("delete command returns { success: true, data: { deleted_id, message } }", async () => {
    const mockApi = createMockApi();
    const out = captureWrite();

    await handleDelete({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      format: "json",
      quiet: false,
      write: out.write,
    });
    const json = JSON.parse(out.output());

    assertSuccessEnvelope(json);
    expect(json.data).toHaveProperty("deleted_id", "evt-1");
    expect(json.data).toHaveProperty("message", "Event deleted");
  });

  it("all JSON error responses follow { success: false, error: { code, message } }", async () => {
    // Test with delete (which has internal error handling)
    const err = new Error("Not Found") as Error & { code: number };
    err.code = 404;
    const mockApi = createMockApi({ errors: { deleteEvent: err } });
    const out = captureWrite();

    await handleDelete({
      api: mockApi,
      eventId: "x",
      calendarId: "primary",
      format: "json",
      quiet: false,
      write: out.write,
    });
    const json = JSON.parse(out.output());

    expect(json).toHaveProperty("success", false);
    expect(json).toHaveProperty("error");
    expect(json.error).toHaveProperty("code");
    expect(json.error).toHaveProperty("message");
    expect(typeof json.error.code).toBe("string");
    expect(typeof json.error.message).toBe("string");
  });
});

describe("text output formatting consistency across list/search", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const events = [
    makeGoogleEvent({
      id: "e1",
      summary: "Team Meeting",
      start: { dateTime: "2026-02-23T10:00:00+09:00" },
      end: { dateTime: "2026-02-23T11:00:00+09:00" },
      transparency: "opaque",
    }),
    makeGoogleEvent({
      id: "e2",
      summary: "Focus Time",
      start: { dateTime: "2026-02-23T14:00:00+09:00" },
      end: { dateTime: "2026-02-23T15:00:00+09:00" },
      transparency: "transparent",
    }),
  ];

  it("list text output includes time range, title, calendar name, and transparency tag", async () => {
    const mockApi = createMockApi({ events: { primary: events } });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
    const out = captureWrite();

    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: out.write,
      writeErr: vi.fn(),
      now: () => new Date("2026-02-23T10:00:00+09:00"),
    };

    await handleList({ today: true, format: "text", quiet: false }, deps);

    const output = out.output();
    expect(output).toContain("10:00-11:00");
    expect(output).toContain("Team Meeting");
    expect(output).toContain("Main Calendar");
    expect(output).toContain("[busy]");
    expect(output).toContain("[free]");
  });

  it("search text output includes time range, title, calendar name, and transparency tag", async () => {
    const mockApi = createMockApi({ events: { primary: events } });
    const out = captureWrite();

    await handleSearch({
      api: mockApi,
      query: "test",
      format: "text",
      calendars: [{ id: "primary", name: "Main Calendar", enabled: true }],
      timezone: "Asia/Tokyo",
      write: out.write,
    });

    const output = out.output();
    expect(output).toContain("10:00-11:00");
    expect(output).toContain("Team Meeting");
    expect(output).toContain("Main Calendar");
    expect(output).toContain("[busy]");
    expect(output).toContain("[free]");
  });

  it("both list and search show consistent empty state messages", async () => {
    const mockApi = createMockApi({ events: { primary: [] } });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);

    // List empty
    const listOut = captureWrite();
    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: listOut.write,
      writeErr: vi.fn(),
      now: () => new Date("2026-02-23T10:00:00+09:00"),
    };
    await handleList({ today: true, format: "text", quiet: false }, deps);
    expect(listOut.output()).toContain("No events found");

    // Search empty
    const searchOut = captureWrite();
    await handleSearch({
      api: mockApi,
      query: "nothing",
      format: "text",
      calendars: [{ id: "primary", name: "Main", enabled: true }],
      timezone: "Asia/Tokyo",
      write: searchOut.write,
    });
    expect(searchOut.output()).toContain("Found 0 events");
  });

  it("event objects in JSON have consistent field set across list and search", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent({ id: "e1" })] },
    });
    const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);

    // List JSON
    const listOut = captureWrite();
    const deps: ListHandlerDeps = {
      listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
      loadConfig: () => loadConfig(mockFs),
      write: listOut.write,
      writeErr: vi.fn(),
      now: () => new Date("2026-02-23T10:00:00+09:00"),
    };
    await handleList({ today: true, format: "json", quiet: false }, deps);
    const listJson = JSON.parse(listOut.output());
    const listEvent = listJson.data.events[0];

    // Search JSON
    const searchOut = captureWrite();
    await handleSearch({
      api: mockApi,
      query: "test",
      format: "json",
      calendars: [{ id: "primary", name: "Main Calendar", enabled: true }],
      timezone: "Asia/Tokyo",
      write: searchOut.write,
    });
    const searchJson = JSON.parse(searchOut.output());
    const searchEvent = searchJson.data.events[0];

    // Both should have the same fields
    const expectedFields = [
      "id",
      "title",
      "description",
      "start",
      "end",
      "all_day",
      "calendar_id",
      "calendar_name",
      "html_link",
      "status",
      "transparency",
      "created",
      "updated",
    ];

    for (const field of expectedFields) {
      expect(listEvent).toHaveProperty(field);
      expect(searchEvent).toHaveProperty(field);
    }

    // Same field count (no extra fields in either)
    expect(Object.keys(listEvent).sort()).toEqual(Object.keys(searchEvent).sort());
  });
});
