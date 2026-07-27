import type { Calendar, CalendarEvent, ErrorCode } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { expandEventsByDay, type DayRange, type EventDay } from "./event-days.ts";

export type { DayRange } from "./event-days.ts";

export function formatJsonSuccess(data: unknown): string {
  return JSON.stringify({ success: true, data }, null, 2);
}

export function formatJsonError(code: ErrorCode, message: string): string {
  return JSON.stringify({ success: false, error: { code, message } }, null, 2);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Width of `HH:MM-HH:MM`; wider labels grow the column for the whole output. */
const TIME_COL_MIN_WIDTH = 11;

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return DAY_NAMES[date.getUTCDay()] ?? "???";
}

/** "2026-12-06" -> "12/06" */
function toMonthDay(dateStr: string): string {
  return `${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)}`;
}

function timeColumnWidth(labels: string[]): number {
  return Math.max(TIME_COL_MIN_WIDTH, ...labels.map((label) => label.length));
}

/**
 * Label for one day of an event: the portion of that day the event occupies,
 * or `[All Day n/m]` when an all-day event spans several days.
 */
export function formatTimeRange(day: EventDay): string {
  if (day.event.all_day) {
    return day.dayCount === 1 ? "[All Day]" : `[All Day ${day.dayIndex}/${day.dayCount}]`;
  }
  return `${day.startTime}-${day.endTime}`;
}

/**
 * Label for a whole event on a single line. Search lists one row per event
 * rather than per day, so a multi-day span is annotated inline.
 */
function formatEventSpanLabel(event: CalendarEvent): string {
  const days = expandEventsByDay([event]);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";

  if (event.all_day) {
    return days.length === 1
      ? "[All Day]"
      : `[All Day ${toMonthDay(first.date)}-${toMonthDay(last.date)}]`;
  }
  return first.date === last.date
    ? `${first.startTime}-${last.endTime}`
    : `${first.startTime}-${toMonthDay(last.date)} ${last.endTime}`;
}

function transparencyTag(event: CalendarEvent): string {
  return event.transparency === "transparent" ? "[free]" : "[busy]";
}

/**
 * Group events by the days they occupy. Events spanning several days appear
 * under each of them; `range` limits which days are rendered.
 */
export function formatEventListText(events: CalendarEvent[], range?: DayRange): string {
  const days = expandEventsByDay(events, range);
  if (days.length === 0) return "";

  const labels = days.map(formatTimeRange);
  const width = timeColumnWidth(labels);

  const groups = new Map<string, string[]>();
  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    const { event } = day;
    const time = labels[i]!.padEnd(width);
    const line = `  ${time}   ${event.title} (${event.calendar_name}) ${transparencyTag(event)}`;

    const group = groups.get(day.date);
    if (group) {
      group.push(line);
    } else {
      groups.set(day.date, [line]);
    }
  }

  const lines: string[] = [];
  let first = true;
  for (const [date, groupLines] of groups) {
    if (!first) lines.push("");
    first = false;
    lines.push(`${date} (${getDayOfWeek(date)})`);
    lines.push(...groupLines);
  }

  return lines.join("\n");
}

export function formatSearchResultText(query: string, events: CalendarEvent[]): string {
  const count = events.length;
  const plural = count === 1 ? "event" : "events";
  if (count === 0) return `Found 0 events matching "${query}".`;

  const labels = events.map(formatEventSpanLabel);
  const width = timeColumnWidth(labels);

  const lines = [`Found ${count} ${plural} matching "${query}":`, ""];
  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    const date = event.start.slice(0, 10);
    const time = labels[i]!.padEnd(width);
    lines.push(
      `${date} ${time}  ${event.title} (${event.calendar_name}) ${transparencyTag(event)}`,
    );
  }
  return lines.join("\n");
}

const HIDDEN_EVENT_LIST_MAX = 5;

/**
 * Warning for all-day events that `--busy` removed from the result.
 *
 * Google Calendar marks all-day events as free by default, so a fully booked
 * day can otherwise come back empty. Titles are listed so the user can judge
 * whether the day is really open.
 */
export function formatHiddenAllDayWarning(events: CalendarEvent[]): string {
  if (events.length === 0) return "";

  const verb = events.length === 1 ? "event is" : "events are";
  const lines = [
    `Note: ${events.length} all-day ${verb} hidden by --busy ` +
      `(Google Calendar marks all-day events as free by default):`,
  ];
  for (const event of events.slice(0, HIDDEN_EVENT_LIST_MAX)) {
    lines.push(`  ${event.start.slice(0, 10)}  ${event.title}`);
  }
  const remaining = events.length - HIDDEN_EVENT_LIST_MAX;
  if (remaining > 0) lines.push(`  ... and ${remaining} more`);

  return lines.join("\n");
}

interface QuietRow {
  date: string;
  label: string;
  title: string;
}

/**
 * Minimal one-line-per-entry output. Passing `range` switches to a day-oriented
 * view where multi-day events get a line per day; without it each event is
 * listed once (used by search).
 */
export function formatQuietText(events: CalendarEvent[], range?: DayRange): string {
  const rows: QuietRow[] = range
    ? expandEventsByDay(events, range).map((day) => ({
        date: day.date,
        label: day.event.all_day ? "All day" : `${day.startTime}-${day.endTime}`,
        title: day.event.title,
      }))
    : events.map((event) => ({
        date: event.start.slice(0, 10),
        label: event.all_day
          ? "All day"
          : `${event.start.slice(11, 16)}-${event.end.slice(11, 16)}`,
        title: event.title,
      }));

  if (rows.length === 0) return "No events found.";

  return rows
    .map((row) => `${toMonthDay(row.date)} ${row.label.padEnd(TIME_COL_MIN_WIDTH)}  ${row.title}`)
    .join("\n");
}

const CALENDAR_ID_MAX = 15;
const CALENDAR_ID_COL = 18;

function truncateId(id: string): string {
  if (id.length <= CALENDAR_ID_MAX) return id;
  const base = id.slice(0, CALENDAR_ID_MAX - 3);
  const lastDot = base.lastIndexOf(".");
  if (lastDot > 0) {
    return base.slice(0, lastDot) + "...";
  }
  return base + "...";
}

export function formatCalendarListText(calendars: Calendar[]): string {
  const lines = ["Calendars:"];
  for (const cal of calendars) {
    const checkbox = cal.enabled ? "[x]" : "[ ]";
    const id = truncateId(cal.id).padEnd(CALENDAR_ID_COL);
    const suffix = cal.enabled ? "" : " (disabled)";
    lines.push(`  ${checkbox} ${id}${cal.name}${suffix}`);
  }
  return lines.join("\n");
}

const DETAIL_LABEL_WIDTH = 14;

function detailLine(label: string, value: string): string {
  return `${label}:`.padEnd(DETAIL_LABEL_WIDTH) + value;
}

export function formatEventDetailText(event: CalendarEvent): string {
  const lines: string[] = [event.title, ""];

  if (event.all_day) {
    const endDate = new Date(event.end + "T00:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    const endStr = endDate.toISOString().slice(0, 10);
    const dateValue = endStr === event.start ? event.start : `${event.start} - ${endStr}`;
    lines.push(detailLine("Date", dateValue));
    lines.push(detailLine("Time", "All Day"));
  } else {
    const date = event.start.slice(0, 10);
    const startTime = event.start.slice(11, 16);
    const endTime = event.end.slice(11, 16);
    lines.push(detailLine("Date", date));
    lines.push(detailLine("Time", `${startTime} - ${endTime}`));
  }

  lines.push(detailLine("Calendar", event.calendar_name));
  lines.push(detailLine("Status", event.status));
  lines.push(detailLine("Availability", event.transparency === "transparent" ? "free" : "busy"));

  if (event.description !== null) {
    lines.push(detailLine("Description", event.description));
  }

  lines.push("");
  lines.push(`Link: ${event.html_link}`);

  return lines.join("\n");
}

const ERROR_CODE_EXIT_MAP: Record<ErrorCode, number> = {
  AUTH_REQUIRED: ExitCode.AUTH,
  AUTH_EXPIRED: ExitCode.AUTH,
  NOT_FOUND: ExitCode.GENERAL,
  INVALID_ARGS: ExitCode.ARGUMENT,
  API_ERROR: ExitCode.GENERAL,
  CONFIG_ERROR: ExitCode.GENERAL,
};

export function errorCodeToExitCode(code: ErrorCode): number {
  return ERROR_CODE_EXIT_MAP[code];
}
