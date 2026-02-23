import type { Calendar, CalendarEvent, ErrorCode } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

export function formatJsonSuccess(data: unknown): string {
  return JSON.stringify({ success: true, data }, null, 2);
}

export function formatJsonError(code: ErrorCode, message: string): string {
  return JSON.stringify({ success: false, error: { code, message } }, null, 2);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getDateKey(event: CalendarEvent): string {
  if (event.all_day) {
    return event.start;
  }
  return event.start.slice(0, 10);
}

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return DAY_NAMES[date.getUTCDay()] ?? "???";
}

export function formatTimeRange(event: CalendarEvent): string {
  if (event.all_day) {
    return "[All Day]";
  }
  const startTime = event.start.slice(11, 16);
  const endTime = event.end.slice(11, 16);
  return `${startTime}-${endTime}`;
}

function transparencyTag(event: CalendarEvent): string {
  return event.transparency === "transparent" ? "[free]" : "[busy]";
}

export function formatEventListText(events: CalendarEvent[]): string {
  if (events.length === 0) return "";

  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = getDateKey(event);
    const group = groups.get(key);
    if (group) {
      group.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  const lines: string[] = [];
  let first = true;
  for (const [dateKey, groupEvents] of groups) {
    if (!first) lines.push("");
    first = false;
    lines.push(`${dateKey} (${getDayOfWeek(dateKey)})`);
    for (const event of groupEvents) {
      const time = formatTimeRange(event).padEnd(11);
      if (event.all_day) {
        lines.push(`  ${time}   ${event.title} (${event.calendar_name})`);
      } else {
        const tag = transparencyTag(event);
        lines.push(`  ${time}   ${event.title} (${event.calendar_name}) ${tag}`);
      }
    }
  }

  return lines.join("\n");
}

function formatSearchEventLine(event: CalendarEvent): string {
  const date = getDateKey(event);
  const time = formatTimeRange(event).padEnd(11);
  if (event.all_day) {
    return `${date} ${time}  ${event.title} (${event.calendar_name})`;
  }
  const tag = transparencyTag(event);
  return `${date} ${time}  ${event.title} (${event.calendar_name}) ${tag}`;
}

export function formatSearchResultText(query: string, events: CalendarEvent[]): string {
  const count = events.length;
  const plural = count === 1 ? "event" : "events";
  if (count === 0) return `Found 0 events matching "${query}".`;

  const header = `Found ${count} ${plural} matching "${query}":`;

  const lines = [header, ""];
  for (const event of events) {
    lines.push(formatSearchEventLine(event));
  }
  return lines.join("\n");
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
