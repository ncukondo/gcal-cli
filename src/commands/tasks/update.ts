import type { GoogleTasksClient, UpdateTaskInput } from "../../lib/tasks-api.ts";
import { updateTask } from "../../lib/tasks-api.ts";
import { formatJsonError, formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskUpdateOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  title?: string;
  notes?: string;
  due?: string;
  list?: string;
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().startsWith(value);
}

export async function handleTaskUpdate(opts: HandleTaskUpdateOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  // Validate at least one update option
  const hasUpdate =
    opts.title !== undefined || opts.notes !== undefined || opts.due !== undefined;

  if (!hasUpdate) {
    const msg = "at least one update option must be provided (--title, --notes, or --due)";
    if (format === "json") {
      write(formatJsonError("INVALID_ARGS", msg));
    } else {
      write(`Error: ${msg}`);
    }
    return { exitCode: ExitCode.ARGUMENT };
  }

  // Validate due date
  if (opts.due !== undefined && !isValidDateString(opts.due)) {
    const msg = `Invalid date format: ${opts.due} (expected YYYY-MM-DD)`;
    if (format === "json") {
      write(formatJsonError("INVALID_ARGS", msg));
    } else {
      write(`Error: ${msg}`);
    }
    return { exitCode: ExitCode.ARGUMENT };
  }

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);

  const input: UpdateTaskInput = {};
  if (opts.title !== undefined) {
    input.title = opts.title;
  }
  if (opts.notes !== undefined) {
    input.notes = opts.notes;
  }
  if (opts.due !== undefined) {
    input.due = `${opts.due}T00:00:00.000Z`;
  }

  const task = await updateTask(client, resolved.id, resolved.title, taskId, input);

  if (format === "json") {
    write(formatJsonSuccess({ task, message: "Task updated" }));
  } else if (quiet) {
    write(task.id);
  } else {
    write(`Task updated: ${task.title} (${task.id})`);
  }

  return { exitCode: ExitCode.SUCCESS };
}
