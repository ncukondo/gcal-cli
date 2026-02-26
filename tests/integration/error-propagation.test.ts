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
  SINGLE_CALENDAR_CONFIG_TOML,
  captureWrite,
} from "./helpers.ts";

describe("error propagation: API errors → command handler → output", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("401/403 errors map to AUTH_REQUIRED", () => {
    function makeAuthError(): Error & { code: number } {
      const err = new Error("Request had invalid authentication credentials") as Error & {
        code: number;
      };
      err.code = 401;
      return err;
    }

    it("list: auth error is caught per-calendar and reported via writeErr", async () => {
      const mockApi = createMockApi({
        errors: { listEvents: makeAuthError() },
      });
      const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
      const out = captureWrite();
      const writeErr = vi.fn();

      const deps: ListHandlerDeps = {
        listEvents: (calId, calName, opts) => listEvents(mockApi, calId, calName, opts),
        loadConfig: () => loadConfig(mockFs),
        write: out.write,
        writeErr,
        now: () => new Date("2026-02-23T10:00:00+09:00"),
      };

      const result = await handleList({ today: true, format: "json", quiet: false }, deps);

      // List uses Promise.allSettled, so auth errors are reported per-calendar
      expect(result.exitCode).toBe(0);
      expect(writeErr).toHaveBeenCalled();
      const json = JSON.parse(out.output());
      expect(json.data.events).toEqual([]);
    });

    it("search: auth error propagates from API", async () => {
      const mockApi = createMockApi({
        errors: { listEvents: makeAuthError() },
      });

      await expect(
        handleSearch({
          api: mockApi,
          query: "test",
          format: "json",
          calendars: [{ id: "primary", name: "Main", enabled: true }],
          timezone: "Asia/Tokyo",
          write: vi.fn(),
        }),
      ).rejects.toThrow();
    });

    it("add: auth error propagates from createEvent", async () => {
      const mockApi = createMockApi({
        errors: { insertEvent: makeAuthError() },
      });
      const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);

      const deps: AddHandlerDeps = {
        createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
        loadConfig: () => loadConfig(mockFs),
        write: vi.fn(),
      };

      await expect(
        handleAdd(
          { title: "Test", start: "2026-03-01T10:00", end: "2026-03-01T11:00", format: "json" },
          deps,
        ),
      ).rejects.toThrow();
    });

    it("delete: auth error is caught and formatted as JSON error", async () => {
      const mockApi = createMockApi({
        errors: { deleteEvent: makeAuthError() },
      });
      const out = captureWrite();

      const result = await handleDelete({
        api: mockApi,
        eventId: "evt-1",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: out.write,
      });

      expect(result.exitCode).toBe(2); // AUTH
      const json = JSON.parse(out.output());
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("404 errors map to NOT_FOUND", () => {
    function makeNotFoundError(): Error & { code: number } {
      const err = new Error("Not Found") as Error & { code: number };
      err.code = 404;
      return err;
    }

    it("update: 404 error propagates as NOT_FOUND ApiError", async () => {
      const mockApi = createMockApi({
        errors: { patchEvent: makeNotFoundError() },
      });

      await expect(
        handleUpdate({
          api: mockApi,
          eventId: "nonexistent",
          calendarId: "primary",
          calendarName: "Main",
          format: "json",
          timezone: "Asia/Tokyo",
          write: vi.fn(),
          writeStderr: vi.fn(),
          getEvent: async (calId, calName, evtId, tz) => {
            const { getEvent } = await import("../../src/lib/api.ts");
            return getEvent(mockApi, calId, calName, evtId, tz);
          },
          title: "Updated",
        }),
      ).rejects.toThrow();
    });

    it("delete: 404 error is caught and formatted as NOT_FOUND", async () => {
      const mockApi = createMockApi({
        errors: { deleteEvent: makeNotFoundError() },
      });
      const out = captureWrite();

      await handleDelete({
        api: mockApi,
        eventId: "nonexistent",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: out.write,
      });

      const json = JSON.parse(out.output());
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("delete: 404 error in text format shows readable error message", async () => {
      const mockApi = createMockApi({
        errors: { deleteEvent: makeNotFoundError() },
      });
      const out = captureWrite();

      const result = await handleDelete({
        api: mockApi,
        eventId: "nonexistent",
        calendarId: "primary",
        format: "text",
        quiet: false,
        write: out.write,
      });

      expect(result.exitCode).toBe(1);
      expect(out.output()).toContain("Error:");
    });
  });

  describe("generic API errors map to API_ERROR", () => {
    it("500 server error maps to API_ERROR", async () => {
      const err = new Error("Internal Server Error") as Error & { code: number };
      err.code = 500;

      const mockApi = createMockApi({ errors: { deleteEvent: err } });
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
      expect(json.error.code).toBe("API_ERROR");
    });
  });

  describe("validation errors", () => {
    it("add: missing title returns INVALID_ARGS with correct exit code", async () => {
      const mockApi = createMockApi();
      const mockFs = createMockFs(SINGLE_CALENDAR_CONFIG_TOML);
      const out = captureWrite();

      const deps: AddHandlerDeps = {
        createEvent: (calId, calName, input) => createEvent(mockApi, calId, calName, input),
        loadConfig: () => loadConfig(mockFs),
        write: out.write,
      };

      const result = await handleAdd(
        { title: "", start: "2026-03-01T10:00", end: "2026-03-01T11:00", format: "json" },
        deps,
      );

      expect(result.exitCode).toBe(3); // ARGUMENT
      const json = JSON.parse(out.output());
      expect(json.error.code).toBe("INVALID_ARGS");
    });

    it("delete: missing event-id returns INVALID_ARGS", async () => {
      const mockApi = createMockApi();
      const out = captureWrite();

      const result = await handleDelete({
        api: mockApi,
        eventId: "",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: out.write,
      });

      expect(result.exitCode).toBe(3);
      const json = JSON.parse(out.output());
      expect(json.error.code).toBe("INVALID_ARGS");
    });
  });
});
