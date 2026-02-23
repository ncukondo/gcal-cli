import type {
  CalendarEvent,
  ErrorCode,
  OutputFormat,
} from "../types/index.ts";

export function formatSuccess(data: unknown, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }
  return String(data);
}

export function formatError(
  code: number,
  message: string,
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify({ error: { code, message } }, null, 2);
  }
  return `Error: ${message}`;
}

export function formatJsonSuccess(data: unknown): string {
  return JSON.stringify({ success: true, data }, null, 2);
}

export function formatJsonError(code: ErrorCode, message: string): string {
  return JSON.stringify(
    { success: false, error: { code, message } },
    null,
    2,
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getDateKey(event: CalendarEvent): string {
  if (event.all_day) {
    return event.start;
  }
  return event.start.slice(0, 10);
}

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return DAY_NAMES[date.getDay()] ?? "???";
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.all_day) {
    return "[All Day]  ";
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
      const time = formatTimeRange(event);
      const tag = transparencyTag(event);
      lines.push(`  ${time}   ${event.title} (${event.calendar_name}) ${tag}`);
    }
  }

  return lines.join("\n");
}
