import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../types/index.ts";
import { expandEventsByDay } from "./event-days.ts";

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

describe("expandEventsByDay", () => {
  describe("all-day events", () => {
    it("expands a single-day all-day event to one entry", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-06" });
      const result = expandEventsByDay([event]);
      expect(result).toEqual([
        { date: "2026-12-05", event, dayIndex: 1, dayCount: 1, startTime: "", endTime: "" },
      ]);
    });

    it("expands a two-day all-day event to both days (end is exclusive)", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-07" });
      const result = expandEventsByDay([event]);
      expect(result.map((d) => d.date)).toEqual(["2026-12-05", "2026-12-06"]);
      expect(result.map((d) => d.dayIndex)).toEqual([1, 2]);
      expect(result.every((d) => d.dayCount === 2)).toBe(true);
    });

    it("expands an all-day event spanning a month boundary", () => {
      const event = makeEvent({ all_day: true, start: "2026-11-29", end: "2026-12-02" });
      const result = expandEventsByDay([event]);
      expect(result.map((d) => d.date)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
      expect(result.map((d) => d.dayIndex)).toEqual([1, 2, 3]);
      expect(result.every((d) => d.dayCount === 3)).toBe(true);
    });

    it("treats a malformed all-day event with end <= start as a single day", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-05" });
      const result = expandEventsByDay([event]);
      expect(result.map((d) => d.date)).toEqual(["2026-12-05"]);
      expect(result[0]?.dayCount).toBe(1);
    });
  });

  describe("timed events", () => {
    it("expands a same-day timed event to one entry with its own times", () => {
      const event = makeEvent({
        start: "2026-12-05T10:00:00+09:00",
        end: "2026-12-05T11:00:00+09:00",
      });
      const result = expandEventsByDay([event]);
      expect(result).toEqual([
        {
          date: "2026-12-05",
          event,
          dayIndex: 1,
          dayCount: 1,
          startTime: "10:00",
          endTime: "11:00",
        },
      ]);
    });

    it("splits an event crossing midnight into each day's occupied range", () => {
      const event = makeEvent({
        start: "2026-12-05T23:00:00+09:00",
        end: "2026-12-06T01:00:00+09:00",
      });
      const result = expandEventsByDay([event]);
      expect(result).toEqual([
        {
          date: "2026-12-05",
          event,
          dayIndex: 1,
          dayCount: 2,
          startTime: "23:00",
          endTime: "24:00",
        },
        {
          date: "2026-12-06",
          event,
          dayIndex: 2,
          dayCount: 2,
          startTime: "00:00",
          endTime: "01:00",
        },
      ]);
    });

    it("gives full-day ranges to middle days of a multi-day timed event", () => {
      const event = makeEvent({
        start: "2026-12-05T23:00:00+09:00",
        end: "2026-12-08T01:00:00+09:00",
      });
      const result = expandEventsByDay([event]);
      expect(result.map((d) => [d.date, d.startTime, d.endTime])).toEqual([
        ["2026-12-05", "23:00", "24:00"],
        ["2026-12-06", "00:00", "24:00"],
        ["2026-12-07", "00:00", "24:00"],
        ["2026-12-08", "00:00", "01:00"],
      ]);
    });

    it("does not create a group for the next day when the event ends at midnight", () => {
      const event = makeEvent({
        start: "2026-12-05T22:00:00+09:00",
        end: "2026-12-06T00:00:00+09:00",
      });
      const result = expandEventsByDay([event]);
      expect(result).toEqual([
        {
          date: "2026-12-05",
          event,
          dayIndex: 1,
          dayCount: 1,
          startTime: "22:00",
          endTime: "24:00",
        },
      ]);
    });

    it("keeps a zero-length event at midnight on its own day", () => {
      const event = makeEvent({
        start: "2026-12-05T00:00:00+09:00",
        end: "2026-12-05T00:00:00+09:00",
      });
      const result = expandEventsByDay([event]);
      expect(result.map((d) => [d.date, d.startTime, d.endTime])).toEqual([
        ["2026-12-05", "00:00", "00:00"],
      ]);
    });
  });

  describe("range clipping", () => {
    it("drops days outside the range but keeps the original day numbering", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-08" });
      const result = expandEventsByDay([event], { from: "2026-12-06", to: "2026-12-06" });
      expect(result).toEqual([
        { date: "2026-12-06", event, dayIndex: 2, dayCount: 3, startTime: "", endTime: "" },
      ]);
    });

    it("returns nothing when the event falls entirely outside the range", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-06" });
      const result = expandEventsByDay([event], { from: "2026-12-10", to: "2026-12-12" });
      expect(result).toEqual([]);
    });

    it("keeps every day when the range covers the whole event", () => {
      const event = makeEvent({ all_day: true, start: "2026-12-05", end: "2026-12-07" });
      const result = expandEventsByDay([event], { from: "2026-12-01", to: "2026-12-31" });
      expect(result.map((d) => d.date)).toEqual(["2026-12-05", "2026-12-06"]);
    });
  });

  describe("ordering", () => {
    it("sorts entries by date ascending", () => {
      const spanning = makeEvent({
        id: "spanning",
        all_day: true,
        start: "2026-12-05",
        end: "2026-12-08",
      });
      const later = makeEvent({
        id: "later",
        start: "2026-12-06T09:00:00+09:00",
        end: "2026-12-06T10:00:00+09:00",
      });
      const result = expandEventsByDay([spanning, later]);
      expect(result.map((d) => [d.date, d.event.id])).toEqual([
        ["2026-12-05", "spanning"],
        ["2026-12-06", "spanning"],
        ["2026-12-06", "later"],
        ["2026-12-07", "spanning"],
      ]);
    });

    it("preserves input order among events on the same date", () => {
      const first = makeEvent({
        id: "first",
        start: "2026-12-05T09:00:00+09:00",
        end: "2026-12-05T10:00:00+09:00",
      });
      const second = makeEvent({
        id: "second",
        start: "2026-12-05T11:00:00+09:00",
        end: "2026-12-05T12:00:00+09:00",
      });
      const result = expandEventsByDay([first, second]);
      expect(result.map((d) => d.event.id)).toEqual(["first", "second"]);
    });

    it("returns an empty array for no events", () => {
      expect(expandEventsByDay([])).toEqual([]);
    });
  });
});
