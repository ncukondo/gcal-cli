import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { listTaskLists, listTasks } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, Task, TaskListConfig } from "../../types/index.ts";

interface HandleTaskListOptions {
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
}

function resolveTaskListFromConfig(
  configLists: TaskListConfig[],
  listOption?: string,
): { id: string; title: string } | null {
  if (!listOption) {
    const enabled = configLists.find((c) => c.enabled);
    if (enabled) return { id: enabled.id, title: enabled.name };
    return configLists.length > 0 ? null : null;
  }

  // Try matching by name first
  const byName = configLists.find((c) => c.name === listOption);
  if (byName) return { id: byName.id, title: byName.name };

  // Try matching by ID
  const byId = configLists.find((c) => c.id === listOption);
  if (byId) return { id: byId.id, title: byId.name };

  return null;
}

async function resolveTaskList(
  client: GoogleTasksClient,
  configLists: TaskListConfig[],
  listOption?: string,
): Promise<{ id: string; title: string }> {
  // Try resolving from config first
  const fromConfig = resolveTaskListFromConfig(configLists, listOption);
  if (fromConfig) return fromConfig;

  if (listOption) {
    // If --list was provided but not found in config, try API lookup by title
    const apiLists = await listTaskLists(client);
    const byTitle = apiLists.find((l) => l.title === listOption);
    if (byTitle) return { id: byTitle.id, title: byTitle.title };
    // Fall back to using it as a direct ID
    return { id: listOption, title: listOption };
  }

  // No config, no --list: use @default
  return { id: "@default", title: "My Tasks" };
}

function formatDueInfo(task: Task): string {
  if (task.status === "completed" && task.completed) {
    const month = task.completed.slice(5, 7);
    const day = task.completed.slice(8, 10);
    return ` (completed: ${month}/${day})`;
  }
  if (task.due) {
    const month = task.due.slice(5, 7);
    const day = task.due.slice(8, 10);
    return ` (due: ${month}/${day})`;
  }
  return "";
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
    filtered = filtered.filter((t) => t.due !== null && t.due < options.dueBefore!);
  }
  if (options.dueAfter) {
    filtered = filtered.filter((t) => t.due !== null && t.due >= options.dueAfter!);
  }

  return filtered;
}

export async function handleTaskList(opts: HandleTaskListOptions): Promise<CommandResult> {
  const { client, format, quiet, write, configTaskLists, all, completed, dueBefore, dueAfter } =
    opts;

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
  const tasks = filterTasks(allTasks, filterOpts);

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
