import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { createDeleteCommand, handleDelete } from "./delete.ts";
import type { DeleteHandlerOptions } from "./delete.ts";

function makeMockApi(opts?: { rejectDelete?: boolean }): GoogleCalendarApi {
  return {
    calendarList: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
    events: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: opts?.rejectDelete
        ? vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }))
        : vi.fn().mockResolvedValue({}),
    },
  };
}

function runDelete(
  api: GoogleCalendarApi,
  opts: {
    eventId?: string;
    calendarId?: string;
    format?: "text" | "json";
    quiet?: boolean;
    dryRun?: boolean;
  } = {},
) {
  const output: string[] = [];
  const handlerOpts: DeleteHandlerOptions = {
    api,
    eventId: opts.eventId ?? "evt1",
    calendarId: opts.calendarId ?? "primary",
    format: opts.format ?? "text",
    quiet: opts.quiet ?? false,
    dryRun: opts.dryRun ?? false,
    write: (msg: string) => {
      output.push(msg);
    },
  };
  return handleDelete(handlerOpts).then((result) => ({ ...result, output }));
}

describe("delete command", () => {
  it("missing event-id throws ApiError with INVALID_ARGS", async () => {
    const { ApiError } = await import("../lib/api.ts");
    const api = makeMockApi();

    await expect(
      handleDelete({
        api,
        eventId: "",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: vi.fn(),
      }),
    ).rejects.toThrow(ApiError);
  });

  describe("API interaction", () => {
    it("calls events.delete with correct calendarId and eventId", async () => {
      const api = makeMockApi();
      await runDelete(api, { eventId: "evt1", calendarId: "primary" });

      expect(api.events.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
      });
    });

    it("throws ApiError for non-existent event ID", async () => {
      const { ApiError } = await import("../lib/api.ts");
      const api = makeMockApi({ rejectDelete: true });

      await expect(
        handleDelete({
          api,
          eventId: "nonexistent",
          calendarId: "primary",
          format: "text",
          quiet: false,
          write: vi.fn(),
        }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("text output", () => {
    it("outputs confirmation message on successful deletion", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, { eventId: "evt1" });

      expect(result.exitCode).toBe(0);
      const text = result.output.join("\n");
      expect(text).toContain("Event deleted");
    });

    it("suppresses output when --quiet flag is set", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, { eventId: "evt1", quiet: true });

      expect(result.exitCode).toBe(0);
      expect(result.output).toHaveLength(0);
    });
  });

  describe("JSON output", () => {
    it("returns deleted_id and message in success envelope", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, { eventId: "evt1", format: "json" });

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.deleted_id).toBe("evt1");
      expect(json.data.message).toBe("Event deleted");
    });

    it("throws ApiError with NOT_FOUND for non-existent event in JSON mode", async () => {
      const { ApiError } = await import("../lib/api.ts");
      const api = makeMockApi({ rejectDelete: true });

      try {
        await handleDelete({
          api,
          eventId: "nonexistent",
          calendarId: "primary",
          format: "json",
          quiet: false,
          write: vi.fn(),
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as InstanceType<typeof ApiError>).code).toBe("NOT_FOUND");
      }
    });

    it("suppresses output when --quiet flag is set even in JSON mode", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, { eventId: "evt1", format: "json", quiet: true });

      expect(result.exitCode).toBe(0);
      expect(result.output).toHaveLength(0);
    });
  });

  describe("exit code", () => {
    it("returns exit code 0 on success", async () => {
      const api = makeMockApi();
      const result = await runDelete(api);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("--dry-run", () => {
    it("does not call API when dry-run is set", async () => {
      const api = makeMockApi();
      await runDelete(api, { eventId: "evt123", calendarId: "primary", dryRun: true });

      expect(api.events.delete).not.toHaveBeenCalled();
    });

    it("outputs preview message in text format", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, {
        eventId: "evt123",
        calendarId: "primary",
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      const text = result.output.join("\n");
      expect(text).toContain('DRY RUN: Would delete event "evt123" from calendar "primary"');
    });

    it("outputs dry-run data in JSON format", async () => {
      const api = makeMockApi();
      const result = await runDelete(api, {
        eventId: "evt123",
        calendarId: "primary",
        format: "json",
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        dry_run: true,
        action: "delete",
        event_id: "evt123",
        calendar_id: "primary",
      });
    });
  });

  describe("createDeleteCommand", () => {
    it("creates a command named 'delete'", () => {
      const cmd = createDeleteCommand();
      expect(cmd.name()).toBe("delete");
    });

    it("requires an event-id argument", () => {
      const cmd = createDeleteCommand();
      cmd.exitOverride();
      expect(() => cmd.parse(["node", "delete"])).toThrow();
    });

    it("accepts an event-id argument", () => {
      const cmd = createDeleteCommand();
      cmd.exitOverride();
      cmd.parse(["node", "delete", "abc123"]);
      expect(cmd.args[0]).toBe("abc123");
    });

    it("accepts a --calendar option", () => {
      const cmd = createDeleteCommand();
      cmd.exitOverride();
      cmd.parse(["node", "delete", "--calendar", "work@group.calendar.google.com", "abc123"]);
      expect(cmd.opts().calendar).toBe("work@group.calendar.google.com");
      expect(cmd.args[0]).toBe("abc123");
    });

    it("accepts -c shorthand for calendar", () => {
      const cmd = createDeleteCommand();
      cmd.exitOverride();
      cmd.parse(["node", "delete", "-c", "work@group.calendar.google.com", "abc123"]);
      expect(cmd.opts().calendar).toBe("work@group.calendar.google.com");
    });

    it("accepts --dry-run option", () => {
      const cmd = createDeleteCommand();
      cmd.exitOverride();
      cmd.parse(["node", "delete", "--dry-run", "abc123"]);
      expect(cmd.opts().dryRun).toBe(true);
    });
  });
});
