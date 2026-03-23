import type { Task, TaskList, TaskStatus } from "../types/index.ts";
import { ApiError } from "./api.ts";
import { MAX_PAGES, mapApiError } from "./api-utils.ts";

export { MAX_PAGES };

// --- Google API raw response types ---

export interface GoogleRawTaskList {
  id?: string | null;
  title?: string | null;
  updated?: string | null;
}

export interface GoogleRawTask {
  id?: string | null;
  title?: string | null;
  notes?: string | null;
  status?: string | null;
  due?: string | null;
  completed?: string | null;
  deleted?: boolean | null;
  hidden?: boolean | null;
  parent?: string | null;
  position?: string | null;
  updated?: string | null;
}

// --- Low-level API abstraction for testability ---

export interface GoogleTasksClient {
  tasklists: {
    list: (params?: { pageToken?: string }) => Promise<{
      data: { items?: GoogleRawTaskList[]; nextPageToken?: string };
    }>;
  };
  tasks: {
    list: (params: {
      tasklist: string;
      pageToken?: string;
      showCompleted?: boolean;
      showHidden?: boolean;
      dueMin?: string;
      dueMax?: string;
    }) => Promise<{
      data: { items?: GoogleRawTask[]; nextPageToken?: string };
    }>;
    get: (params: { tasklist: string; task: string }) => Promise<{ data: GoogleRawTask }>;
    insert: (params: {
      tasklist: string;
      parent?: string;
      requestBody: { title: string; notes?: string; due?: string };
    }) => Promise<{ data: GoogleRawTask }>;
    patch: (params: {
      tasklist: string;
      task: string;
      requestBody: Partial<{
        title: string;
        notes: string;
        due: string;
        status: string;
        completed: string | null;
      }>;
    }) => Promise<{ data: GoogleRawTask }>;
    delete: (params: { tasklist: string; task: string }) => Promise<void>;
  };
}

// --- Options / Input types ---

export interface ListTasksOptions {
  showCompleted?: boolean;
  showHidden?: boolean;
  dueMin?: string;
  dueMax?: string;
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  due?: string;
  parent?: string;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  due?: string;
}

// --- Normalization functions ---

export function normalizeTaskList(raw: GoogleRawTaskList): TaskList {
  return {
    id: raw.id ?? "",
    title: raw.title ?? "",
    updated: raw.updated ?? "",
  };
}

const VALID_TASK_STATUSES: TaskStatus[] = ["needsAction", "completed"];

function parseTaskStatus(value: string | null | undefined): TaskStatus {
  if (value && VALID_TASK_STATUSES.includes(value as TaskStatus)) {
    return value as TaskStatus;
  }
  return "needsAction";
}

function parseDueDate(due: string | null | undefined): string | null {
  if (!due) return null;
  // Google Tasks API returns due as RFC 3339 (e.g., "2026-03-25T00:00:00.000Z")
  // Convert to YYYY-MM-DD
  return due.slice(0, 10);
}

export function normalizeTask(raw: GoogleRawTask, listId: string, listTitle: string): Task {
  return {
    id: raw.id ?? "",
    title: raw.title ?? "",
    notes: raw.notes ?? null,
    status: parseTaskStatus(raw.status),
    due: parseDueDate(raw.due),
    completed: raw.completed ?? null,
    list_id: listId,
    list_title: listTitle,
    parent: raw.parent ?? null,
    updated: raw.updated ?? "",
  };
}

// --- Standalone API functions ---

export async function listTaskLists(client: GoogleTasksClient): Promise<TaskList[]> {
  try {
    const results: TaskList[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      if (pages >= MAX_PAGES) {
        throw new ApiError("API_ERROR", `Pagination limit of ${MAX_PAGES} pages exceeded`);
      }
      const response = await client.tasklists.list(pageToken ? { pageToken } : undefined);
      const items = response.data.items ?? [];
      for (const item of items) {
        results.push(normalizeTaskList(item));
      }
      pageToken = response.data.nextPageToken;
      pages++;
    } while (pageToken);

    return results;
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function listTasks(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  options?: ListTasksOptions,
): Promise<Task[]> {
  try {
    const results: Task[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      if (pages >= MAX_PAGES) {
        throw new ApiError("API_ERROR", `Pagination limit of ${MAX_PAGES} pages exceeded`);
      }
      const params: {
        tasklist: string;
        pageToken?: string;
        showCompleted?: boolean;
        showHidden?: boolean;
        dueMin?: string;
        dueMax?: string;
      } = {
        tasklist: taskListId,
        ...options,
      };
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const response = await client.tasks.list(params);
      const items = response.data.items ?? [];
      for (const item of items) {
        results.push(normalizeTask(item, taskListId, listTitle));
      }
      pageToken = response.data.nextPageToken;
      pages++;
    } while (pageToken);

    return results;
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function getTask(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  taskId: string,
): Promise<Task> {
  try {
    const response = await client.tasks.get({ tasklist: taskListId, task: taskId });
    return normalizeTask(response.data, taskListId, listTitle);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function createTask(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  input: CreateTaskInput,
): Promise<Task> {
  try {
    const requestBody: { title: string; notes?: string; due?: string } = {
      title: input.title,
    };
    if (input.notes !== undefined) {
      requestBody.notes = input.notes;
    }
    if (input.due !== undefined) {
      requestBody.due = input.due;
    }
    const params: {
      tasklist: string;
      parent?: string;
      requestBody: { title: string; notes?: string; due?: string };
    } = { tasklist: taskListId, requestBody };
    if (input.parent !== undefined) {
      params.parent = input.parent;
    }
    const response = await client.tasks.insert(params);
    return normalizeTask(response.data, taskListId, listTitle);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function updateTask(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  try {
    const requestBody: Partial<{ title: string; notes: string; due: string }> = {};
    if (input.title !== undefined) {
      requestBody.title = input.title;
    }
    if (input.notes !== undefined) {
      requestBody.notes = input.notes;
    }
    if (input.due !== undefined) {
      requestBody.due = input.due;
    }
    const response = await client.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody,
    });
    return normalizeTask(response.data, taskListId, listTitle);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function deleteTask(
  client: GoogleTasksClient,
  taskListId: string,
  taskId: string,
): Promise<void> {
  try {
    await client.tasks.delete({ tasklist: taskListId, task: taskId });
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function completeTask(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  taskId: string,
): Promise<Task> {
  try {
    const response = await client.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: { status: "completed" },
    });
    return normalizeTask(response.data, taskListId, listTitle);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function uncompleteTask(
  client: GoogleTasksClient,
  taskListId: string,
  listTitle: string,
  taskId: string,
): Promise<Task> {
  try {
    const response = await client.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: { status: "needsAction", completed: null },
    });
    return normalizeTask(response.data, taskListId, listTitle);
  } catch (error: unknown) {
    mapApiError(error);
  }
}
