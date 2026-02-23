import { describe, expect, it } from "vitest";
import type { Calendar, CalendarEvent } from "../types/index.ts";
import {
  formatJsonSuccess,
  formatJsonError,
  formatEventListText,
  formatSearchResultText,
  formatCalendarListText,
  formatEventDetailText,
  errorCodeToExitCode,
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
    const events = [makeEvent({ calendar_name: "Work Calendar" })];
    const result = formatEventListText(events);
    expect(result).toContain("(Work Calendar)");
  });

  it("shows [free] tag for transparent timed events", () => {
    const events = [makeEvent({ transparency: "transparent", title: "Focus Time" })];
    const result = formatEventListText(events);
    expect(result).toContain("[free]");
  });

  it("shows [busy] tag for opaque timed events", () => {
    const events = [makeEvent({ transparency: "opaque", title: "Meeting" })];
    const result = formatEventListText(events);
    expect(result).toContain("[busy]");
  });

  it("does not show transparency tag for all-day events", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-01-24",
        end: "2026-01-25",
        title: "Holiday",
        transparency: "opaque",
      }),
    ];
    const result = formatEventListText(events);
    expect(result).not.toContain("[busy]");
    expect(result).not.toContain("[free]");
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
      "  [All Day]     Company Holiday (Main Calendar)",
      "  10:00-11:00   Team Meeting (Main Calendar) [busy]",
      "  14:00-15:00   Focus Time (Work Calendar) [free]",
      "",
      "2026-01-25 (Sun)",
      "  [All Day]     Vacation (Main Calendar)",
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
    expect(result).toContain("2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]");
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

  it("formats all-day events without time range", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-01-24",
        end: "2026-01-25",
        title: "Company Holiday",
        calendar_name: "Main Calendar",
      }),
    ];
    const result = formatSearchResultText("holiday", events);
    expect(result).toContain("2026-01-24 [All Day]     Company Holiday (Main Calendar)");
  });

  it("returns no-results message for empty list", () => {
    const result = formatSearchResultText("nonexistent", []);
    expect(result).toBe('Found 0 events matching "nonexistent".');
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
    expect(result).toContain("[ ] work@group...");
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
      "  [ ] work@group...     Work Main (disabled)",
    ].join("\n");
    expect(result).toBe(expected);
  });
});

describe("formatEventDetailText", () => {
  it("shows event title as header", () => {
    const event = makeEvent({ title: "Team Meeting" });
    const result = formatEventDetailText(event);
    expect(result).toContain("Team Meeting");
  });

  it("shows date and time for timed events", () => {
    const event = makeEvent({
      start: "2026-01-24T10:00:00+09:00",
      end: "2026-01-24T11:00:00+09:00",
    });
    const result = formatEventDetailText(event);
    expect(result).toContain("2026-01-24");
    expect(result).toContain("10:00 - 11:00");
  });

  it("shows All Day for all-day events", () => {
    const event = makeEvent({
      all_day: true,
      start: "2026-01-24",
      end: "2026-01-25",
    });
    const result = formatEventDetailText(event);
    expect(result).toContain("All Day");
  });

  it("shows calendar name", () => {
    const event = makeEvent({ calendar_name: "Work Calendar" });
    const result = formatEventDetailText(event);
    expect(result).toContain("Work Calendar");
  });

  it("shows status and transparency", () => {
    const event = makeEvent({
      status: "confirmed",
      transparency: "transparent",
    });
    const result = formatEventDetailText(event);
    expect(result).toContain("confirmed");
    expect(result).toContain("free");
  });

  it("shows description when present", () => {
    const event = makeEvent({ description: "Discuss Q1 goals" });
    const result = formatEventDetailText(event);
    expect(result).toContain("Discuss Q1 goals");
  });

  it("omits description line when null", () => {
    const event = makeEvent({ description: null });
    const result = formatEventDetailText(event);
    expect(result).not.toContain("Description:");
  });

  it("shows full detail format", () => {
    const event = makeEvent({
      title: "Team Meeting",
      start: "2026-01-24T10:00:00+09:00",
      end: "2026-01-24T11:00:00+09:00",
      all_day: false,
      calendar_name: "Main Calendar",
      status: "confirmed",
      transparency: "opaque",
      description: "Weekly sync",
      html_link: "https://calendar.google.com/event?id=test",
    });
    const result = formatEventDetailText(event);
    const expected = [
      "Team Meeting",
      "",
      "Date:         2026-01-24",
      "Time:         10:00 - 11:00",
      "Calendar:     Main Calendar",
      "Status:       confirmed",
      "Availability: busy",
      "Description:  Weekly sync",
      "",
      "Link: https://calendar.google.com/event?id=test",
    ].join("\n");
    expect(result).toBe(expected);
  });
});

describe("errorCodeToExitCode", () => {
  it("maps AUTH_REQUIRED to exit code 2", () => {
    expect(errorCodeToExitCode("AUTH_REQUIRED")).toBe(2);
  });

  it("maps AUTH_EXPIRED to exit code 2", () => {
    expect(errorCodeToExitCode("AUTH_EXPIRED")).toBe(2);
  });

  it("maps NOT_FOUND to exit code 1", () => {
    expect(errorCodeToExitCode("NOT_FOUND")).toBe(1);
  });

  it("maps INVALID_ARGS to exit code 3", () => {
    expect(errorCodeToExitCode("INVALID_ARGS")).toBe(3);
  });

  it("maps API_ERROR to exit code 1", () => {
    expect(errorCodeToExitCode("API_ERROR")).toBe(1);
  });

  it("maps CONFIG_ERROR to exit code 1", () => {
    expect(errorCodeToExitCode("CONFIG_ERROR")).toBe(1);
  });
});
