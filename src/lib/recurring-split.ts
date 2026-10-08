import { addDaysToDateString } from "./date-utils.ts";

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
