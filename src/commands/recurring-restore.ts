import type { GoogleCalendarApi, GoogleEvent } from "../lib/api.ts";
import { deleteEvent, listInstances, patchInstance } from "../lib/api.ts";
import { buildRestoreBody, changedFields } from "../lib/recurring-exceptions.ts";
import type { ExceptionField, OverriddenInstance } from "../lib/recurring-exceptions.ts";

/**
 * Writing occurrences' own values back after a write to their series. Shared
 * by the series update (#70) and the split (#72).
 */

export interface RestoreFailure {
  id: string;
  start: string;
  error: string;
  /** What the occurrence held, so it can be put back by hand. */
  values: Record<string, unknown>;
}

export interface Restore {
  instance: OverriddenInstance;
  fields: ExceptionField[];
}

/**
 * Writes the occurrences' own values back and deletes the deleted ones again.
 * Collects failures instead of stopping: each one is independent, and the
 * caller reports them with the values that were meant to be written.
 */
export async function restoreOccurrences(
  api: GoogleCalendarApi,
  calendarId: string,
  restores: Restore[],
  deleted: GoogleEvent[] = [],
): Promise<RestoreFailure[]> {
  const failed: RestoreFailure[] = [];
  for (const { instance, fields } of restores) {
    if (fields.length === 0) continue;
    const body = buildRestoreBody(instance.raw, fields);
    try {
      await patchInstance(api, calendarId, instance.id, body);
    } catch (err) {
      failed.push({
        id: instance.id,
        start: instance.start,
        error: (err as Error).message,
        values: body,
      });
    }
  }
  for (const occurrence of deleted) {
    const id = occurrence.id ?? "";
    try {
      await deleteEvent(api, calendarId, id, "none");
    } catch (err) {
      const start =
        occurrence.originalStartTime?.dateTime ?? occurrence.originalStartTime?.date ?? "";
      failed.push({ id, start, error: (err as Error).message, values: { status: "cancelled" } });
    }
  }
  return failed;
}

/**
 * Puts back what a write to a series changed on occurrences it was not meant
 * to touch. Seen on 2026-10-08: when the master has no description, any write
 * to it -- a title-only patch or the rule alone included -- clears the
 * descriptions its occurrences hold. The occurrences are compared with a fresh
 * read rather than written back blindly, so only what Google actually changed
 * is written, whatever else it turns out to change.
 *
 * `own` are the occurrences as read before the write; `keep` says which of
 * their fields the write was not meant to change.
 */
export async function restoreWhatChanged(
  api: GoogleCalendarApi,
  calendarId: string,
  masterId: string,
  own: OverriddenInstance[],
  keep: (field: ExceptionField) => boolean,
): Promise<{ restored: Restore[]; failed: RestoreFailure[] }> {
  if (own.length === 0) return { restored: [], failed: [] };

  let current: GoogleEvent[] | undefined;
  try {
    current = await listInstances(api, calendarId, masterId);
  } catch {
    // Without a fresh read, every value of their own is written back.
  }
  const restores = own
    .map((instance) => {
      const now = current?.find((i) => i.id === instance.id);
      const fields = now ? changedFields(instance.raw, now) : instance.fields;
      // A conference cannot be written back to an occurrence.
      return { instance, fields: fields.filter((f) => f !== "conference" && keep(f)) };
    })
    .filter((r) => r.fields.length > 0);
  const failed = await restoreOccurrences(api, calendarId, restores);
  const failedIds = new Set(failed.map((f) => f.id));
  return { restored: restores.filter((r) => !failedIds.has(r.instance.id)), failed };
}
