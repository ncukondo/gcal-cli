import { Command } from "commander";
import { collect, meetFollowUpNote } from "./shared.ts";
import type {
  AttendeeInput,
  FetchedEvent,
  GoogleCalendarApi,
  UpdateEventInput,
} from "../lib/api.ts";
import { updateEvent, ApiError, listInstances, patchInstance } from "../lib/api.ts";
import {
  RESTORABLE_FIELDS,
  buildRestoreBody,
  findOverriddenInstances,
  isRecurringMaster,
} from "../lib/recurring-exceptions.ts";
import type { ExceptionField, OverriddenInstance } from "../lib/recurring-exceptions.ts";
import { prepareSplit, runSplit } from "./update-split.ts";
import type { SplitTarget } from "./update-split.ts";
import { formatEventDetailText, formatJsonSuccess } from "../lib/output.ts";
import { formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import { isDateOnly, addDaysToDateString } from "../lib/date-utils.ts";
import { parseDuration } from "../lib/duration.ts";
import { NOTIFY_CHOICES, parseAttendees, parseNotify } from "../lib/attendees.ts";
import type { OutputFormat, CommandResult, CalendarEvent, EventAttendee } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UpdateHandlerOptions {
  api: GoogleCalendarApi;
  eventId: string;
  calendarId: string;
  calendarName: string;
  format: OutputFormat;
  quiet?: boolean;
  timezone: string;
  write: (msg: string) => void;
  writeStderr: (msg: string) => void;
  /**
   * Returns the raw response alongside the normalized event: the guest list
   * diff merges the raw attendees, and it has to be the same snapshot the new
   * times are derived from.
   */
  getEvent: (
    calendarId: string,
    calendarName: string,
    eventId: string,
    timezone?: string,
  ) => Promise<FetchedEvent>;
  title?: string;
  start?: string;
  end?: string;
  duration?: string;
  description?: string;
  busy?: boolean;
  free?: boolean;
  dryRun?: boolean;
  /** Replaces the whole guest list. See spec/commands.md for the rationale. */
  attendee?: string[];
  clearAttendees?: boolean;
  /** Adds to the current guest list, resolved by read-modify-write. */
  addAttendee?: string[];
  /** Drops from the current guest list, resolved by read-modify-write. */
  removeAttendee?: string[];
  notify?: string;
  /** Attach a freshly created Google Meet conference. */
  meet?: boolean;
  /** Detach the conference currently attached to the event. */
  removeMeet?: boolean;
  /**
   * On a recurring series, write the modified occurrences' own values back
   * after updating the series. See spec/commands.md.
   */
  preserveExceptions?: boolean;
  /** On a recurring series, let the update replace the modified occurrences' own values. */
  overwriteExceptions?: boolean;
  /**
   * Split the series at this occurrence and update the new series, as the web
   * UI's "This and following events" does. See spec/commands.md.
   */
  thisAndFollowing?: boolean;
}

interface ResolvedTime {
  start: string;
  end: string;
  allDay: boolean;
  existingEvent?: CalendarEvent;
}

function resolveTimedEvent(startStr: string, endStr: string, timezone: string): ResolvedTime {
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const parsedEnd = parseDateTimeInZone(endStr, timezone);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(parsedEnd, timezone),
    allDay: false,
  };
}

function resolveAllDayEvent(startStr: string, endStr: string): ResolvedTime {
  // Inclusive end → exclusive end (+1 day)
  return {
    start: startStr,
    end: addDaysToDateString(endStr, 1),
    allDay: true,
  };
}

function resolveStartAndEnd(
  startStr: string,
  endStr: string,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    return resolveAllDayEvent(startStr, endStr);
  }
  return resolveTimedEvent(startStr, endStr, timezone);
}

function resolveStartAndDuration(
  startStr: string,
  durationMs: number,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const days = durationMs / MS_PER_DAY;
    return {
      start: startStr,
      end: addDaysToDateString(startStr, days),
      allDay: true,
    };
  }
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const endDate = new Date(parsedStart.getTime() + durationMs);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
  };
}

function resolveStartOnly(
  startStr: string,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const existingStartMs = new Date(existing.start).getTime();
    const existingEndMs = new Date(existing.end).getTime();
    const durationDays = Math.round((existingEndMs - existingStartMs) / MS_PER_DAY);
    return {
      start: startStr,
      end: addDaysToDateString(startStr, durationDays),
      allDay: true,
      existingEvent: existing,
    };
  }
  const existingStartMs = new Date(existing.start).getTime();
  const existingEndMs = new Date(existing.end).getTime();
  const durationMs = existingEndMs - existingStartMs;
  const parsedStart = parseDateTimeInZone(startStr, timezone);
  const endDate = new Date(parsedStart.getTime() + durationMs);
  return {
    start: formatDateTimeInZone(parsedStart, timezone),
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

function resolveEndOnly(
  endStr: string,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    return {
      start: existing.start,
      end: addDaysToDateString(endStr, 1),
      allDay: true,
      existingEvent: existing,
    };
  }
  const parsedEnd = parseDateTimeInZone(endStr, timezone);
  return {
    start: existing.start,
    end: formatDateTimeInZone(parsedEnd, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

function resolveDurationOnly(
  durationMs: number,
  existing: CalendarEvent,
  allDay: boolean,
  timezone: string,
): ResolvedTime {
  if (allDay) {
    const days = durationMs / MS_PER_DAY;
    return {
      start: existing.start,
      end: addDaysToDateString(existing.start, days),
      allDay: true,
      existingEvent: existing,
    };
  }
  const existingStartMs = new Date(existing.start).getTime();
  const endDate = new Date(existingStartMs + durationMs);
  return {
    start: existing.start,
    end: formatDateTimeInZone(endDate, timezone),
    allDay: false,
    existingEvent: existing,
  };
}

/**
 * Whether the new times can only be derived from the event's current ones.
 * Kept separate from resolveTimeUpdate so the handler can fetch the event once
 * and share that snapshot with the attendee checks.
 */
function needsExistingForTime(opts: UpdateHandlerOptions): boolean {
  const hasStart = opts.start !== undefined;
  const hasEnd = opts.end !== undefined;
  const hasDuration = opts.duration !== undefined;
  return (
    (hasStart && !hasEnd && !hasDuration) || (hasEnd && !hasStart) || (hasDuration && !hasStart)
  );
}

function resolveTimeUpdate(
  opts: UpdateHandlerOptions,
  existing: CalendarEvent | undefined,
): ResolvedTime | null {
  const { timezone } = opts;
  const hasStart = opts.start !== undefined;
  const hasEnd = opts.end !== undefined;
  const hasDuration = opts.duration !== undefined;

  if (!hasStart && !hasEnd && !hasDuration) return null;

  // Parse duration once when present
  const durationMs = hasDuration ? parseDuration(opts.duration!) : undefined;

  // Determine allDay from start format, or from existing event
  const allDay = hasStart ? isDateOnly(opts.start!) : existing!.all_day;

  // Validate start/end type consistency
  if (hasStart && hasEnd) {
    const startIsDateOnly = isDateOnly(opts.start!);
    const endIsDateOnly = isDateOnly(opts.end!);
    if (startIsDateOnly !== endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--start and --end must be the same type (both date-only or both datetime)",
      );
    }
  }

  // Validate --end only format matches existing event type
  if (hasEnd && !hasStart && existing) {
    const endIsDateOnly = isDateOnly(opts.end!);
    if (existing.all_day && !endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--end format (datetime) does not match existing event type (all-day). Use date-only format (YYYY-MM-DD) or provide --start to change event type.",
      );
    }
    if (!existing.all_day && endIsDateOnly) {
      throw new ApiError(
        "INVALID_ARGS",
        "--end format (date-only) does not match existing event type (timed). Use datetime format (YYYY-MM-DDTHH:MM) or provide --start to change event type.",
      );
    }
  }

  // Validate all-day duration
  if (durationMs !== undefined && allDay) {
    if (durationMs % MS_PER_DAY !== 0) {
      throw new ApiError(
        "INVALID_ARGS",
        "All-day events require day-unit duration (e.g. 1d, 2d). Sub-day durations like hours or minutes are not allowed.",
      );
    }
  }

  if (hasStart && hasEnd) {
    return resolveStartAndEnd(opts.start!, opts.end!, allDay, timezone);
  }

  if (hasStart && durationMs !== undefined) {
    return resolveStartAndDuration(opts.start!, durationMs, allDay, timezone);
  }

  if (hasStart) {
    return resolveStartOnly(opts.start!, existing!, allDay, timezone);
  }

  if (hasEnd) {
    return resolveEndOnly(opts.end!, existing!, allDay, timezone);
  }

  if (durationMs !== undefined) {
    return resolveDurationOnly(durationMs, existing!, allDay, timezone);
  }

  return null;
}

/** What a guest list diff will do, as addresses, for the notes and the dry run. */
interface AttendeeDiffPreview {
  merged: string[];
  added: string[];
  removed: string[];
}

/**
 * Applies the CLI's policy to a diff and previews the outcome. The write itself
 * is merged again in the API layer, against the raw attendee objects, so that
 * fields this projection does not carry survive the round trip; this pass only
 * decides what to reject and what to tell the user.
 */
function previewAttendeeDiff(
  current: EventAttendee[],
  add: AttendeeInput[],
  remove: AttendeeInput[],
  writeStderr: (msg: string) => void,
): AttendeeDiffPreview {
  // Google matches addresses case-insensitively, so the CLI has to as well.
  const removeKeys = new Set(remove.map((a) => a.email.toLowerCase()));

  const organizer = current.find((a) => a.organizer && removeKeys.has(a.email.toLowerCase()));
  if (organizer) {
    throw new ApiError(
      "INVALID_ARGS",
      `--remove-attendee cannot remove the event organizer (${organizer.email}).`,
    );
  }

  for (const attendee of remove) {
    const key = attendee.email.toLowerCase();
    if (!current.some((a) => a.email.toLowerCase() === key)) {
      // Removing a non-attendee is a no-op so that repeating the command is safe.
      writeStderr(`Note: ${attendee.email} is not an attendee of this event; nothing to remove.`);
    }
  }

  const kept = current.filter((a) => !removeKeys.has(a.email.toLowerCase()));
  const removed = current.filter((a) => removeKeys.has(a.email.toLowerCase()));
  const merged = kept.map((a) => a.email);

  const added: string[] = [];
  for (const attendee of add) {
    const key = attendee.email.toLowerCase();
    if (merged.some((email) => email.toLowerCase() === key)) continue;
    merged.push(attendee.email);
    added.push(attendee.email);
  }

  return { merged, added, removed: removed.map((a) => a.email) };
}

/** An affected occurrence as reported to the user, without the raw response. */
interface ExceptionSummary {
  id: string;
  start: string;
  original_start: string;
  fields: ExceptionField[];
}

interface RestoreFailure {
  id: string;
  start: string;
  error: string;
  /** What the occurrence held, so it can be put back by hand. */
  values: Record<string, unknown>;
}

function summarizeException(instance: OverriddenInstance): ExceptionSummary {
  return {
    id: instance.id,
    start: instance.start,
    original_start: instance.original_start,
    fields: instance.fields,
  };
}

function formatExceptionLines(instances: OverriddenInstance[]): string[] {
  return instances.map((i) => `  ${i.id}  ${i.start}  (${i.fields.join(", ")})`);
}

/** The fields this update writes, in the terms an occurrence can override them. */
function changingFields(
  input: UpdateEventInput,
  attendeeDiff: AttendeeDiffPreview | undefined,
): ExceptionField[] {
  const fields: ExceptionField[] = [];
  if (input.title !== undefined) fields.push("title");
  if (input.description !== undefined) fields.push("description");
  if (input.transparency !== undefined) fields.push("transparency");
  const diffChanges =
    attendeeDiff !== undefined && attendeeDiff.added.length + attendeeDiff.removed.length > 0;
  if (input.attendees !== undefined || diffChanges) fields.push("attendees");
  if (input.meet || input.removeMeet) fields.push("conference");
  if (input.start !== undefined) fields.push("time");
  return fields;
}

/**
 * Patching a series master overwrites the fields it writes on every occurrence,
 * modified ones included; changing its time resets them outright. So a series
 * update first looks for occurrences that would lose their own values, and
 * refuses to go ahead silently. Returns what to do with them.
 */
function decideExceptionAction(
  opts: UpdateHandlerOptions,
  changing: ExceptionField[],
  affected: OverriddenInstance[],
): "preserve" | "overwrite" | "abort" {
  const list = formatExceptionLines(affected).join("\n");
  const resetsAll = changing.includes("time");
  const unrestorable = affected.some(
    (i) => resetsAll || i.fields.some((f) => !RESTORABLE_FIELDS.includes(f)),
  );

  if (opts.preserveExceptions) {
    if (unrestorable) {
      const why = resetsAll
        ? "Changing the time of a series makes Google reset every modified occurrence"
        : "--preserve-exceptions can only restore title, description, free/busy and guests";
      throw new ApiError(
        "INVALID_ARGS",
        `${why}, so these occurrences cannot be preserved:\n${list}\n` +
          "Re-run with --overwrite-exceptions to replace them, or update the series without this change.",
      );
    }
    return "preserve";
  }
  if (opts.overwriteExceptions) return "overwrite";
  if (opts.dryRun) return "abort";

  const hint = resetsAll
    ? "Changing the time of a series resets every modified occurrence. Re-run with --overwrite-exceptions to proceed anyway."
    : "Re-run with --preserve-exceptions to keep their values, or --overwrite-exceptions to replace them (--dry-run previews).";
  throw new ApiError(
    "INVALID_ARGS",
    `Event "${opts.eventId}" is a recurring series, and ${affected.length} occurrence(s) have their own values that this update would overwrite:\n${list}\n${hint}`,
  );
}

/** What an update writes, as the dry run shows it. */
function describeChanges(
  opts: UpdateHandlerOptions,
  input: UpdateEventInput,
  replacement: AttendeeInput[] | undefined,
  attendeeDiff: AttendeeDiffPreview | undefined,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description;
  if (input.transparency !== undefined) changes.transparency = input.transparency;
  if (replacement) {
    changes.attendees = replacement.map((a) => a.email);
  } else if (attendeeDiff) {
    changes.attendees = attendeeDiff.merged;
    changes.attendees_added = attendeeDiff.added;
    changes.attendees_removed = attendeeDiff.removed;
  }
  if (opts.notify !== undefined) changes.notify = opts.notify;
  // The requestId is minted by the API layer, so a dry run never allocates one.
  if (opts.meet) changes.meet = true;
  if (opts.removeMeet) changes.remove_meet = true;
  const withTime = input as UpdateEventInput & { start?: string; end?: string; allDay?: boolean };
  if (withTime.start !== undefined) changes.start = withTime.start;
  if (withTime.end !== undefined) changes.end = withTime.end;
  if (withTime.allDay !== undefined) changes.allDay = withTime.allDay;
  return changes;
}

function formatChangeLines(
  changes: Record<string, unknown>,
  attendeeDiff: AttendeeDiffPreview | undefined,
): string[] {
  const lines: string[] = [];
  if (changes.title !== undefined) lines.push(`  title: "${changes.title}"`);
  if (changes.start !== undefined) lines.push(`  start: "${changes.start}"`);
  if (changes.end !== undefined) lines.push(`  end: "${changes.end}"`);
  if (changes.description !== undefined) lines.push(`  description: "${changes.description}"`);
  if (changes.transparency !== undefined) lines.push(`  transparency: ${changes.transparency}`);
  if (changes.attendees !== undefined) {
    const list = changes.attendees as string[];
    let line = `  attendees: ${list.length > 0 ? list.join(", ") : "(none)"}`;
    const diff = [
      ...(attendeeDiff?.added ?? []).map((email) => `+${email}`),
      ...(attendeeDiff?.removed ?? []).map((email) => `-${email}`),
    ];
    if (diff.length > 0) line += `   (${diff.join(", ")})`;
    lines.push(line);
  }
  if (changes.notify !== undefined) lines.push(`  notify: ${String(changes.notify)}`);
  if (changes.meet !== undefined) lines.push(`  meet: ${String(changes.meet)}`);
  if (changes.remove_meet !== undefined) {
    lines.push(`  remove_meet: ${String(changes.remove_meet)}`);
  }
  return lines;
}

export async function handleUpdate(opts: UpdateHandlerOptions): Promise<CommandResult> {
  const { api, eventId, calendarId, calendarName, format, timezone, write } = opts;

  const hasUpdate =
    opts.title !== undefined ||
    opts.start !== undefined ||
    opts.end !== undefined ||
    opts.duration !== undefined ||
    opts.description !== undefined ||
    opts.busy !== undefined ||
    opts.free !== undefined ||
    (opts.attendee !== undefined && opts.attendee.length > 0) ||
    opts.clearAttendees === true ||
    (opts.addAttendee !== undefined && opts.addAttendee.length > 0) ||
    (opts.removeAttendee !== undefined && opts.removeAttendee.length > 0) ||
    opts.meet === true ||
    opts.removeMeet === true;

  if (!hasUpdate) {
    throw new ApiError("INVALID_ARGS", "at least one update option must be provided");
  }

  let attendees;
  let addAttendees;
  let removeAttendees;
  let sendUpdates;
  try {
    attendees = opts.clearAttendees ? [] : parseAttendees(opts.attendee ?? []);
    addAttendees = parseAttendees(opts.addAttendee ?? []);
    removeAttendees = parseAttendees(opts.removeAttendee ?? []);
    sendUpdates = parseNotify(opts.notify);
  } catch (err) {
    throw new ApiError("INVALID_ARGS", (err as Error).message);
  }

  const addKeys = new Set(addAttendees.map((a) => a.email.toLowerCase()));
  const bothWays = removeAttendees.find((a) => addKeys.has(a.email.toLowerCase()));
  if (bothWays) {
    throw new ApiError(
      "INVALID_ARGS",
      `${bothWays.email} is given to both --add-attendee and --remove-attendee.`,
    );
  }

  const replacesAttendees = opts.clearAttendees === true || attendees.length > 0;
  const editsAttendees = addAttendees.length > 0 || removeAttendees.length > 0;
  // Commander already keeps the two modes apart on the CLI, but handleUpdate is
  // exported: without this the diff would be computed and then silently dropped.
  if (replacesAttendees && editsAttendees) {
    throw new ApiError(
      "INVALID_ARGS",
      "--attendee / --clear-attendees cannot be combined with --add-attendee / --remove-attendee",
    );
  }

  if (opts.preserveExceptions && opts.overwriteExceptions) {
    throw new ApiError(
      "INVALID_ARGS",
      "--preserve-exceptions and --overwrite-exceptions cannot be combined",
    );
  }

  // The one read. The new times, the attendee policy, the dry-run preview, the
  // guest list that gets written and the recurring-series check all come from
  // this single snapshot. It is made for every update: only the event itself
  // says whether it is a series master whose occurrences the patch would hit.
  let existing: FetchedEvent = await opts.getEvent(calendarId, calendarName, eventId, timezone);

  // A split updates the new series, so from here on the update works against
  // that series as it would be, not against the occurrence it was given.
  let split: SplitTarget | undefined;
  if (opts.thisAndFollowing) {
    const prepared = await prepareSplit(api, calendarId, calendarName, eventId, existing, (id) =>
      opts.getEvent(calendarId, calendarName, id, timezone),
    );
    if ("masterId" in prepared) {
      if (!opts.quiet) {
        opts.writeStderr(
          `Note: ${eventId} is the first occurrence of its series, so the whole series ${prepared.masterId} is updated.`,
        );
      }
      return handleUpdate({ ...opts, eventId: prepared.masterId, thisAndFollowing: false });
    }
    split = prepared;
    existing = prepared.snapshot;
  }

  let attendeeDiff: AttendeeDiffPreview | undefined;
  if (editsAttendees) {
    attendeeDiff = previewAttendeeDiff(
      existing!.event.attendees,
      addAttendees,
      removeAttendees,
      opts.writeStderr,
    );
  }

  const input: UpdateEventInput = {};

  if (replacesAttendees) {
    input.attendees = attendees;
  } else if (editsAttendees) {
    // The API layer merges this against the raw attendee objects and drops the
    // write entirely when it turns out to change nothing.
    input.attendeeDiff = {
      add: addAttendees,
      removeEmails: removeAttendees.map((a) => a.email),
      base: existing!.raw.attendees ?? [],
    };
  }
  if (opts.meet) {
    input.meet = true;
  } else if (opts.removeMeet) {
    input.removeMeet = true;
  }
  input.sendUpdates = sendUpdates;

  if (opts.title !== undefined) {
    input.title = opts.title;
  }

  if (opts.description !== undefined) {
    input.description = opts.description;
  }

  if (opts.busy) {
    input.transparency = "opaque";
  } else if (opts.free) {
    input.transparency = "transparent";
  }

  const timeResult = resolveTimeUpdate(
    opts,
    needsExistingForTime(opts) ? existing.event : undefined,
  );
  if (timeResult) {
    const withTime = input as UpdateEventInput & { start: string; end: string; allDay: boolean };
    withTime.start = timeResult.start;
    withTime.end = timeResult.end;
    withTime.allDay = timeResult.allDay;
    input.timeZone = timezone;

    // Type conversion warning (only fetch existing if not already available)
    if (timeResult.existingEvent) {
      const existing = timeResult.existingEvent;
      if (existing.all_day && !timeResult.allDay) {
        opts.writeStderr("\u26A0 Event type changed from all-day to timed");
      } else if (!existing.all_day && timeResult.allDay) {
        opts.writeStderr("\u26A0 Event type changed from timed to all-day");
      }
    }
  }

  let affected: OverriddenInstance[] = [];
  let exceptionAction: "preserve" | "overwrite" | "abort" | undefined;
  const changing = changingFields(input, attendeeDiff);

  if (split) {
    const changes = describeChanges(
      opts,
      input,
      replacesAttendees ? attendees : undefined,
      attendeeDiff,
    );
    return runSplit(
      opts,
      split,
      input,
      changing,
      changes,
      formatChangeLines(changes, attendeeDiff),
    );
  }
  if (isRecurringMaster(existing.raw) && changing.length > 0) {
    const instances = await listInstances(api, calendarId, eventId);
    affected = findOverriddenInstances(existing.raw, instances, changing);
    if (affected.length > 0) {
      exceptionAction = decideExceptionAction(opts, changing, affected);
    }
  }

  if (opts.dryRun) {
    const changes = describeChanges(
      opts,
      input,
      replacesAttendees ? attendees : undefined,
      attendeeDiff,
    );

    if (format === "json") {
      const data: Record<string, unknown> = {
        dry_run: true,
        action: "update",
        event_id: eventId,
        changes,
      };
      if (exceptionAction) {
        data.exceptions = {
          action: exceptionAction,
          instances: affected.map(summarizeException),
        };
      }
      write(formatJsonSuccess(data));
    } else {
      const lines = [
        `DRY RUN: Would update event "${eventId}":`,
        ...formatChangeLines(changes, attendeeDiff),
      ];
      if (exceptionAction) {
        const fate = {
          preserve: "would be restored after the update (--preserve-exceptions)",
          overwrite: "would be overwritten (--overwrite-exceptions)",
          abort:
            "would be overwritten; the update will abort unless --preserve-exceptions or --overwrite-exceptions is given",
        }[exceptionAction];
        lines.push(`  modified occurrences (${affected.length}) ${fate}:`);
        lines.push(...formatExceptionLines(affected).map((l) => `  ${l}`));
      }
      write(lines.join("\n"));
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  const updated = await updateEvent(api, calendarId, calendarName, eventId, input);

  // The series is already written; a failed restore is reported with the values
  // it was meant to write, so nothing is lost even then.
  const failed: RestoreFailure[] = [];
  if (exceptionAction === "preserve") {
    for (const instance of affected) {
      const body = buildRestoreBody(instance.raw, instance.fields);
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
  }

  if (opts.meet && !opts.quiet) {
    const note = meetFollowUpNote(updated);
    if (note) opts.writeStderr(note);
  }

  if (format === "json") {
    const data: Record<string, unknown> = { event: updated, message: "Event updated" };
    if (exceptionAction) {
      data.exceptions = {
        action: exceptionAction === "preserve" ? "preserved" : "overwritten",
        instances: affected.map(summarizeException),
        failed,
      };
    }
    write(formatJsonSuccess(data));
  } else if (opts.quiet) {
    write(updated.id);
  } else {
    const detail = formatEventDetailText(updated);
    write(`Event updated\n\n${detail}`);
  }

  if (exceptionAction === "preserve") {
    const restored = affected.length - failed.length;
    if (restored > 0 && !opts.quiet) {
      opts.writeStderr(`Restored ${restored} modified occurrence(s) to their own values.`);
    }
    for (const f of failed) {
      opts.writeStderr(
        `\u26A0 Could not restore occurrence ${f.id} (${f.start}): ${f.error}\n` +
          `  Its own values were: ${JSON.stringify(f.values)}`,
      );
    }
  } else if (exceptionAction === "overwrite" && !opts.quiet) {
    opts.writeStderr(
      `Overwrote ${affected.length} modified occurrence(s):\n${formatExceptionLines(affected).join("\n")}`,
    );
  }

  return { exitCode: failed.length > 0 ? ExitCode.GENERAL : ExitCode.SUCCESS };
}

export function createUpdateCommand(): Command {
  const cmd = new Command("update")
    .description("Update an existing event")
    .argument("<event-id>", "Event ID to update");

  cmd.option("-c, --calendar <id>", "Calendar ID");
  cmd.option("-t, --title <title>", "New title");
  cmd.option(
    "-s, --start <datetime>",
    "Start date or datetime. Date-only (YYYY-MM-DD) → all-day. Datetime (YYYY-MM-DDTHH:MM) → timed. Can be specified alone (preserves existing duration).",
  );
  cmd.option(
    "-e, --end <datetime>",
    "End date or datetime. Can be specified alone (preserves existing start). All-day end is inclusive.",
  );
  cmd.option(
    "--duration <duration>",
    "Duration instead of --end (e.g. 30m, 1h, 2d, 1h30m). Mutually exclusive with --end. Can be specified alone (preserves existing start).",
  );
  cmd.option("-d, --description <text>", "New description");
  cmd.option("--busy", "Mark as busy");
  cmd.option("--free", "Mark as free");
  cmd.option(
    "-a, --attendee <email>",
    "Replace the guest list with these addresses (repeatable)",
    collect,
    [],
  );
  cmd.option("--clear-attendees", "Remove all attendees from the event");
  cmd.option(
    "--add-attendee <email>",
    "Add a guest, keeping the current guest list (repeatable)",
    collect,
    [],
  );
  cmd.option(
    "--remove-attendee <email>",
    "Remove a guest, keeping the rest of the guest list (repeatable)",
    collect,
    [],
  );
  cmd.option(
    "--notify <scope>",
    `Send update emails to ${NOTIFY_CHOICES.join(" | ")} (default: none)`,
  );
  cmd.option("--meet", "Create a Google Meet conference and attach it");
  cmd.option("--remove-meet", "Remove the Google Meet conference from the event");
  cmd.option(
    "--preserve-exceptions",
    "On a recurring series, keep occurrences that have their own values for the changed fields (restored after the update)",
  );
  cmd.option(
    "--overwrite-exceptions",
    "On a recurring series, let the update replace occurrences' own values for the changed fields",
  );
  cmd.option(
    "--this-and-following",
    "On an occurrence of a recurring series, update it and all following occurrences (splits the series)",
  );
  cmd.option("--dry-run", "Preview without executing");

  const preserveOpt = cmd.options.find((o) => o.long === "--preserve-exceptions")!;
  const overwriteOpt = cmd.options.find((o) => o.long === "--overwrite-exceptions")!;
  preserveOpt.conflicts(["overwriteExceptions"]);
  overwriteOpt.conflicts(["preserveExceptions"]);

  const meetOpt = cmd.options.find((o) => o.long === "--meet")!;
  const removeMeetOpt = cmd.options.find((o) => o.long === "--remove-meet")!;
  meetOpt.conflicts(["removeMeet"]);
  removeMeetOpt.conflicts(["meet"]);

  const attendeeOpt = cmd.options.find((o) => o.long === "--attendee")!;
  const clearAttendeesOpt = cmd.options.find((o) => o.long === "--clear-attendees")!;
  const addAttendeeOpt = cmd.options.find((o) => o.long === "--add-attendee")!;
  const removeAttendeeOpt = cmd.options.find((o) => o.long === "--remove-attendee")!;
  // Whole-list replacement and per-guest edits are different intents; keep them apart.
  attendeeOpt.conflicts(["clearAttendees", "addAttendee", "removeAttendee"]);
  clearAttendeesOpt.conflicts(["attendee", "addAttendee", "removeAttendee"]);
  addAttendeeOpt.conflicts(["attendee", "clearAttendees"]);
  removeAttendeeOpt.conflicts(["attendee", "clearAttendees"]);

  const endOpt = cmd.options.find((o) => o.long === "--end")!;
  const durationOpt = cmd.options.find((o) => o.long === "--duration")!;
  endOpt.conflicts(["duration"]);
  durationOpt.conflicts(["end"]);

  const busyOpt = cmd.options.find((o) => o.long === "--busy")!;
  const freeOpt = cmd.options.find((o) => o.long === "--free")!;
  busyOpt.conflicts(["free"]);
  freeOpt.conflicts(["busy"]);

  cmd.addHelpText(
    "after",
    `
Examples:
  gcal update abc123 -t "Updated Meeting"                                    # Title only
  gcal update abc123 -s "2026-01-24T11:00"                                   # Start only, keep duration
  gcal update abc123 -e "2026-01-24T12:00"                                   # End only, keep start
  gcal update abc123 --duration 2h                                           # Duration only, keep start
  gcal update abc123 -s "2026-01-24T11:00" -e "2026-01-24T12:30"            # Start + end
  gcal update abc123 -s "2026-01-24T10:00" --duration 30m                   # Start + duration
  gcal update abc123 -s "2026-03-01" -e "2026-03-03"                        # All-day, 3 days (inclusive)
  gcal update abc123 -s "2026-03-01" --duration 2d                          # All-day, 2 days
  gcal update abc123 --free                                                  # Transparency only
  gcal update abc123 --dry-run -t "Preview"                                  # Dry run
  gcal update abc123 -a alice@example.com                                    # Replace guest list
  gcal update abc123 --clear-attendees                                       # Remove all guests
  gcal update abc123 --add-attendee bob@example.com                          # Add one guest
  gcal update abc123 --remove-attendee carol@example.com                     # Drop one guest
  gcal update abc123 --meet                                                  # Attach a Meet link
  gcal update abc123 --remove-meet                                           # Drop the Meet link
  gcal update series1 -d "New agenda" --preserve-exceptions                  # Series: keep per-occurrence descriptions
  gcal update series1_20261023T010000Z -t "New" --this-and-following         # This and following occurrences

Recurring series:
  Updating a series master overwrites the changed fields on every occurrence,
  including occurrences edited individually. If any occurrence has its own value
  for a field being changed, the update aborts and lists them unless
  --preserve-exceptions or --overwrite-exceptions is given. Changing the time of
  a series resets every modified occurrence, so only --overwrite-exceptions
  applies then. --dry-run lists the affected occurrences.

This and following (--this-and-following):
  Given an occurrence ID, splits the series there as the web UI does: the
  original series ends before the occurrence, and a new series with the
  changes starts at it (ID <series>_R<start>; occurrence IDs stay the same).
  Occurrences after the split keep their own values for the fields not being
  changed, and deleted ones stay deleted. Own values for the changed fields
  follow --preserve-exceptions / --overwrite-exceptions as above. --notify
  covers the original series only: the new series is added without
  invitations. At the first occurrence, the whole series is updated instead.
  A series that was itself split off (ID ending in _R<start>) cannot be split
  again.
`,
  );

  return cmd;
}
