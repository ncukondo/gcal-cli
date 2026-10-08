import type {
  FetchedEvent,
  GoogleCalendarApi,
  GoogleEvent,
  SendUpdates,
  UpdateEventInput,
} from "../lib/api.ts";
import {
  ApiError,
  buildUpdateFields,
  deleteEvent,
  importEvent,
  listInstances,
  normalizeEvent,
  patchInstance,
  patchRecurrence,
  updateEvent,
} from "../lib/api.ts";
import {
  buildRestoreBody,
  changedFields,
  findOverriddenInstances,
} from "../lib/recurring-exceptions.ts";
import type { ExceptionField, OverriddenInstance } from "../lib/recurring-exceptions.ts";
import { buildSplitSeriesBody, isSplitOffSeries, planSplit } from "../lib/recurring-split.ts";
import type { SplitPlan } from "../lib/recurring-split.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import type { CalendarEvent, CommandResult, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

/**
 * "This and following events": the series is split at an occurrence and the
 * update applies to the new series only. See spec/commands.md for what Google
 * does with a split and why the CLI does it the way it does.
 */

export interface SplitTarget {
  master: GoogleEvent;
  plan: SplitPlan;
  /**
   * The new series as it would be before the update's own changes, in the
   * shape the rest of the update works with: the new times, the guest list
   * diff and the dry run are all derived from the series, not the occurrence.
   */
  snapshot: FetchedEvent;
}

/** The occurrence the split starts at is the series' first: nothing to split off. */
export interface FirstOccurrence {
  masterId: string;
}

/**
 * Reads what a split needs and checks it can be done. Nothing is written.
 */
export async function prepareSplit(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  eventId: string,
  target: FetchedEvent,
  getEvent: (id: string) => Promise<FetchedEvent>,
): Promise<SplitTarget | FirstOccurrence> {
  const masterId = target.raw.recurringEventId;
  if (!masterId) {
    const what = (target.raw.recurrence?.length ?? 0) > 0 ? "the series itself" : "not recurring";
    throw new ApiError(
      "INVALID_ARGS",
      `--this-and-following needs the ID of an occurrence of a recurring series; "${eventId}" is ${what}.` +
        " Use `gcal list` to find the occurrence to split at.",
    );
  }

  if (isSplitOffSeries(masterId)) {
    throw new ApiError(
      "INVALID_ARGS",
      `"${eventId}" belongs to ${masterId}, a series that was itself split off another one. ` +
        "Splitting it again is not supported: Google re-creates such a series under a new ID when its rule changes. " +
        "Update its occurrences one by one, or split it in the Google Calendar web UI.",
    );
  }

  const master = (await getEvent(masterId)).raw;
  const organizer = master.organizer;
  if (organizer && organizer.self !== true) {
    // Only the organizer's copy is the series; changing the rule anywhere else
    // changes this calendar's copy alone, out of step with everyone else's.
    throw new ApiError(
      "INVALID_ARGS",
      `Only the organizer can split this series; it is organized by ${organizer.email ?? "someone else"}.`,
    );
  }

  const instances = await listInstances(api, calendarId, masterId, { showDeleted: true });
  const plan = planSplit(master, instances, target.raw);
  if (plan.occurrencesBefore === 0) {
    return { masterId };
  }

  const raw: GoogleEvent = { ...buildSplitSeriesBody(master, plan), id: plan.newSeriesId };
  return {
    master,
    plan,
    snapshot: { raw, event: normalizeEvent(raw, calendarId, calendarName) },
  };
}

/** What happens to the occurrences after the split that hold their own values. */
type SplitAction = "carried" | "preserved" | "overwritten";

interface ExceptionDecision {
  action: SplitAction | "abort" | undefined;
  /** Every occurrence after the split with values of its own. */
  own: OverriddenInstance[];
  /** The ones whose values the update would lose without a flag. */
  conflicts: OverriddenInstance[];
  timeChanges: boolean;
}

const lines = (instances: OverriddenInstance[]) =>
  instances.map((i) => `  ${i.id}  ${i.start}  (${i.fields.join(", ")})`);

const deletedLines = (deleted: GoogleEvent[]) =>
  deleted.map((d) => `  ${d.id}  ${d.originalStartTime?.dateTime ?? d.originalStartTime?.date}`);

function decideExceptions(
  opts: { preserveExceptions?: boolean; overwriteExceptions?: boolean; dryRun?: boolean },
  split: SplitTarget,
  changing: ExceptionField[],
): ExceptionDecision {
  const { master, plan } = split;
  const own = findOverriddenInstances(master, plan.following, ["time"]);
  const timeChanges = changing.includes("time");
  // New times give the occurrences new IDs, so nothing can be carried over.
  const conflicts = timeChanges
    ? own
    : own.filter((i) => i.fields.some((f) => f === "conference" || changing.includes(f)));
  const deletedConflict = timeChanges && plan.deleted.length > 0;

  if (conflicts.length === 0 && !deletedConflict) {
    const carries = own.length > 0 || plan.deleted.length > 0;
    return { action: carries ? "carried" : undefined, own, conflicts, timeChanges };
  }

  const detail = [
    ...(conflicts.length > 0
      ? [`${conflicts.length} modified occurrence(s) after the split:`, ...lines(conflicts)]
      : []),
    ...(deletedConflict
      ? [
          `${plan.deleted.length} deleted occurrence(s) after the split, which would come back:`,
          ...deletedLines(plan.deleted),
        ]
      : []),
  ].join("\n");
  const unrestorable =
    timeChanges || deletedConflict || conflicts.some((i) => i.fields.includes("conference"));

  if (opts.preserveExceptions) {
    if (unrestorable) {
      const why = timeChanges
        ? "Changing the time gives the occurrences of the new series new IDs, so nothing can be carried over to them"
        : "An occurrence's own conference cannot be carried over to the new series";
      throw new ApiError(
        "INVALID_ARGS",
        `${why}:\n${detail}\nRe-run with --overwrite-exceptions to proceed anyway.`,
      );
    }
    return { action: "preserved", own, conflicts, timeChanges };
  }
  if (opts.overwriteExceptions) return { action: "overwritten", own, conflicts, timeChanges };
  if (opts.dryRun) return { action: "abort", own, conflicts, timeChanges };

  const hint = unrestorable
    ? "Re-run with --overwrite-exceptions to proceed anyway (--dry-run previews)."
    : "Re-run with --preserve-exceptions to keep their values, or --overwrite-exceptions to replace them (--dry-run previews).";
  throw new ApiError(
    "INVALID_ARGS",
    `Splitting the series would lose values these occurrences have of their own:\n${detail}\n${hint}`,
  );
}

/** The fields to write back onto an occurrence of the new series. */
function fieldsToRestore(
  instance: OverriddenInstance,
  decision: ExceptionDecision,
  changing: ExceptionField[],
): ExceptionField[] {
  if (decision.timeChanges) return [];
  return instance.fields.filter(
    (f) => f !== "conference" && !(decision.action === "overwritten" && changing.includes(f)),
  );
}

interface RestoreFailure {
  id: string;
  start: string;
  error: string;
  /** What the occurrence held, so it can be put back by hand. */
  values: Record<string, unknown>;
}

/**
 * Writes the occurrences' own values back and deletes the deleted ones again.
 * Collects failures instead of stopping: each one is independent, and the
 * caller reports them with the values that were meant to be written.
 */
async function restoreOccurrences(
  api: GoogleCalendarApi,
  calendarId: string,
  restores: { instance: OverriddenInstance; fields: ExceptionField[] }[],
  deleted: GoogleEvent[],
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
 * Puts back what a write to the original series cleared on the occurrences
 * that stay with it. Seen on 2026-10-08: when the master has no description,
 * any write to it -- the rule alone included -- clears the descriptions its
 * occurrences have of their own. They are compared with a fresh read rather
 * than written back blindly, so only what Google actually changed is written.
 */
async function settlePreceding(
  api: GoogleCalendarApi,
  calendarId: string,
  split: SplitTarget,
): Promise<{ restored: number; failed: RestoreFailure[] }> {
  const own = findOverriddenInstances(split.master, split.plan.preceding, ["time"]);
  if (own.length === 0) return { restored: 0, failed: [] };

  let current: GoogleEvent[] | undefined;
  try {
    current = await listInstances(api, calendarId, split.master.id ?? "");
  } catch {
    // Without a fresh read, every value of their own is written back.
  }
  const restores = own.map((instance) => {
    const now = current?.find((i) => i.id === instance.id);
    const fields = now ? changedFields(instance.raw, now) : instance.fields;
    return { instance, fields: fields.filter((f) => f !== "conference") };
  });
  const failed = await restoreOccurrences(api, calendarId, restores, []);
  const restored = restores.filter((r) => r.fields.length > 0).length - failed.length;
  return { restored, failed };
}

/**
 * Puts the original series back after the new one could not be added: the
 * rule first, then the occurrences the truncation reset. Returns the error to
 * throw, which says how far the rollback got.
 */
async function rollBack(
  api: GoogleCalendarApi,
  calendarId: string,
  split: SplitTarget,
  decision: ExceptionDecision,
  cause: unknown,
): Promise<ApiError> {
  const { master, plan } = split;
  const masterId = master.id ?? "";
  const original = master.recurrence ?? [];
  const reason = (cause as Error).message;
  const code = cause instanceof ApiError ? cause.code : "API_ERROR";

  try {
    await patchRecurrence(api, calendarId, masterId, original, "none");
  } catch (err) {
    return new ApiError(
      code,
      `Could not add the new series: ${reason}\n` +
        `Rolling back failed too (${(err as Error).message}): series ${masterId} now ends before ${splitAtText(plan)}.\n` +
        `Its original rule was:\n${original.map((r) => `  ${r}`).join("\n")}`,
    );
  }

  const restores = decision.own.map((instance) => ({
    instance,
    fields: instance.fields.filter((f) => f !== "conference"),
  }));
  const failed = [
    ...(await settlePreceding(api, calendarId, split)).failed,
    ...(await restoreOccurrences(api, calendarId, restores, plan.deleted)),
  ];
  const unrestored = failed.map(
    (f) => `\n  ${f.id} (${f.start}): ${f.error}; its own values were ${JSON.stringify(f.values)}`,
  );
  return new ApiError(
    code,
    `Could not add the new series: ${reason}\nThe original series ${masterId} was restored.` +
      (unrestored.length > 0
        ? `\nThese occurrences could not be put back:${unrestored.join("")}`
        : ""),
  );
}

function splitAtText(plan: SplitPlan): string {
  return plan.splitAt.dateTime ?? plan.splitAt.date ?? "";
}

function describeSplit(split: SplitTarget) {
  return {
    series_id: split.master.id,
    new_series_id: split.plan.newSeriesId,
    split_at: splitAtText(split.plan),
    recurrence: split.plan.truncated,
    new_recurrence: split.plan.continued,
  };
}

const summarize = (i: OverriddenInstance) => ({
  id: i.id,
  start: i.start,
  original_start: i.original_start,
  fields: i.fields,
});

export interface SplitRunOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  quiet?: boolean;
  dryRun?: boolean;
  preserveExceptions?: boolean;
  overwriteExceptions?: boolean;
  write: (msg: string) => void;
  writeStderr: (msg: string) => void;
}

/**
 * Splits the series and applies `input` to the new series.
 * `changes` and `changeLines` describe the update for the dry run.
 */
export async function runSplit(
  opts: SplitRunOptions,
  split: SplitTarget,
  input: UpdateEventInput,
  changing: ExceptionField[],
  changes: Record<string, unknown>,
  changeLines: string[],
): Promise<CommandResult> {
  const { api, calendarId, calendarName, format, write } = opts;
  const { master, plan } = split;
  const decision = decideExceptions(opts, split, changing);

  if (opts.dryRun) {
    writeDryRun(opts, split, decision, changes, changeLines);
    return { exitCode: ExitCode.SUCCESS };
  }

  const sendUpdates: SendUpdates = input.sendUpdates ?? "none";
  await patchRecurrence(api, calendarId, master.id ?? "", plan.truncated, sendUpdates);
  const earlier = await settlePreceding(api, calendarId, split);

  // The conference is settled after the import: an existing one is carried
  // over as is, and a new one is requested the way any update requests it.
  const body = { ...split.snapshot.raw, ...buildUpdateFields(input) };
  delete body.id;
  if (input.meet || input.removeMeet) delete body.conferenceData;

  let created: GoogleEvent;
  try {
    created = await importEvent(api, calendarId, {
      ...body,
      iCalUID: `${plan.newSeriesId}@google.com`,
    });
  } catch (err) {
    throw await rollBack(api, calendarId, split, decision, err);
  }

  // Before the occurrences are written back: a write to a master without a
  // description clears theirs.
  let event: CalendarEvent = normalizeEvent(created, calendarId, calendarName);
  let meetError: string | undefined;
  if (input.meet) {
    try {
      event = await updateEvent(api, calendarId, calendarName, created.id ?? plan.newSeriesId, {
        meet: true,
      });
    } catch (err) {
      meetError = (err as Error).message;
    }
  }

  const restores = decision.own.map((instance) => ({
    instance,
    fields: fieldsToRestore(instance, decision, changing),
  }));
  const failed = [
    ...earlier.failed,
    ...(await restoreOccurrences(
      api,
      calendarId,
      restores,
      decision.timeChanges ? [] : plan.deleted,
    )),
  ];

  if (sendUpdates !== "none" && (master.attendees?.length ?? 0) > 0) {
    opts.writeStderr(
      `Note: guests were notified of the change to the original series only; they were not notified of the new series ${plan.newSeriesId}, since Google's import sends no invitations.`,
    );
  }

  if (format === "json") {
    const data: Record<string, unknown> = {
      event,
      message: "Event updated (this and following)",
      split: describeSplit(split),
    };
    if (decision.action) {
      data.exceptions = {
        action: decision.action,
        instances: decision.own.map(summarize),
        deleted: plan.deleted.map((d) => d.id),
        failed,
      };
    }
    write(formatJsonSuccess(data));
  } else if (opts.quiet) {
    write(event.id);
  } else {
    write(
      `Event updated (this and following)\n\n${formatEventDetailText(event)}\n\n` +
        `New series: ${event.id} (split from ${master.id} at ${splitAtText(plan)})`,
    );
  }

  if (!opts.quiet) {
    const failedIds = new Set(failed.map((f) => f.id));
    const restoredOk = restores.filter(
      (r) => r.fields.length > 0 && !failedIds.has(r.instance.id),
    ).length;
    if (restoredOk > 0) {
      opts.writeStderr(`Carried ${restoredOk} modified occurrence(s) over with their own values.`);
    }
    if (earlier.restored > 0) {
      opts.writeStderr(
        `Restored ${earlier.restored} modified occurrence(s) before the split that Google reset when the series was cut short.`,
      );
    }
    if (decision.action === "overwritten") {
      opts.writeStderr(
        `Overwrote ${decision.conflicts.length} modified occurrence(s):\n${lines(decision.conflicts).join("\n")}`,
      );
    }
  }
  if (meetError) {
    opts.writeStderr(
      `\u26A0 The series was split, but attaching a Google Meet conference to ${plan.newSeriesId} failed: ${meetError}\n` +
        `  Run \`gcal update ${plan.newSeriesId} --meet\` to try again.`,
    );
  }
  for (const f of failed) {
    opts.writeStderr(
      `⚠ Could not restore occurrence ${f.id} (${f.start}): ${f.error}\n` +
        `  Its own values were: ${JSON.stringify(f.values)}`,
    );
  }

  const ok = failed.length === 0 && meetError === undefined;
  return { exitCode: ok ? ExitCode.SUCCESS : ExitCode.GENERAL };
}

function writeDryRun(
  opts: SplitRunOptions,
  split: SplitTarget,
  decision: ExceptionDecision,
  changes: Record<string, unknown>,
  changeLines: string[],
): void {
  const { master, plan } = split;
  if (opts.format === "json") {
    const data: Record<string, unknown> = {
      dry_run: true,
      action: "update",
      event_id: opts.eventId,
      this_and_following: true,
      split: describeSplit(split),
      changes,
    };
    if (decision.action) {
      data.exceptions = {
        action: decision.action,
        instances: decision.own.map(summarize),
        deleted: plan.deleted.map((d) => d.id),
      };
    }
    opts.write(formatJsonSuccess(data));
    return;
  }

  const out = [
    `DRY RUN: Would update event "${opts.eventId}" and all following occurrences:`,
    `  split series "${master.id}" at ${splitAtText(plan)}`,
    `  original series: ${plan.truncated.join(" ")}   (was ${(master.recurrence ?? []).join(" ")})`,
    `  new series "${plan.newSeriesId}": ${plan.continued.join(" ")}`,
    ...changeLines,
  ];
  if (decision.timeChanges && decision.own.length > 0) {
    const fate =
      decision.action === "abort"
        ? "would be reset; the update will abort unless --overwrite-exceptions is given"
        : "would be reset (the time changes)";
    out.push(`  modified occurrences after the split (${decision.own.length}) ${fate}:`);
    out.push(...lines(decision.own).map((l) => `  ${l}`));
  } else {
    const conflicts = new Set(decision.conflicts);
    const kept = decision.own.filter((i) => !conflicts.has(i));
    if (decision.conflicts.length > 0) {
      const fate = {
        carried: "",
        preserved: "would keep their own values (--preserve-exceptions)",
        overwritten: "would have the changed fields overwritten (--overwrite-exceptions)",
        abort:
          "would lose their own values; the update will abort unless --preserve-exceptions or --overwrite-exceptions is given",
      }[decision.action ?? "carried"];
      out.push(`  modified occurrences after the split (${decision.conflicts.length}) ${fate}:`);
      out.push(...lines(decision.conflicts).map((l) => `  ${l}`));
    }
    if (kept.length > 0) {
      out.push(
        `  modified occurrences after the split (${kept.length}) would keep their own values for the fields not changed:`,
      );
      out.push(...lines(kept).map((l) => `  ${l}`));
    }
  }
  if (plan.deleted.length > 0) {
    const fate = !decision.timeChanges
      ? "would stay deleted"
      : decision.action === "abort"
        ? "would come back; the update will abort unless --overwrite-exceptions is given"
        : "would come back";
    out.push(`  deleted occurrences after the split (${plan.deleted.length}) ${fate}:`);
    out.push(...deletedLines(plan.deleted).map((l) => `  ${l}`));
  }
  opts.write(out.join("\n"));
}
