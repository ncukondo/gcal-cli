import { describe, expect, it, vi } from "vitest";
import type { CalendarConfig, CalendarEvent } from "../types/index.ts";
import { ApiError } from "./api.ts";
import { fetchFromCalendars } from "./multi-calendar.ts";

function makeEvent(id: string, calendar: CalendarConfig): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    description: null,
    start: "2026-02-23T10:00:00+09:00",
    end: "2026-02-23T11:00:00+09:00",
    all_day: false,
    calendar_id: calendar.id,
    calendar_name: calendar.name,
    html_link: `https://calendar.google.com/event/${id}`,
    status: "confirmed",
    transparency: "opaque",
    attendees: [],
    meet_link: null,
    conference: null,
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
  };
}

const main: CalendarConfig = { id: "primary", name: "Main Calendar", enabled: true };
const work: CalendarConfig = { id: "work@group.calendar.google.com", name: "Work", enabled: true };

describe("fetchFromCalendars", () => {
  it("collects events from every calendar and reports no failures", async () => {
    const writeErr = vi.fn();

    const result = await fetchFromCalendars(
      [main, work],
      async (cal) => [makeEvent(cal.id, cal)],
      writeErr,
    );

    expect(result.events.map((e) => e.id)).toEqual(["primary", "work@group.calendar.google.com"]);
    expect(result.failedCalendars).toEqual([]);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it("keeps the events it could fetch and describes the failed calendar", async () => {
    const writeErr = vi.fn();

    const result = await fetchFromCalendars(
      [main, work],
      async (cal) => {
        if (cal.id === work.id) throw new ApiError("RATE_LIMITED", "Rate Limit Exceeded");
        return [makeEvent(cal.id, cal)];
      },
      writeErr,
    );

    expect(result.events).toHaveLength(1);
    expect(result.failedCalendars).toEqual([
      {
        id: work.id,
        name: "Work",
        error: { code: "RATE_LIMITED", message: "Rate Limit Exceeded" },
      },
    ]);
    expect(writeErr).toHaveBeenCalledWith(
      expect.stringContaining('failed to fetch calendar "Work"'),
    );
  });

  it("codes a non-ApiError failure as API_ERROR", async () => {
    const result = await fetchFromCalendars(
      [main, work],
      async (cal) => {
        if (cal.id === work.id) throw new Error("socket hang up");
        return [makeEvent(cal.id, cal)];
      },
      () => {},
    );

    expect(result.failedCalendars[0]!.error).toEqual({
      code: "API_ERROR",
      message: "socket hang up",
    });
  });

  it("rethrows the first error when every calendar fails", async () => {
    const first = new ApiError("RATE_LIMITED", "Rate Limit Exceeded");

    await expect(
      fetchFromCalendars(
        [main, work],
        async (cal) => {
          throw cal.id === main.id ? first : new ApiError("FORBIDDEN", "Insufficient permission");
        },
        () => {},
      ),
    ).rejects.toBe(first);
  });

  it("returns an empty result for an empty calendar list", async () => {
    const fetch = vi.fn();

    const result = await fetchFromCalendars([], fetch, () => {});

    expect(result).toEqual({ events: [], failedCalendars: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
