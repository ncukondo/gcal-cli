import { vi } from "vitest";
import type { GoogleTasksClient, GoogleRawTask } from "../../lib/tasks-api.ts";
import type { TaskListConfig } from "../../types/index.ts";

export function makeRawTask(overrides: Partial<GoogleRawTask> = {}): GoogleRawTask {
  return {
    id: "id" in overrides ? overrides.id : "task-123",
    title: "title" in overrides ? overrides.title : "Buy groceries",
    notes: "notes" in overrides ? overrides.notes : null,
    status: "status" in overrides ? overrides.status : "needsAction",
    due: "due" in overrides ? overrides.due : null,
    completed: overrides.completed ?? null,
    deleted: false,
    hidden: false,
    parent: overrides.parent ?? null,
    position: "00000000000000000000",
    updated: overrides.updated ?? "2026-03-24T10:00:00.000Z",
  };
}

export type ClientMocks = {
  patch?: { data: GoogleRawTask };
  insert?: { data: GoogleRawTask };
  get?: { data: GoogleRawTask };
  tasksList?: { data: { items: GoogleRawTask[]; nextPageToken?: string } };
  tasklistsList?: {
    data: {
      items: { id: string; title: string; updated: string }[];
      nextPageToken?: string;
    };
  };
};

export function makeClient(mocks?: ClientMocks): GoogleTasksClient {
  const defaultTasklistsList = {
    data: {
      items: [{ id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" }],
    },
  };
  return {
    tasklists: {
      list: vi.fn().mockResolvedValue(mocks?.tasklistsList ?? defaultTasklistsList),
    },
    tasks: {
      list: mocks?.tasksList ? vi.fn().mockResolvedValue(mocks.tasksList) : vi.fn(),
      get: mocks?.get ? vi.fn().mockResolvedValue(mocks.get) : vi.fn(),
      insert: mocks?.insert ? vi.fn().mockResolvedValue(mocks.insert) : vi.fn(),
      patch: mocks?.patch ? vi.fn().mockResolvedValue(mocks.patch) : vi.fn(),
      delete: vi.fn(),
    },
  };
}

export function makeOutput(): { output: string[]; write: (msg: string) => void } {
  const output: string[] = [];
  return { output, write: (msg: string) => output.push(msg) };
}

export const defaultConfig: TaskListConfig[] = [];
