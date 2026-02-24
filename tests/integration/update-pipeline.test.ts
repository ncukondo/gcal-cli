import { describe, expect, it, vi } from "vitest";
import { handleUpdate } from "../../src/commands/update.ts";
import { createMockApi, makeGoogleEvent, captureWrite } from "./helpers.ts";

describe("update command pipeline: API → normalize → output", () => {
  it("updates event title and returns updated event details", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "evt-1", summary: "Old Title" })],
      },
    });
    const out = captureWrite();

    const result = await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main Calendar",
      format: "json",
      timezone: "Asia/Tokyo",
      write: out.write,
      title: "New Title",
    });

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(out.output());
    expect(json.success).toBe(true);
    expect(json.data.event.title).toBe("New Title");

    // Verify API was called with correct patch body
    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    expect(patchFn).toHaveBeenCalledTimes(1);
    expect(patchFn.mock.calls[0]![0].requestBody.summary).toBe("New Title");
  });

  it("updates start/end times with timezone resolution", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "evt-1" })],
      },
    });
    const out = captureWrite();

    await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main Calendar",
      format: "json",
      timezone: "America/New_York",
      write: out.write,
      start: "2026-03-01T14:00",
      end: "2026-03-01T15:00",
    });

    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    const body = patchFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("-05:00");
    expect(body.end.dateTime).toContain("-05:00");
  });

  it("updates transparency to free", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "evt-1", transparency: "opaque" })],
      },
    });
    const out = captureWrite();

    await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main Calendar",
      format: "json",
      timezone: "Asia/Tokyo",
      write: out.write,
      free: true,
    });

    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    expect(patchFn.mock.calls[0]![0].requestBody.transparency).toBe("transparent");
  });

  it("text output shows event detail after update", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "evt-1", summary: "Original" })],
      },
    });
    const out = captureWrite();

    await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main Calendar",
      format: "text",
      timezone: "Asia/Tokyo",
      write: out.write,
      title: "Updated Title",
    });

    const output = out.output();
    expect(output).toContain("Updated Title");
    expect(output).toContain("Main Calendar");
  });

  it("throws when no update options are provided", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent({ id: "evt-1" })] },
    });
    const out = captureWrite();

    await expect(
      handleUpdate({
        api: mockApi,
        eventId: "evt-1",
        calendarId: "primary",
        calendarName: "Main Calendar",
        format: "json",
        timezone: "Asia/Tokyo",
        write: out.write,
      }),
    ).rejects.toThrow("at least one update option must be provided");
  });

  it("throws when only start is provided without end", async () => {
    const mockApi = createMockApi({
      events: { primary: [makeGoogleEvent({ id: "evt-1" })] },
    });
    const out = captureWrite();

    await expect(
      handleUpdate({
        api: mockApi,
        eventId: "evt-1",
        calendarId: "primary",
        calendarName: "Main Calendar",
        format: "json",
        timezone: "Asia/Tokyo",
        write: out.write,
        start: "2026-03-01T10:00",
      }),
    ).rejects.toThrow("start, end, and allDay must all be provided together");
  });
});
