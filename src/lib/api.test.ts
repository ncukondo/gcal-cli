import { describe, it, expect } from "vitest";
import { normalizeEvent, normalizeCalendar } from "./api.ts";

describe("normalizeEvent", () => {
  it("handles all-day events (date field)", () => {
    const googleEvent = {
      id: "evt1",
      summary: "All Day Event",
      description: "A full day event",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
      htmlLink: "https://calendar.google.com/event?eid=evt1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-01T12:00:00.000Z",
    };

    const result = normalizeEvent(googleEvent, "cal1", "My Calendar");

    expect(result).toEqual({
      id: "evt1",
      title: "All Day Event",
      description: "A full day event",
      start: "2024-03-15",
      end: "2024-03-16",
      all_day: true,
      calendar_id: "cal1",
      calendar_name: "My Calendar",
      html_link: "https://calendar.google.com/event?eid=evt1",
      status: "confirmed",
      transparency: "opaque",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-01T12:00:00.000Z",
    });
  });

  it("handles timed events (dateTime field with offset)", () => {
    const googleEvent = {
      id: "evt2",
      summary: "Meeting",
      description: null,
      start: { dateTime: "2024-03-15T09:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2024-03-15T10:00:00+09:00", timeZone: "Asia/Tokyo" },
      htmlLink: "https://calendar.google.com/event?eid=evt2",
      status: "tentative",
      transparency: "transparent",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-02T08:00:00.000Z",
    };

    const result = normalizeEvent(googleEvent, "cal2", "Work");

    expect(result).toEqual({
      id: "evt2",
      title: "Meeting",
      description: null,
      start: "2024-03-15T09:00:00+09:00",
      end: "2024-03-15T10:00:00+09:00",
      all_day: false,
      calendar_id: "cal2",
      calendar_name: "Work",
      html_link: "https://calendar.google.com/event?eid=evt2",
      status: "tentative",
      transparency: "transparent",
      created: "2024-03-01T10:00:00.000Z",
      updated: "2024-03-02T08:00:00.000Z",
    });
  });

  it("defaults missing fields", () => {
    const googleEvent = {
      id: "evt3",
      start: { date: "2024-03-15" },
      end: { date: "2024-03-16" },
    };

    const result = normalizeEvent(googleEvent, "cal1", "Cal");

    expect(result.title).toBe("");
    expect(result.description).toBeNull();
    expect(result.html_link).toBe("");
    expect(result.status).toBe("confirmed");
    expect(result.transparency).toBe("opaque");
    expect(result.created).toBe("");
    expect(result.updated).toBe("");
  });
});

describe("normalizeCalendar", () => {
  it("maps Google API fields to internal Calendar type", () => {
    const googleCalendar = {
      id: "primary",
      summary: "My Calendar",
      description: "Personal calendar",
      primary: true,
    };

    const result = normalizeCalendar(googleCalendar);

    expect(result).toEqual({
      id: "primary",
      name: "My Calendar",
      description: "Personal calendar",
      primary: true,
      enabled: true,
    });
  });

  it("defaults missing fields", () => {
    const googleCalendar = {
      id: "cal2",
      summary: "Work",
    };

    const result = normalizeCalendar(googleCalendar);

    expect(result).toEqual({
      id: "cal2",
      name: "Work",
      description: null,
      primary: false,
      enabled: true,
    });
  });
});
