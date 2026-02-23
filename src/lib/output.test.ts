import { describe, expect, it } from "vitest";
import type { Calendar, CalendarEvent } from "../types/index.ts";
import {
  formatJsonSuccess,
  formatJsonError,
  formatError,
  formatSuccess,
  formatEventListText,
  formatSearchResultText,
  formatCalendarListText,
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

describe("formatSearchResultText", () => {
  it("shows match count and query in header", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
      }),
    ];
    const result = formatSearchResultText("meeting", events);
    expect(result).toContain('Found 1 event matching "meeting"');
  });

  it("uses plural form for multiple matches", () => {
    const events = [
      makeEvent({ title: "Meeting 1" }),
      makeEvent({ title: "Meeting 2" }),
      makeEvent({ title: "Meeting 3" }),
    ];
    const result = formatSearchResultText("meeting", events);
    expect(result).toContain('Found 3 events matching "meeting"');
  });

  it("shows flat event list with date and time", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
    ];
    const result = formatSearchResultText("meeting", events);
    expect(result).toContain(
      "2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]",
    );
  });

  it("matches spec output format", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
      makeEvent({
        start: "2026-01-28T09:00:00+09:00",
        end: "2026-01-28T10:00:00+09:00",
        title: "Project Meeting",
        calendar_name: "Main Calendar",
        transparency: "opaque",
      }),
    ];
    const result = formatSearchResultText("meeting", events);
    const expected = [
      'Found 2 events matching "meeting":',
      "",
      "2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]",
      "2026-01-28 09:00-10:00  Project Meeting (Main Calendar) [busy]",
    ].join("\n");
    expect(result).toBe(expected);
  });

  it("returns no-results message for empty list", () => {
    const result = formatSearchResultText("nonexistent", []);
    expect(result).toContain('Found 0 events matching "nonexistent"');
  });
});

describe("formatCalendarListText", () => {
  const calendars: Calendar[] = [
    {
      id: "primary",
      name: "Main Calendar",
      description: null,
      primary: true,
      enabled: true,
    },
    {
      id: "family@group.calendar.google.com",
      name: "Family",
      description: null,
      primary: false,
      enabled: true,
    },
    {
      id: "work@group.calendar.google.com",
      name: "Work Main",
      description: null,
      primary: false,
      enabled: false,
    },
  ];

  it("shows [x] for enabled calendars", () => {
    const result = formatCalendarListText(calendars);
    expect(result).toContain("[x] primary");
  });

  it("shows [ ] for disabled calendars", () => {
    const result = formatCalendarListText(calendars);
    expect(result).toContain("[ ] work@group.");
  });

  it("truncates long calendar IDs with ellipsis", () => {
    const result = formatCalendarListText(calendars);
    expect(result).toContain("family@group...");
  });

  it("shows (disabled) suffix for disabled calendars", () => {
    const result = formatCalendarListText(calendars);
    expect(result).toContain("(disabled)");
  });

  it("matches spec output format", () => {
    const result = formatCalendarListText(calendars);
    const expected = [
      "Calendars:",
      "  [x] primary           Main Calendar",
      "  [x] family@group...   Family",
      "  [ ] work@group.c...   Work Main (disabled)",
    ].join("\n");
    expect(result).toBe(expected);
  });
});
