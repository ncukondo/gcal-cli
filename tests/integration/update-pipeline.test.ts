import { describe, expect, it, vi } from "vitest";
import { handleUpdate } from "../../src/commands/update.ts";
import { getEvent } from "../../src/lib/api.ts";
import { createMockApi, makeGoogleEvent, makeAllDayGoogleEvent, captureWrite } from "./helpers.ts";

function makeGetEvent(mockApi: ReturnType<typeof createMockApi>) {
  return (calId: string, calName: string, evtId: string, tz?: string) =>
    getEvent(mockApi, calId, calName, evtId, tz);
}

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
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
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
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
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
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
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
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
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
        writeStderr: vi.fn(),
        getEvent: makeGetEvent(mockApi),
      }),
    ).rejects.toThrow("at least one update option must be provided");
  });

  it("start-only fetches existing event and preserves duration", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({
            id: "evt-1",
            start: { dateTime: "2026-02-23T10:00:00+09:00" },
            end: { dateTime: "2026-02-23T11:00:00+09:00" },
          }),
        ],
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
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
      start: "2026-02-23T14:00",
    });

    // Should fetch existing event to get duration
    expect(mockApi.events.get).toHaveBeenCalled();
    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    const body = patchFn.mock.calls[0]![0].requestBody;
    expect(body.start.dateTime).toContain("14:00:00");
    expect(body.end.dateTime).toContain("15:00:00");
  });

  it("errors when --end datetime is used on an all-day event", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeAllDayGoogleEvent({ id: "evt-allday-1" })],
      },
    });
    const out = captureWrite();

    await expect(
      handleUpdate({
        api: mockApi,
        eventId: "evt-allday-1",
        calendarId: "primary",
        calendarName: "Main Calendar",
        format: "json",
        timezone: "Asia/Tokyo",
        write: out.write,
        writeStderr: vi.fn(),
        getEvent: makeGetEvent(mockApi),
        end: "2026-03-01T12:00",
      }),
    ).rejects.toThrow("--end format (datetime) does not match existing event type (all-day)");
  });

  it("errors when --end date-only is used on a timed event", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "evt-1" })],
      },
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
        writeStderr: vi.fn(),
        getEvent: makeGetEvent(mockApi),
        end: "2026-03-01",
      }),
    ).rejects.toThrow("--end format (date-only) does not match existing event type (timed)");
  });

  it("does not fetch existing event for type warning when --start and --end are both provided", async () => {
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
      timezone: "Asia/Tokyo",
      write: out.write,
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
      start: "2026-03-01T14:00",
      end: "2026-03-01T15:00",
    });

    // getEvent should NOT be called when both start and end are provided
    expect(mockApi.events.get).not.toHaveBeenCalled();
  });
});
