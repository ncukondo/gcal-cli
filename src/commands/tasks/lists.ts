import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { listTaskLists } from "../../lib/tasks-api.ts";
import { formatJsonSuccess } from "../../lib/output.ts";
import { ExitCode } from "../../types/index.ts";
import type { CommandResult, OutputFormat, TaskListConfig } from "../../types/index.ts";

interface HandleTaskListsOptions {
  client: GoogleTasksClient;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  configTaskLists: TaskListConfig[];
}

interface TaskListWithEnabled {
  id: string;
  title: string;
  enabled: boolean;
  updated: string;
}

function mergeTaskListsWithConfig(
  apiLists: { id: string; title: string; updated: string }[],
  configLists: TaskListConfig[],
): TaskListWithEnabled[] {
  const hasConfig = configLists.length > 0;
  const configMap = new Map(configLists.map((c) => [c.id, c]));

  return apiLists.map((list) => {
    const config = configMap.get(list.id);
    return {
      ...list,
      enabled: hasConfig ? (config ? config.enabled : true) : true,
    };
  });
}

function formatTaskListText(lists: TaskListWithEnabled[]): string {
  const lines = ["Task Lists:"];
  for (const list of lists) {
    const checkbox = list.enabled ? "[x]" : "[ ]";
    const suffix = list.enabled ? "" : " (disabled)";
    lines.push(`  ${checkbox} ${list.title} (${list.id})${suffix}`);
  }
  return lines.join("\n");
}

export async function handleTaskLists(opts: HandleTaskListsOptions): Promise<CommandResult> {
  const { client, format, quiet, write, configTaskLists } = opts;

  const apiLists = await listTaskLists(client);
  const lists = mergeTaskListsWithConfig(apiLists, configTaskLists);

  if (quiet) {
    write(lists.map((l) => l.id).join("\n"));
    return { exitCode: ExitCode.SUCCESS };
  }

  if (format === "json") {
    write(formatJsonSuccess({ task_lists: lists, count: lists.length }));
  } else {
    write(formatTaskListText(lists));
  }

  return { exitCode: ExitCode.SUCCESS };
}
