import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { getTask } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, Task, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskShowOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
}

const LABEL_WIDTH = 11;

function detailLine(label: string, value: string): string {
  return `${label}:`.padEnd(LABEL_WIDTH) + value;
}

function stripMilliseconds(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z");
}

function formatTaskDetailText(task: Task): string {
  const lines: string[] = [];
  lines.push(detailLine("ID", task.id));
  lines.push(detailLine("Title", task.title));
  lines.push(detailLine("Status", task.status));
  if (task.due) {
    lines.push(detailLine("Due", task.due));
  }
  if (task.notes) {
    lines.push(detailLine("Notes", task.notes));
  }
  lines.push(detailLine("List", task.list_title));
  lines.push(detailLine("Updated", stripMilliseconds(task.updated)));
  return lines.join("\n");
}

export async function handleTaskShow(opts: HandleTaskShowOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);
  const task = await getTask(client, resolved.id, resolved.title, taskId);

  if (format === "json") {
    write(formatJsonSuccess({ task }));
  } else if (quiet) {
    write(`${task.title}\t${task.status}\t${task.due ?? ""}`);
  } else {
    write(formatTaskDetailText(task));
  }

  return { exitCode: ExitCode.SUCCESS };
}
