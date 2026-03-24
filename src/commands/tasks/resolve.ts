import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { listTaskLists } from "../../lib/tasks-api.ts";
import type { TaskListConfig } from "../../types/index.ts";

function resolveTaskListFromConfig(
  configLists: TaskListConfig[],
  listOption?: string,
): { id: string; title: string } | null {
  if (!listOption) {
    const enabled = configLists.find((c) => c.enabled);
    if (enabled) return { id: enabled.id, title: enabled.name };
    return null;
  }

  // Try matching by name first
  const byName = configLists.find((c) => c.name === listOption);
  if (byName) return { id: byName.id, title: byName.name };

  // Try matching by ID
  const byId = configLists.find((c) => c.id === listOption);
  if (byId) return { id: byId.id, title: byId.name };

  return null;
}

export async function resolveTaskList(
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
