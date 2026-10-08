import type { GoogleEvent, GoogleEventWriteBody } from "./api.ts";
import { normalizeEvent } from "./api.ts";
import type { CalendarEvent } from "../types/index.ts";

/**
 * A field an occurrence of a recurring series can hold its own value for.
 *
 * Patching a field on the series master makes Google overwrite that field on
 * every occurrence, modified ones included, while leaving their other fields
 * alone. Changing the master's time is harsher: Google rebuilds the series and
 * every modified occurrence is reset, whatever it changed. So `time` stands for
 * "every field" when deciding what an update would lose.
 */
export type ExceptionField =
  | "title"
  | "description"
  | "transparency"
  | "attendees"
  | "conference"
  | "location"
  | "time";

/** An occurrence whose own value for a field the update writes would be lost. */
export interface OverriddenInstance {
  id: string;
  start: string;
  original_start: string;
  /** The fields where this occurrence differs from the series. */
  fields: ExceptionField[];
  raw: GoogleEvent;
}

export function isRecurringMaster(event: GoogleEvent): boolean {
  return (event.recurrence?.length ?? 0) > 0;
}

function attendeeKey(event: CalendarEvent): string {
  return event.attendees
    .map((a) => `${a.email.toLowerCase()}${a.optional ? "?" : ""}`)
    .sort()
    .join(",");
}

function instant(value: { date?: string | null; dateTime?: string | null } | null | undefined) {
  if (!value) return NaN;
  if (value.date) return new Date(`${value.date}T00:00:00Z`).getTime();
  return new Date(value.dateTime ?? "").getTime();
}

function durationOf(event: GoogleEvent): number {
  return instant(event.end) - instant(event.start);
}

/** Whether the occurrence was moved or resized away from where the rule puts it. */
function isMoved(series: GoogleEvent, occurrence: GoogleEvent): boolean {
  if (!occurrence.originalStartTime) return false;
  return (
    instant(occurrence.start) !== instant(occurrence.originalStartTime) ||
    durationOf(occurrence) !== durationOf(series)
  );
}

const COMPARATORS: Record<
  Exclude<ExceptionField, "time" | "location">,
  (series: CalendarEvent, occurrence: CalendarEvent) => boolean
> = {
  title: (s, o) => s.title === o.title,
  description: (s, o) => (s.description ?? "") === (o.description ?? ""),
  transparency: (s, o) => s.transparency === o.transparency,
  attendees: (s, o) => attendeeKey(s) === attendeeKey(o),
  conference: (s, o) => (s.conference?.uri ?? null) === (o.conference?.uri ?? null),
};

const ALL_VALUE_FIELDS = Object.keys(COMPARATORS) as (keyof typeof COMPARATORS)[];

/**
 * The occurrences that hold their own value for one of `changing`, which a
 * patch of the series master would overwrite. Cancelled occurrences are left
 * out: there is nothing on them to lose.
 */
export function findOverriddenInstances(
  master: GoogleEvent,
  instances: GoogleEvent[],
  changing: ExceptionField[],
): OverriddenInstance[] {
  const resetsAll = changing.includes("time");
  const series = normalizeEvent(master, "", "");
  const result: OverriddenInstance[] = [];

  for (const raw of instances) {
    if (raw.status === "cancelled") continue;
    const occurrence = normalizeEvent(raw, "", "");
    const fields: ExceptionField[] = [];
    for (const field of ALL_VALUE_FIELDS) {
      if (!resetsAll && !changing.includes(field)) continue;
      if (!COMPARATORS[field](series, occurrence)) fields.push(field);
    }
    if (resetsAll) {
      if ((master.location ?? "") !== (raw.location ?? "")) fields.push("location");
      if (isMoved(master, raw)) fields.push("time");
    }
    if (fields.length === 0) continue;

    const original = raw.originalStartTime;
    result.push({
      id: occurrence.id,
      start: occurrence.start,
      original_start: original?.dateTime ?? original?.date ?? occurrence.start,
      fields,
      raw,
    });
  }
  return result;
}

/** Fields --preserve-exceptions can write back onto an occurrence. */
export const RESTORABLE_FIELDS: readonly ExceptionField[] = [
  "title",
  "description",
  "transparency",
  "attendees",
];

type TimeField = NonNullable<GoogleEventWriteBody["start"]>;

/** The API's nullable time shape, as a write body takes it. */
function toTimeField(value: GoogleEvent["start"]): TimeField {
  const field: TimeField = {};
  if (value?.date) field.date = value.date;
  if (value?.dateTime) field.dateTime = value.dateTime;
  if (value?.timeZone) field.timeZone = value.timeZone;
  return field;
}

/**
 * The patch that puts an occurrence's own values back for the given fields.
 * `location` and `time` only come back where the occurrence keeps its ID,
 * which a split series does and a series whose time changed does not, so
 * RESTORABLE_FIELDS leaves them out.
 */
export function buildRestoreBody(
  occurrence: GoogleEvent,
  fields: ExceptionField[],
): Partial<GoogleEventWriteBody> {
  const body: Partial<GoogleEventWriteBody> = {};
  if (fields.includes("title")) body.summary = occurrence.summary ?? "";
  if (fields.includes("description")) body.description = occurrence.description ?? null;
  if (fields.includes("transparency")) {
    body.transparency = occurrence.transparency === "transparent" ? "transparent" : "opaque";
  }
  // Passed through as returned, so RSVPs and fields the CLI does not model survive.
  if (fields.includes("attendees")) body.attendees = occurrence.attendees ?? [];
  if (fields.includes("location")) body.location = occurrence.location ?? null;
  if (fields.includes("time")) {
    body.start = toTimeField(occurrence.start);
    body.end = toTimeField(occurrence.end);
  }
  return body;
}
