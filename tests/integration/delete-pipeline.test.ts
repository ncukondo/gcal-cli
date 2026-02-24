import { describe, expect, it } from "vitest";
import { handleDelete } from "../../src/commands/delete.ts";
import {
  createMockApi,
  captureWrite,
} from "./helpers.ts";

describe("delete command pipeline: API → output", () => {
  it("deletes event and outputs JSON success response", async () => {
    const deletedEvents: { calendarId: string; eventId: string }[] = [];
    const mockApi = createMockApi({ deletedEvents });
    const out = captureWrite();

    const result = await handleDelete({
      api: mockApi,
      eventId: "evt-123",
      calendarId: "primary",
      format: "json",
      quiet: false,
      write: out.write,
    });

    expect(result.exitCode).toBe(0);
    expect(deletedEvents).toHaveLength(1);
    expect(deletedEvents[0]).toEqual({ calendarId: "primary", eventId: "evt-123" });

    const json = JSON.parse(out.output());
    expect(json.success).toBe(true);
    expect(json.data.deleted_id).toBe("evt-123");
    expect(json.data.message).toBe("Event deleted");
  });

  it("deletes event and outputs text success message", async () => {
    const mockApi = createMockApi();
    const out = captureWrite();

    const result = await handleDelete({
      api: mockApi,
      eventId: "evt-123",
      calendarId: "primary",
      format: "text",
      quiet: false,
      write: out.write,
    });

    expect(result.exitCode).toBe(0);
    expect(out.output()).toBe("Event deleted");
  });

  it("quiet mode produces no output on success", async () => {
    const mockApi = createMockApi();
    const out = captureWrite();

    const result = await handleDelete({
      api: mockApi,
      eventId: "evt-123",
      calendarId: "primary",
      format: "text",
      quiet: true,
      write: out.write,
    });

    expect(result.exitCode).toBe(0);
    expect(out.output()).toBe("");
  });

  it("returns error when API returns 404 Not Found", async () => {
    const notFoundError = new Error("Not Found") as Error & { code: number };
    notFoundError.code = 404;

    const mockApi = createMockApi({
      errors: { deleteEvent: notFoundError },
    });
    const out = captureWrite();

    const result = await handleDelete({
      api: mockApi,
      eventId: "nonexistent",
      calendarId: "primary",
      format: "json",
      quiet: false,
      write: out.write,
    });

    expect(result.exitCode).toBe(1); // ExitCode.GENERAL for NOT_FOUND
    const json = JSON.parse(out.output());
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns error when API returns 401 Unauthorized", async () => {
    const authError = new Error("Unauthorized") as Error & { code: number };
    authError.code = 401;

    const mockApi = createMockApi({
      errors: { deleteEvent: authError },
    });
    const out = captureWrite();

    const result = await handleDelete({
      api: mockApi,
      eventId: "evt-123",
      calendarId: "primary",
      format: "json",
      quiet: false,
      write: out.write,
    });

    expect(result.exitCode).toBe(2); // ExitCode.AUTH
    const json = JSON.parse(out.output());
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });
});
