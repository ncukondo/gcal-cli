import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { getTask, listTaskLists } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, Task, TaskListConfig } from "../../types/index.ts";

export interface HandleTaskShowOptions {
  client: GoogleTasksClient;
  taskId: string;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
  list?: string;
}

function resolveTaskListFromConfig(
  configLists: TaskListConfig[],
  listOption?: string,
): { id: string; title: string } | null {
  if (!listOption) {
    const enabled = configLists.find((c) => c.enabled);
    if (enabled) return { id: enabled.id, title: enabled.name };
    return null;
  }

  const byName = configLists.find((c) => c.name === listOption);
  if (byName) return { id: byName.id, title: byName.name };

  const byId = configLists.find((c) => c.id === listOption);
  if (byId) return { id: byId.id, title: byId.name };

  return null;
}

async function resolveTaskList(
  client: GoogleTasksClient,
  configLists: TaskListConfig[],
  listOption?: string,
): Promise<{ id: string; title: string }> {
  const fromConfig = resolveTaskListFromConfig(configLists, listOption);
  if (fromConfig) return fromConfig;

  if (listOption) {
    const apiLists = await listTaskLists(client);
    const byTitle = apiLists.find((l) => l.title === listOption);
    if (byTitle) return { id: byTitle.id, title: byTitle.title };
    return { id: listOption, title: listOption };
  }

  return { id: "@default", title: "My Tasks" };
}

const LABEL_WIDTH = 11;

function detailLine(label: string, value: string): string {
  return `${label}:`.padEnd(LABEL_WIDTH) + value;
}

function formatTaskDetailText(task: Task): string {
  const lines: string[] = [];
  lines.push(detailLine("Title", task.title));
  lines.push(detailLine("Status", task.status));
  if (task.due) {
    lines.push(detailLine("Due", task.due));
  }
  if (task.notes) {
    lines.push(detailLine("Notes", task.notes));
  }
  lines.push(detailLine("List", task.list_title));
  lines.push(detailLine("Updated", task.updated));
  return lines.join("\n");
}

export async function handleTaskShow(opts: HandleTaskShowOptions): Promise<CommandResult> {
  const { client, taskId, format, quiet, write, configTaskLists } = opts;

  const resolved = await resolveTaskList(client, configTaskLists, opts.list);
  const task = await getTask(client, resolved.id, resolved.title, taskId);

  if (quiet) {
    write(`${task.title}\t${task.status}\t${task.due ?? ""}`);
    return { exitCode: ExitCode.SUCCESS };
  }

  if (format === "json") {
    write(formatJsonSuccess({ task }));
  } else {
    write(formatTaskDetailText(task));
  }

  return { exitCode: ExitCode.SUCCESS };
}
