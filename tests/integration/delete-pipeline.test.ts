import { describe, expect, it, vi } from "vitest";
import { handleDelete } from "../../src/commands/delete.ts";
import { createMockApi, captureWrite } from "./helpers.ts";

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

  it("throws ApiError when API returns 404 Not Found", async () => {
    const { ApiError } = await import("../../src/lib/api.ts");
    const notFoundError = new Error("Not Found") as Error & { code: number };
    notFoundError.code = 404;

    const mockApi = createMockApi({
      errors: { deleteEvent: notFoundError },
    });

    await expect(
      handleDelete({
        api: mockApi,
        eventId: "nonexistent",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: vi.fn(),
      }),
    ).rejects.toThrow(ApiError);
  });

  it("throws ApiError when API returns 401 Unauthorized", async () => {
    const { ApiError } = await import("../../src/lib/api.ts");
    const authError = new Error("Unauthorized") as Error & { code: number };
    authError.code = 401;

    const mockApi = createMockApi({
      errors: { deleteEvent: authError },
    });

    await expect(
      handleDelete({
        api: mockApi,
        eventId: "evt-123",
        calendarId: "primary",
        format: "json",
        quiet: false,
        write: vi.fn(),
      }),
    ).rejects.toThrow(ApiError);
  });
});
