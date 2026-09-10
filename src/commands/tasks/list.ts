import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { listTasks } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { addDaysToDateString, todayInZone } from "../../lib/date-utils.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, Task, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  // Verify round-trip (catches invalid dates like 2026-02-30)
  return date.toISOString().startsWith(value);
}

export interface HandleTaskListOptions {
  client: GoogleTasksClient;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
  all?: boolean;
  completed?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  /** Tasks due today. Sugar for --due-after T --due-before T. */
  today?: boolean;
  /** Tasks due today or earlier. Sugar for --due-before T. */
  overdue?: boolean;
  /** Tasks due within the next n days, today included. Sugar for --due-after T --due-before T+n-1. */
  days?: number;
  /** IANA timezone used to decide what "today" is (same basis as `gcal list --today`). */
  timezone?: string;
  /** Clock override for tests. */
  now?: () => Date;
}

/**
 * Translate the --today / --overdue / --days shortcuts into dueAfter / dueBefore.
 * Returns an error message when --days is not a positive integer.
 */
export function resolveDueShortcuts(
  opts: { today?: boolean; overdue?: boolean; days?: number },
  timezone: string,
  now: () => Date,
): { dueAfter?: string; dueBefore?: string } | { error: string } {
  const range: { dueAfter?: string; dueBefore?: string } = {};
  if (opts.today) {
    const today = todayInZone(now(), timezone);
    range.dueAfter = today;
    range.dueBefore = today;
  }
  if (opts.overdue) {
    range.dueBefore = todayInZone(now(), timezone);
  }
  if (opts.days !== undefined) {
    if (!Number.isInteger(opts.days) || opts.days <= 0) {
      return { error: "--days must be a positive integer" };
    }
    const today = todayInZone(now(), timezone);
    range.dueAfter = today;
    range.dueBefore = addDaysToDateString(today, opts.days - 1);
  }
  return range;
}

function formatDueInfo(task: Task): string {
  const parts: string[] = [];
  if (task.due) {
    const month = task.due.slice(5, 7);
    const day = task.due.slice(8, 10);
    parts.push(`due: ${month}/${day}`);
  }
  if (task.status === "completed" && task.completed) {
    const month = task.completed.slice(5, 7);
    const day = task.completed.slice(8, 10);
    parts.push(`completed: ${month}/${day}`);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatTaskLine(task: Task): string {
  const checkbox = task.status === "completed" ? "☑" : "□";
  return `${checkbox} ${task.title}${formatDueInfo(task)}`;
}

function formatTaskListText(listTitle: string, tasks: Task[]): string {
  const lines = [`${listTitle}:`];
  for (const task of tasks) {
    lines.push(`  ${formatTaskLine(task)}`);
    if (task.notes) {
      const firstLine = task.notes.split("\n")[0]!;
      lines.push(`    Notes: ${firstLine}`);
    }
  }
  return lines.join("\n");
}

function formatQuietTaskList(tasks: Task[]): string {
  return tasks.map((task) => formatTaskLine(task)).join("\n");
}

function filterTasks(
  tasks: Task[],
  options: { all: boolean; completed: boolean; dueBefore?: string; dueAfter?: string },
): Task[] {
  let filtered = tasks;

  // Status filter
  if (options.completed) {
    filtered = filtered.filter((t) => t.status === "completed");
  } else if (!options.all) {
    filtered = filtered.filter((t) => t.status === "needsAction");
  }

  // Due date filters
  if (options.dueBefore) {
    filtered = filtered.filter((t) => t.due !== null && t.due <= options.dueBefore!);
  }
  if (options.dueAfter) {
    filtered = filtered.filter((t) => t.due !== null && t.due >= options.dueAfter!);
  }

  return filtered;
}

/**
 * Sort tasks by due date ascending. `due` is already normalized to YYYY-MM-DD,
 * so plain string comparison is enough. Tasks without a due date go last.
 * The sort is stable: tasks with equal due (or no due) keep API order.
 */
export function sortTasksByDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.due === b.due) return 0;
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  });
}

export async function handleTaskList(opts: HandleTaskListOptions): Promise<CommandResult> {
  const { client, format, quiet, write, configTaskLists, all, completed } = opts;
  let { dueBefore, dueAfter } = opts;

  const shortcut = resolveDueShortcuts(
    opts,
    opts.timezone ?? "UTC",
    opts.now ?? (() => new Date()),
  );
  if ("error" in shortcut) {
    write(`Error: ${shortcut.error}`);
    return { exitCode: ExitCode.ARGUMENT };
  }
  if (shortcut.dueAfter !== undefined) dueAfter = shortcut.dueAfter;
  if (shortcut.dueBefore !== undefined) dueBefore = shortcut.dueBefore;

  if (dueBefore !== undefined && !isValidDateString(dueBefore)) {
    write(`Error: Invalid date for --due-before: "${dueBefore}". Expected format: YYYY-MM-DD`);
    return { exitCode: ExitCode.ARGUMENT };
  }
  if (dueAfter !== undefined && !isValidDateString(dueAfter)) {
    write(`Error: Invalid date for --due-after: "${dueAfter}". Expected format: YYYY-MM-DD`);
    return { exitCode: ExitCode.ARGUMENT };
  }

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);

  const apiOptions: {
    showCompleted?: boolean;
    showHidden?: boolean;
  } = {};
  if (all || completed) {
    apiOptions.showCompleted = true;
    apiOptions.showHidden = true;
  }

  const allTasks = await listTasks(client, resolved.id, resolved.title, apiOptions);
  const filterOpts: { all: boolean; completed: boolean; dueBefore?: string; dueAfter?: string } = {
    all: all ?? false,
    completed: completed ?? false,
  };
  if (dueBefore !== undefined) filterOpts.dueBefore = dueBefore;
  if (dueAfter !== undefined) filterOpts.dueAfter = dueAfter;
  const tasks = sortTasksByDue(filterTasks(allTasks, filterOpts));

  if (quiet) {
    write(formatQuietTaskList(tasks));
    return { exitCode: ExitCode.SUCCESS };
  }

  if (format === "json") {
    write(
      formatJsonSuccess({
        tasks,
        count: tasks.length,
        list_id: resolved.id,
        list_title: resolved.title,
      }),
    );
  } else {
    write(formatTaskListText(resolved.title, tasks));
  }

  return { exitCode: ExitCode.SUCCESS };
}
