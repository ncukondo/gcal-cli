import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { uncompleteTask } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskUndoneOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
}

export async function handleTaskUndone(opts: HandleTaskUndoneOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);

  const task = await uncompleteTask(client, resolved.id, resolved.title, taskId);

  if (format === "json") {
    write(formatJsonSuccess({ task, message: "Task reopened" }));
  } else if (quiet) {
    write(task.id);
  } else {
    write(`Task reopened: ${task.title} (${task.id})`);
  }

  return { exitCode: ExitCode.SUCCESS };
}
