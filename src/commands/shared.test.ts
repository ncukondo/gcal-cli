import { describe, expect, it, vi } from "vitest";
import type { AuthFsAdapter } from "../lib/auth.ts";
import type { FsAdapter } from "../lib/config.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { fsAdapter, createGoogleCalendarApi } from "./shared.ts";

describe("fsAdapter", () => {
  it("satisfies AuthFsAdapter interface", () => {
    const _auth: AuthFsAdapter = fsAdapter;
    expect(typeof _auth.existsSync).toBe("function");
    expect(typeof _auth.readFileSync).toBe("function");
    expect(typeof _auth.writeFileSync).toBe("function");
    expect(typeof _auth.mkdirSync).toBe("function");
    expect(typeof _auth.unlinkSync).toBe("function");
    expect(typeof _auth.chmodSync).toBe("function");
  });

  it("satisfies FsAdapter interface (config)", () => {
    const _config: FsAdapter = fsAdapter;
    expect(typeof _config.existsSync).toBe("function");
    expect(typeof _config.readFileSync).toBe("function");
  });
});

describe("createGoogleCalendarApi", () => {
  it("delegates calendarList.list to the underlying client", async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: {
        items: [{ id: "cal1", summary: "Test" }],
        nextPageToken: null,
      },
    });
    const mockCalendar = {
      calendarList: { list: mockList },
      events: { list: vi.fn(), get: vi.fn() },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: GoogleCalendarApi = createGoogleCalendarApi(mockCalendar as any);
    const result = await api.calendarList.list();

    expect(mockList).toHaveBeenCalled();
    expect(result.data.items).toEqual([{ id: "cal1", summary: "Test" }]);
    // null nextPageToken should be converted to undefined
    expect(result.data.nextPageToken).toBeUndefined();
  });

  it("delegates events.list to the underlying client", async () => {
    const mockEventsList = vi.fn().mockResolvedValue({
      data: {
        items: [{ id: "evt1", summary: "Meeting" }],
        nextPageToken: "token123",
      },
    });
    const mockCalendar = {
      calendarList: { list: vi.fn() },
      events: { list: mockEventsList, get: vi.fn() },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: GoogleCalendarApi = createGoogleCalendarApi(mockCalendar as any);
    const result = await api.events.list({ calendarId: "primary" });

    expect(mockEventsList).toHaveBeenCalledWith({ calendarId: "primary" });
    expect(result.data.items).toEqual([{ id: "evt1", summary: "Meeting" }]);
    expect(result.data.nextPageToken).toBe("token123");
  });

  it("delegates events.get to the underlying client", async () => {
    const mockEventsGet = vi.fn().mockResolvedValue({
      data: { id: "evt1", summary: "Meeting" },
    });
    const mockCalendar = {
      calendarList: { list: vi.fn() },
      events: { list: vi.fn(), get: mockEventsGet },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: GoogleCalendarApi = createGoogleCalendarApi(mockCalendar as any);
    const result = await api.events.get({ calendarId: "primary", eventId: "evt1" });

    expect(mockEventsGet).toHaveBeenCalledWith({ calendarId: "primary", eventId: "evt1" });
    expect(result.data).toEqual({ id: "evt1", summary: "Meeting" });
  });

  it("passes pageToken parameter to calendarList.list", async () => {
    const mockList = vi.fn().mockResolvedValue({
      data: { items: [], nextPageToken: undefined },
    });
    const mockCalendar = {
      calendarList: { list: mockList },
      events: { list: vi.fn(), get: vi.fn() },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: GoogleCalendarApi = createGoogleCalendarApi(mockCalendar as any);
    await api.calendarList.list({ pageToken: "abc" });

    expect(mockList).toHaveBeenCalledWith({ pageToken: "abc" });
  });
});
