import { describe, expect, it, vi } from "vitest";
import { handleUpdate } from "../../src/commands/update.ts";
import { getEventWithRaw } from "../../src/lib/api.ts";
import { createMockApi, makeGoogleEvent, makeAllDayGoogleEvent, captureWrite } from "./helpers.ts";

function makeGetEvent(mockApi: ReturnType<typeof createMockApi>) {
  return (calId: string, calName: string, evtId: string, tz?: string) =>
    getEventWithRaw(mockApi, calId, calName, evtId, tz);
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

  it("text output starts with 'Event updated' message", async () => {
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
    expect(output).toMatch(/^Event updated/);
    expect(output).toContain("Updated Title");
    expect(output).toContain("Main Calendar");
  });

  it("JSON output includes message: 'Event updated'", async () => {
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
      format: "json",
      timezone: "Asia/Tokyo",
      write: out.write,
      writeStderr: vi.fn(),
      getEvent: makeGetEvent(mockApi),
      title: "Updated Title",
    });

    const json = JSON.parse(out.output());
    expect(json.data.message).toBe("Event updated");
    expect(json.data.event.title).toBe("Updated Title");
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

  it("resolves --add-attendee / --remove-attendee by get -> merge -> patch", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({
            id: "evt-1",
            attendees: [
              { email: "boss@example.com", responseStatus: "accepted", organizer: true },
              {
                email: "alice@example.com",
                responseStatus: "tentative",
                comment: "joining 10 min late",
                additionalGuests: 2,
              },
              { displayName: "Meeting Room A", responseStatus: "accepted" },
              { email: "bob@example.com", responseStatus: "needsAction" },
            ],
          }),
        ],
      },
    });
    const out = captureWrite();
    const stderr: string[] = [];

    const result = await handleUpdate({
      api: mockApi,
      eventId: "evt-1",
      calendarId: "primary",
      calendarName: "Main Calendar",
      format: "json",
      timezone: "Asia/Tokyo",
      write: out.write,
      writeStderr: (msg) => stderr.push(msg),
      getEvent: makeGetEvent(mockApi),
      addAttendee: ["carol@example.com"],
      removeAttendee: ["BOB@example.com", "dave@example.com"],
    });

    expect(result.exitCode).toBe(0);
    // One read feeds the policy, the preview and the merge that gets written.
    expect(mockApi.events.get).toHaveBeenCalledTimes(1);
    expect(stderr.join("\n")).toContain(
      "Note: dave@example.com is not an attendee of this event; nothing to remove.",
    );

    // The comment, the guest count and the room -- none of which CalendarEvent
    // carries -- have to come back out the other side untouched.
    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    expect(patchFn.mock.calls[0]![0].requestBody.attendees).toEqual([
      { email: "boss@example.com", responseStatus: "accepted", organizer: true },
      {
        email: "alice@example.com",
        responseStatus: "tentative",
        comment: "joining 10 min late",
        additionalGuests: 2,
      },
      { displayName: "Meeting Room A", responseStatus: "accepted" },
      { email: "carol@example.com" },
    ]);
  });

  it("leaves the guest list out of the patch when the diff changes nothing", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({
            id: "evt-1",
            attendees: [{ email: "alice@example.com", responseStatus: "accepted" }],
          }),
        ],
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
      removeAttendee: ["dave@example.com"],
      notify: "all",
    });

    expect(result.exitCode).toBe(0);
    const patchFn = mockApi.events.patch as ReturnType<typeof vi.fn>;
    expect(patchFn.mock.calls[0]![0].requestBody).not.toHaveProperty("attendees");
  });

  it("rejects removing the organizer before patching", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({
            id: "evt-1",
            attendees: [{ email: "boss@example.com", responseStatus: "accepted", organizer: true }],
          }),
        ],
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
        removeAttendee: ["boss@example.com"],
      }),
    ).rejects.toThrow("cannot remove the event organizer");

    expect(mockApi.events.patch).not.toHaveBeenCalled();
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
