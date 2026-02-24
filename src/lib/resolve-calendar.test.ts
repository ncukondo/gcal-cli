import { describe, it, expect, vi } from "vitest";
import { resolveEventCalendar } from "./resolve-calendar.ts";
import { ApiError, type GoogleCalendarApi } from "./api.ts";
import type { CalendarConfig } from "../types/index.ts";

function createMockApi(overrides?: Partial<GoogleCalendarApi>): GoogleCalendarApi {
  return {
    calendarList: { list: vi.fn() },
    events: {
      list: vi.fn(),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    ...overrides,
  };
}

const calendars: CalendarConfig[] = [
  { id: "work@example.com", name: "Work", enabled: true },
  { id: "personal@example.com", name: "Personal", enabled: true },
  { id: "shared@example.com", name: "Shared", enabled: true },
];

describe("resolveEventCalendar", () => {
  it("returns the calendar when event is found in exactly one calendar", async () => {
    const getFn = vi.fn().mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === "personal@example.com") {
        return { data: { id: "evt1", summary: "Test" } };
      }
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    const result = await resolveEventCalendar(api, "evt1", calendars);

    expect(result).toEqual({ id: "personal@example.com", name: "Personal" });
  });

  it("throws NOT_FOUND when event is not found in any calendar", async () => {
    const getFn = vi.fn().mockImplementation(async () => {
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    await expect(resolveEventCalendar(api, "missing", calendars)).rejects.toThrow(ApiError);
    await expect(resolveEventCalendar(api, "missing", calendars)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("includes event ID in NOT_FOUND error message", async () => {
    const getFn = vi.fn().mockImplementation(async () => {
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    const err = await resolveEventCalendar(api, "xyz123", calendars).catch((e: unknown) => e);
    expect((err as ApiError).message).toContain("xyz123");
  });

  it("throws INVALID_ARGS when event is found in multiple calendars", async () => {
    const getFn = vi.fn().mockImplementation(async (params: { calendarId: string }) => {
      if (
        params.calendarId === "work@example.com" ||
        params.calendarId === "personal@example.com"
      ) {
        return { data: { id: "evt1", summary: "Test" } };
      }
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    await expect(resolveEventCalendar(api, "evt1", calendars)).rejects.toThrow(ApiError);
    await expect(resolveEventCalendar(api, "evt1", calendars)).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });

  it("includes calendar list and -c hint in INVALID_ARGS error message", async () => {
    const getFn = vi.fn().mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === "work@example.com" || params.calendarId === "shared@example.com") {
        return { data: { id: "evt1", summary: "Test" } };
      }
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    const err = await resolveEventCalendar(api, "evt1", calendars).catch((e: unknown) => e);
    const msg = (err as ApiError).message;
    expect(msg).toContain("Work (work@example.com)");
    expect(msg).toContain("Shared (shared@example.com)");
    expect(msg).toContain("-c");
  });

  it("propagates non-404 errors (e.g. 401)", async () => {
    const getFn = vi.fn().mockImplementation(async () => {
      const error = new Error("Unauthorized") as Error & { code: number };
      error.code = 401;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    await expect(resolveEventCalendar(api, "evt1", calendars)).rejects.toThrow("Unauthorized");
  });

  it("calls getEvent for each calendar", async () => {
    const getFn = vi.fn().mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === "work@example.com") {
        return { data: { id: "evt1", summary: "Test" } };
      }
      const error = new Error("Not Found") as Error & { code: number };
      error.code = 404;
      throw error;
    });

    const api = createMockApi({ events: { ...createMockApi().events, get: getFn } });

    await resolveEventCalendar(api, "evt1", calendars);

    expect(getFn).toHaveBeenCalledTimes(3);
    expect(getFn).toHaveBeenCalledWith({ calendarId: "work@example.com", eventId: "evt1" });
    expect(getFn).toHaveBeenCalledWith({ calendarId: "personal@example.com", eventId: "evt1" });
    expect(getFn).toHaveBeenCalledWith({ calendarId: "shared@example.com", eventId: "evt1" });
  });
});
