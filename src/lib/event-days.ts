import type { CalendarEvent } from "../types/index.ts";
import { addDaysToDateString } from "./date-utils.ts";

/** Inclusive range of calendar dates (YYYY-MM-DD) to display. */
export interface DayRange {
  from: string;
  to: string;
}

/** One calendar day occupied by an event. */
export interface EventDay {
  date: string;
  event: CalendarEvent;
  /** 1-based position within the event's own span, independent of any clipping. */
  dayIndex: number;
  /** Total number of days the event occupies. */
  dayCount: number;
  /** "HH:MM" the event occupies from on this day; "" for all-day events. */
  startTime: string;
  /** "HH:MM" the event occupies until on this day ("24:00" when it continues); "" for all-day events. */
  endTime: string;
}

const DAY_START = "00:00";
const DAY_END = "24:00";

function daysBetween(from: string, to: string): number {
  const start = Date.parse(from + "T00:00:00Z");
  const end = Date.parse(to + "T00:00:00Z");
  return Math.round((end - start) / 86_400_000);
}

interface Span {
  lastDate: string;
  firstStartTime: string;
  lastEndTime: string;
}

/**
 * Resolve the last calendar date an event occupies, plus its times on the
 * boundary days. Event date strings are already formatted in the display
 * timezone, so plain string arithmetic is enough.
 */
function resolveSpan(event: CalendarEvent): Span {
  const startDate = event.start.slice(0, 10);

  if (event.all_day) {
    // The API reports all-day `end` as exclusive: 12-05..12-07 is two days.
    const lastDate = addDaysToDateString(event.end, -1);
    return {
      lastDate: lastDate < startDate ? startDate : lastDate,
      firstStartTime: "",
      lastEndTime: "",
    };
  }

  const endDate = event.end.slice(0, 10);
  const endTime = event.end.slice(11, 16);
  const firstStartTime = event.start.slice(11, 16);

  // An event ending exactly at midnight does not occupy the following day.
  if (endTime === DAY_START) {
    const lastDate = addDaysToDateString(endDate, -1);
    if (lastDate >= startDate) {
      return { lastDate, firstStartTime, lastEndTime: DAY_END };
    }
    return { lastDate: startDate, firstStartTime, lastEndTime: endTime };
  }

  return {
    lastDate: endDate < startDate ? startDate : endDate,
    firstStartTime,
    lastEndTime: endTime,
  };
}

/**
 * Expand each event into one entry per calendar day it occupies, sorted by
 * date. Events on the same date keep their input order. When `range` is given,
 * days outside it are dropped while `dayIndex`/`dayCount` still describe the
 * full event.
 */
export function expandEventsByDay(events: CalendarEvent[], range?: DayRange): EventDay[] {
  const days: EventDay[] = [];

  for (const event of events) {
    const startDate = event.start.slice(0, 10);
    const { lastDate, firstStartTime, lastEndTime } = resolveSpan(event);
    const dayCount = daysBetween(startDate, lastDate) + 1;

    for (let i = 0; i < dayCount; i++) {
      const date = addDaysToDateString(startDate, i);
      if (range && (date < range.from || date > range.to)) continue;

      const isFirst = i === 0;
      const isLast = i === dayCount - 1;
      days.push({
        date,
        event,
        dayIndex: i + 1,
        dayCount,
        startTime: event.all_day ? "" : isFirst ? firstStartTime : DAY_START,
        endTime: event.all_day ? "" : isLast ? lastEndTime : DAY_END,
      });
    }
  }

  // Array.prototype.sort is stable, so same-date entries keep their input order.
  return days.sort((a, b) => a.date.localeCompare(b.date));
}
