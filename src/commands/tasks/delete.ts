import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { deleteTask } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";
import { resolveTaskList } from "./resolve.ts";

export interface HandleTaskDeleteOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
}

export async function handleTaskDelete(opts: HandleTaskDeleteOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);

  await deleteTask(client, resolved.id, taskId);

  if (!quiet) {
    if (format === "json") {
      write(formatJsonSuccess({ deleted_id: taskId, message: "Task deleted" }));
    } else {
      write(`Task deleted (${taskId})`);
    }
  }

  return { exitCode: ExitCode.SUCCESS };
}
