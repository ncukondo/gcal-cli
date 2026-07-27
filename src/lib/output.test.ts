import { describe, expect, it } from "vitest";
import type { Calendar, CalendarEvent } from "../types/index.ts";
import {
  formatJsonSuccess,
  formatJsonError,
  formatEventListText,
  formatSearchResultText,
  formatCalendarListText,
  formatEventDetailText,
  formatQuietText,
  formatHiddenAllDayWarning,
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

  it("shows correct day of week regardless of runtime timezone", () => {
    // Verify getDayOfWeek uses UTC-based calculation by checking
    // 2026-12-31 = Thursday, not runtime-local getDay() which can
    // shift under extreme offsets (e.g. UTC+14 where UTC noon = next local day)
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-12-31",
        end: "2027-01-01",
        title: "New Year Eve",
      }),
    ];
    const result = formatEventListText(events);
    // 2026-12-31 is a Thursday
    expect(result).toContain("2026-12-31 (Thu)");
  });

  it("shows [busy] tag for opaque all-day events", () => {
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
    expect(result).toContain("[busy]");
  });

  // Google Calendar marks all-day events as free by default, so the tag is the
  // only on-screen clue that --busy would hide them.
  it("shows [free] tag for transparent all-day events", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-09-05",
        end: "2026-09-07",
        title: "学会",
        transparency: "transparent",
      }),
    ];
    const result = formatEventListText(events);
    expect(result).toContain("  [All Day 1/2]   学会 (Main Calendar) [free]");
    expect(result).toContain("  [All Day 2/2]   学会 (Main Calendar) [free]");
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

  describe("multi-day events", () => {
    it("shows a multi-day all-day event under every day it occupies", () => {
      const events = [
        makeEvent({
          all_day: true,
          start: "2026-12-05",
          end: "2026-12-07",
          title: "Aコース",
        }),
      ];
      const result = formatEventListText(events);
      const expected = [
        "2026-12-05 (Sat)",
        "  [All Day 1/2]   Aコース (Main Calendar) [busy]",
        "",
        "2026-12-06 (Sun)",
        "  [All Day 2/2]   Aコース (Main Calendar) [busy]",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("keeps [All Day] without a counter for single-day all-day events", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-06", title: "Holiday" }),
      ];
      expect(formatEventListText(events)).toContain("[All Day]  ");
      expect(formatEventListText(events)).not.toContain("1/1");
    });

    it("widens the time column so multi-day labels stay aligned", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-07", title: "Aコース" }),
        makeEvent({
          start: "2026-12-05T10:00:00+09:00",
          end: "2026-12-05T11:00:00+09:00",
          title: "Team Meeting",
        }),
      ];
      const result = formatEventListText(events);
      const expected = [
        "2026-12-05 (Sat)",
        "  [All Day 1/2]   Aコース (Main Calendar) [busy]",
        "  10:00-11:00     Team Meeting (Main Calendar) [busy]",
        "",
        "2026-12-06 (Sun)",
        "  [All Day 2/2]   Aコース (Main Calendar) [busy]",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("splits a timed event crossing midnight into each day's occupied range", () => {
      const events = [
        makeEvent({
          start: "2026-12-05T23:00:00+09:00",
          end: "2026-12-06T01:00:00+09:00",
          title: "Night Shift",
        }),
      ];
      const result = formatEventListText(events);
      const expected = [
        "2026-12-05 (Sat)",
        "  23:00-24:00   Night Shift (Main Calendar) [busy]",
        "",
        "2026-12-06 (Sun)",
        "  00:00-01:00   Night Shift (Main Calendar) [busy]",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("orders day groups chronologically when a span interleaves other events", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-08", title: "Aコース" }),
        makeEvent({
          start: "2026-12-06T09:00:00+09:00",
          end: "2026-12-06T10:00:00+09:00",
          title: "Team Meeting",
        }),
      ];
      const result = formatEventListText(events);
      const dayHeaders = result.split("\n").filter((line) => line.startsWith("2026-"));
      expect(dayHeaders).toEqual(["2026-12-05 (Sat)", "2026-12-06 (Sun)", "2026-12-07 (Mon)"]);
      expect(result).toContain("  [All Day 2/3]   Aコース (Main Calendar) [busy]");
      expect(result).toContain("  09:00-10:00     Team Meeting (Main Calendar) [busy]");
    });
  });

  describe("range clipping", () => {
    it("shows only the requested day but keeps the original day number", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-08", title: "Aコース" }),
      ];
      const result = formatEventListText(events, { from: "2026-12-06", to: "2026-12-06" });
      const expected = [
        "2026-12-06 (Sun)",
        "  [All Day 2/3]   Aコース (Main Calendar) [busy]",
      ].join("\n");
      expect(result).toBe(expected);
    });

    it("does not create day groups outside the range", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-08", title: "Aコース" }),
      ];
      const result = formatEventListText(events, { from: "2026-12-06", to: "2026-12-07" });
      expect(result).not.toContain("2026-12-05");
      expect(result).toContain("2026-12-06");
      expect(result).toContain("2026-12-07");
    });

    it("returns an empty string when nothing falls inside the range", () => {
      const events = [
        makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-06", title: "Aコース" }),
      ];
      expect(formatEventListText(events, { from: "2026-12-10", to: "2026-12-12" })).toBe("");
    });
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
    expect(result).toContain("2026-01-24 [All Day]    Company Holiday (Main Calendar) [busy]");
  });

  it("annotates the period on multi-day all-day events", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-12-05",
        end: "2026-12-07",
        title: "Aコース",
        calendar_name: "Main Calendar",
      }),
    ];
    const result = formatSearchResultText("A", events);
    expect(result).toContain("2026-12-05 [All Day 12/05-12/06]  Aコース (Main Calendar) [busy]");
  });

  it("annotates the end date on timed events crossing midnight", () => {
    const events = [
      makeEvent({
        start: "2026-12-05T23:00:00+09:00",
        end: "2026-12-06T01:00:00+09:00",
        title: "Night Shift",
        calendar_name: "Main Calendar",
      }),
    ];
    const result = formatSearchResultText("night", events);
    expect(result).toContain("2026-12-05 23:00-12/06 01:00  Night Shift (Main Calendar) [busy]");
  });

  it("keeps single-day rows unpadded when no multi-day event is present", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
      }),
    ];
    const result = formatSearchResultText("meeting", events);
    expect(result).toContain("2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]");
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

  it("shows date range for multi-day all-day events (end exclusive)", () => {
    const event = makeEvent({
      all_day: true,
      start: "2026-01-24",
      end: "2026-01-26", // Google exclusive end = 2 day event (24th-25th)
    });
    const result = formatEventDetailText(event);
    expect(result).toContain("2026-01-24 - 2026-01-25");
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

describe("formatQuietText", () => {
  it("formats timed events as MM/DD HH:MM-HH:MM Title", () => {
    const events = [
      makeEvent({
        start: "2026-01-24T10:00:00+09:00",
        end: "2026-01-24T11:00:00+09:00",
        title: "Team Meeting",
      }),
    ];
    const result = formatQuietText(events);
    expect(result).toBe("01/24 10:00-11:00  Team Meeting");
  });

  it("formats all-day events as MM/DD All day Title", () => {
    const events = [
      makeEvent({
        all_day: true,
        start: "2026-01-24",
        end: "2026-01-25",
        title: "Company Holiday",
      }),
    ];
    const result = formatQuietText(events);
    expect(result).toBe("01/24 All day      Company Holiday");
  });

  it("returns 'No events found.' for empty list", () => {
    const result = formatQuietText([]);
    expect(result).toBe("No events found.");
  });

  it("formats multiple events separated by newlines", () => {
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
    const result = formatQuietText(events);
    expect(result).toContain("01/24 10:00-11:00  Meeting");
    expect(result).toContain("01/25 14:00-15:00  Review");
  });

  it("keeps one line per event when no range is given (search)", () => {
    const events = [
      makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-07", title: "Aコース" }),
    ];
    expect(formatQuietText(events)).toBe("12/05 All day      Aコース");
  });

  it("expands multi-day events to one line per day when a range is given", () => {
    const events = [
      makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-07", title: "Aコース" }),
    ];
    const result = formatQuietText(events, { from: "2026-12-01", to: "2026-12-31" });
    expect(result).toBe(["12/05 All day      Aコース", "12/06 All day      Aコース"].join("\n"));
  });

  it("clips expanded days to the range", () => {
    const events = [
      makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-08", title: "Aコース" }),
    ];
    const result = formatQuietText(events, { from: "2026-12-06", to: "2026-12-06" });
    expect(result).toBe("12/06 All day      Aコース");
  });

  it("shows each day's occupied range for a timed event crossing midnight", () => {
    const events = [
      makeEvent({
        start: "2026-12-05T23:00:00+09:00",
        end: "2026-12-06T01:00:00+09:00",
        title: "Night Shift",
      }),
    ];
    const result = formatQuietText(events, { from: "2026-12-01", to: "2026-12-31" });
    expect(result).toBe(
      ["12/05 23:00-24:00  Night Shift", "12/06 00:00-01:00  Night Shift"].join("\n"),
    );
  });

  it("returns 'No events found.' when the range excludes everything", () => {
    const events = [
      makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-06", title: "Aコース" }),
    ];
    expect(formatQuietText(events, { from: "2026-12-10", to: "2026-12-12" })).toBe(
      "No events found.",
    );
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

describe("formatHiddenAllDayWarning", () => {
  function allDay(title: string, start: string): CalendarEvent {
    return makeEvent({ all_day: true, start, end: start, title, transparency: "transparent" });
  }

  it("lists the count and the title of each hidden event", () => {
    const result = formatHiddenAllDayWarning([
      allDay("日本看護研究学会第52回学術集会", "2026-09-05"),
      allDay("【宿泊】ホテルココ・グラン高崎", "2026-09-05"),
    ]);
    expect(result).toBe(
      [
        "Note: 2 all-day events are hidden by --busy (Google Calendar marks all-day events as free by default):",
        "  2026-09-05  日本看護研究学会第52回学術集会",
        "  2026-09-05  【宿泊】ホテルココ・グラン高崎",
      ].join("\n"),
    );
  });

  it("uses singular wording for a single event", () => {
    const result = formatHiddenAllDayWarning([allDay("学会", "2026-09-05")]);
    expect(result).toContain("1 all-day event is hidden by --busy");
  });

  it("caps the list at 5 entries and reports the remainder", () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      allDay(`Event ${i + 1}`, `2026-09-0${i + 1}`),
    );
    const result = formatHiddenAllDayWarning(events);
    const lines = result.split("\n");
    expect(lines[0]).toContain("8 all-day events are hidden");
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain("Event 1");
    expect(lines[5]).toContain("Event 5");
    expect(lines[6]).toBe("  ... and 3 more");
  });

  it("returns an empty string when nothing is hidden", () => {
    expect(formatHiddenAllDayWarning([])).toBe("");
  });
});
