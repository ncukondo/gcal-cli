import type { GoogleEvent, GoogleEventImportBody } from "./api.ts";
import { addDaysToDateString } from "./date-utils.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Splitting a series at an occurrence ("This and following events") as the
 * web UI does it, checked against a throwaway series on 2026-10-08: the
 * original master's rule is cut short just before the occurrence, and a new
 * series starting there is added under the ID `<original>_R<start>`. The
 * occurrences after the split keep their IDs, `<original>_<start>Z`, so a
 * series is always named after the series it was first split from.
 */

/** When an occurrence starts, as the API gives `start` / `originalStartTime`. */
export interface OccurrenceTime {
  date?: string | null;
  dateTime?: string | null;
}

const SPLIT_SUFFIX = /_R\d{8}(T\d{6})?$/;

/** `20261023` for an all-day occurrence, the UTC `20261023T010000` for a timed one. */
function stamp(when: OccurrenceTime): string {
  if (when.date) return when.date.replaceAll("-", "");
  const iso = new Date(when.dateTime ?? "").toISOString();
  return iso.slice(0, 19).replaceAll("-", "").replaceAll(":", "");
}

/** The ID the web UI gives a series split off at `splitAt`. */
export function splitSeriesId(masterId: string, splitAt: OccurrenceTime): string {
  return `${masterId.replace(SPLIT_SUFFIX, "")}_R${stamp(splitAt)}`;
}

function rewriteRule(recurrence: string[], rewrite: (parts: string[]) => string[]): string[] {
  return recurrence.map((line) => {
    if (!line.startsWith("RRULE:")) return line;
    const parts = line.slice("RRULE:".length).split(";");
    return `RRULE:${rewrite(parts).join(";")}`;
  });
}

const isBound = (part: string) => part.startsWith("COUNT=") || part.startsWith("UNTIL=");

/** The last moment the original series may still have an occurrence. */
function untilBefore(splitAt: OccurrenceTime): string {
  if (splitAt.date) return addDaysToDateString(splitAt.date, -1).replaceAll("-", "");
  const last = new Date(new Date(splitAt.dateTime ?? "").getTime() - 1000);
  return `${last.toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "")}Z`;
}

/**
 * The original series' rule, ending just before the occurrence at `splitAt`.
 * EXDATE and RDATE lines stay: dates past the end no longer match anything.
 */
export function truncateRecurrence(recurrence: string[], splitAt: OccurrenceTime): string[] {
  const until = `UNTIL=${untilBefore(splitAt)}`;
  return rewriteRule(recurrence, (parts) => [...parts.filter((p) => !isBound(p)), until]);
}

/**
 * The new series' rule. A COUNT counted every occurrence of the original
 * series, so the ones before the split are taken off it, as the web UI does;
 * an UNTIL already ends at the right place.
 */
export function continueRecurrence(recurrence: string[], occurrencesBefore: number): string[] {
  return rewriteRule(recurrence, (parts) =>
    parts.map((p) =>
      p.startsWith("COUNT=") ? `COUNT=${Number(p.slice("COUNT=".length)) - occurrencesBefore}` : p,
    ),
  );
}

/** What a split writes, worked out before anything is written. */
export interface SplitPlan {
  /** Where the rule put the occurrence the split starts at. */
  splitAt: OccurrenceTime;
  newSeriesId: string;
  /** Occurrences before the split, deleted ones included: a COUNT counts those too. */
  occurrencesBefore: number;
  /** The original series' rule after the split. */
  truncated: string[];
  /** The new series' rule. */
  continued: string[];
  /** Occurrences from the split onwards, as they stand now. */
  following: GoogleEvent[];
  /** Occurrences from the split onwards that were deleted from the series. */
  deleted: GoogleEvent[];
}

function instant(when: OccurrenceTime | null | undefined): number {
  if (!when) return NaN;
  if (when.date) return new Date(`${when.date}T00:00:00Z`).getTime();
  return new Date(when.dateTime ?? "").getTime();
}

function originalStart(event: GoogleEvent): OccurrenceTime {
  const when = event.originalStartTime ?? event.start ?? {};
  return when.date ? { date: when.date } : { dateTime: when.dateTime ?? null };
}

/**
 * Plans a split of `master` at `target`, one of its occurrences. `instances`
 * has to include the deleted ones: they count towards a COUNT, and the ones
 * after the split come back in the new series unless deleted again.
 */
export function planSplit(
  master: GoogleEvent,
  instances: GoogleEvent[],
  target: GoogleEvent,
): SplitPlan {
  const splitAt = originalStart(target);
  const at = instant(splitAt);
  const before = instances.filter((i) => instant(originalStart(i)) < at);
  const after = instances.filter((i) => instant(originalStart(i)) >= at);
  const recurrence = master.recurrence ?? [];
  return {
    splitAt,
    newSeriesId: splitSeriesId(master.id ?? "", splitAt),
    occurrencesBefore: before.length,
    truncated: truncateRecurrence(recurrence, splitAt),
    continued: continueRecurrence(recurrence, before.length),
    following: after.filter((i) => i.status !== "cancelled"),
    deleted: after.filter((i) => i.status === "cancelled"),
  };
}

/** Fields the server sets, which an import must not carry over from the master. */
const SERVER_OWNED = [
  "id",
  "etag",
  "kind",
  "htmlLink",
  "created",
  "updated",
  "sequence",
  "iCalUID",
  "organizer",
  "creator",
  "hangoutLink",
  "recurringEventId",
  "originalStartTime",
] as const;

/**
 * The new series as the master would continue from the split, before the
 * update's own changes are applied. Every field the master has is copied --
 * reminders, color, visibility and guest permissions included -- so the new
 * series differs from the old one only where the update says so.
 */
export function buildSplitSeriesBody(master: GoogleEvent, plan: SplitPlan): GoogleEventImportBody {
  const copy: Record<string, unknown> = { ...master };
  for (const key of SERVER_OWNED) delete copy[key];

  const conference = master.conferenceData;
  if (conference) {
    // The existing conference is attached as is. A leftover createRequest would
    // ask Google to allocate a different one.
    const { conferenceId, conferenceSolution, entryPoints } = conference;
    copy.conferenceData = { conferenceId, conferenceSolution, entryPoints };
  }

  const length = instant(master.end) - instant(master.start);
  let start: GoogleEvent["start"];
  let end: GoogleEvent["end"];
  if (plan.splitAt.date) {
    start = { date: plan.splitAt.date };
    end = { date: addDaysToDateString(plan.splitAt.date, Math.round(length / MS_PER_DAY)) };
  } else {
    const begins = instant(plan.splitAt);
    const timeZone = master.start?.timeZone;
    start = { dateTime: new Date(begins).toISOString(), ...(timeZone ? { timeZone } : {}) };
    end = { dateTime: new Date(begins + length).toISOString(), ...(timeZone ? { timeZone } : {}) };
  }

  return {
    ...copy,
    iCalUID: `${plan.newSeriesId}@google.com`,
    start,
    end,
    recurrence: plan.continued,
  } as GoogleEventImportBody;
}
