import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { createTask } from "../../lib/tasks-api.ts";
import { formatJsonError, formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskAddOptions {
  client: GoogleTasksClient;
  title: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  notes?: string;
  due?: string;
  list?: string;
  parent?: string;
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().startsWith(value);
}

export async function handleTaskAdd(opts: HandleTaskAddOptions): Promise<CommandResult> {
  const { client, title, format, quiet, write, configTaskLists } = opts;

  // Validate title
  if (!title) {
    const msg = "--title is required";
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

  const input: { title: string; notes?: string; due?: string; parent?: string } = { title };
  if (opts.notes !== undefined) {
    input.notes = opts.notes;
  }
  if (opts.due !== undefined) {
    input.due = `${opts.due}T00:00:00.000Z`;
  }
  if (opts.parent !== undefined) {
    input.parent = opts.parent;
  }
  const task = await createTask(client, resolved.id, resolved.title, input);

  if (format === "json") {
    write(formatJsonSuccess({ task, message: "Task created" }));
  } else if (quiet) {
    write(task.id);
  } else {
    write(`Task created: ${task.title} (${task.id})`);
  }

  return { exitCode: ExitCode.SUCCESS };
}
