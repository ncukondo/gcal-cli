import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { completeTask } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskDoneOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
}

export async function handleTaskDone(opts: HandleTaskDoneOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);

  const task = await completeTask(client, resolved.id, resolved.title, taskId);

  if (format === "json") {
    write(formatJsonSuccess({ task, message: "Task completed" }));
  } else if (quiet) {
    write(task.id);
  } else {
    write(`Task completed: ${task.title} (${task.id})`);
  }

  return { exitCode: ExitCode.SUCCESS };
}
