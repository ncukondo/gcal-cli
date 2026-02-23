import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../types/index.ts";
import {
  formatJsonSuccess,
  formatJsonError,
  formatError,
  formatSuccess,
  formatEventListText,
} from "./output.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-id",
    title: "Test Event",
    description: null,
    start: "2026-01-24T10:00:00+09:00",
    end: "2026-01-24T11:00:00+09:00",
    all_day: false,
    calendar_id: "primary",
    calendar_name: "Main Calendar",
    html_link: "https://calendar.google.com/event?id=test",
    status: "confirmed",
    transparency: "opaque",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatSuccess", () => {
  it("returns JSON string for json format", () => {
    const result = formatSuccess({ key: "value" }, "json");
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("returns string representation for text format", () => {
    const result = formatSuccess("hello", "text");
    expect(result).toBe("hello");
  });
});

describe("formatError", () => {
  it("returns JSON error for json format", () => {
    const result = formatError(1, "something failed", "json");
    expect(JSON.parse(result)).toEqual({
      error: { code: 1, message: "something failed" },
    });
  });

  it("returns text error for text format", () => {
    const result = formatError(1, "something failed", "text");
    expect(result).toBe("Error: something failed");
  });
});

describe("formatJsonSuccess", () => {
  it("wraps data in success envelope", () => {
    const data = { events: [], count: 0 };
    const result = formatJsonSuccess(data);
    expect(JSON.parse(result)).toEqual({
      success: true,
      data: { events: [], count: 0 },
    });
  });

  it("preserves nested data structures", () => {
    const data = { event: { id: "abc", title: "Test" }, message: "Created" };
    const result = formatJsonSuccess(data);
    expect(JSON.parse(result)).toEqual({
      success: true,
      data: { event: { id: "abc", title: "Test" }, message: "Created" },
    });
  });
});

describe("formatJsonError", () => {
  it("wraps error in failure envelope with code and message", () => {
    const result = formatJsonError("AUTH_REQUIRED", "Not authenticated");
    expect(JSON.parse(result)).toEqual({
      success: false,
      error: { code: "AUTH_REQUIRED", message: "Not authenticated" },
    });
  });

  it("supports all error codes", () => {
    const result = formatJsonError("NOT_FOUND", "Event not found");
    expect(JSON.parse(result)).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Event not found" },
    });
  });
});

describe("formatEventListText", () => {
  it("groups events by date with YYYY-MM-DD (Day) header", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Meeting",
      }),
      makeEvent({
        start: "2026-01-25T14:00:00+09:00",
        end: "2026-01-25T15:00:00+09:00",
        title: "Review",
      }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("2026-01-24 (Sat)");
    expect(result).toContain("2026-01-25 (Sun)");
  });

  it("formats all-day events as [All Day]", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-01-24",
        end: "2026-01-25",
        title: "Company Holiday",
      }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("[All Day]");
    expect(result).toContain("Company Holiday");
  });

  it("formats timed events as HH:MM-HH:MM", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
      }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("10:00-11:00");
    expect(result).toContain("Team Meeting");
  });

  it("shows calendar name in parentheses", () => {
    const events = [
      makeEvent({ calendar_name: "Work Calendar" }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("(Work Calendar)");
  });

  it("shows transparency tag for non-opaque events", () => {
    const events = [
      makeEvent({ transparency: "transparent", title: "Focus Time" }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("[free]");
  });

  it("shows [busy] tag for opaque events", () => {
    const events = [
      makeEvent({ transparency: "opaque", title: "Meeting" }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("[busy]");
  });

  it("returns empty string for empty event list", () => {
    const result = formatEventListText([]);
    expect(result).toBe("");
  });

  it("matches spec output format", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-01-24",
        end: "2026-01-25",
        title: "Company Holiday",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
      makeEvent({
        start: "2026-01-24T14:00:00+09:00",
        end: "2026-01-24T15:00:00+09:00",
        title: "Focus Time",
        calendar_name: "Work Calendar",
        transparency: "transparent",
      }),
      makeEvent({
        all_day: true,
        start: "2026-01-25",
        end: "2026-01-26",
        title: "Vacation",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
    ];
    const result = formatEventListText(events);
    const expected = [
      "2026-01-24 (Sat)",
      "  [All Day]     Company Holiday (Main Calendar) [busy]",
      "  10:00-11:00   Team Meeting (Main Calendar) [busy]",
      "  14:00-15:00   Focus Time (Work Calendar) [free]",
      "",
      "2026-01-25 (Sun)",
      "  [All Day]     Vacation (Main Calendar) [busy]",
    ].join("\n");
    expect(result).toBe(expected);
  });
});
