import { describe, it, expect, vi } from "vitest";
import {
  normalizeTaskList,
  normalizeTask,
  createGoogleTasksApi,
  MAX_PAGES,
  type GoogleTasksClient,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./tasks-api.ts";
import { ApiError } from "./api.ts";

describe("normalizeTaskList", () => {
  it("maps Google API TaskList to internal TaskList type", () => {
    const raw = {
      id: "list1",
      title: "My Tasks",
      updated: "2026-03-20T10:00:00.000Z",
    };

    const result = normalizeTaskList(raw);

    expect(result).toEqual({
      id: "list1",
      title: "My Tasks",
      updated: "2026-03-20T10:00:00.000Z",
    });
  });

  it("defaults missing fields", () => {
    const raw = {};

    const result = normalizeTaskList(raw);

    expect(result).toEqual({
      id: "",
      title: "",
      updated: "",
    });
  });
});

describe("normalizeTask", () => {
  it("maps Google API Task to internal Task type", () => {
    const raw = {
      id: "task1",
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      status: "needsAction",
      due: "2026-03-25T00:00:00.000Z",
      completed: null,
      parent: null,
      updated: "2026-03-20T10:00:00.000Z",
    };

    const result = normalizeTask(raw, "@default", "My Tasks");

    expect(result).toEqual({
      id: "task1",
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      status: "needsAction",
      due: "2026-03-25",
      completed: null,
      list_id: "@default",
      list_title: "My Tasks",
      parent: null,
      updated: "2026-03-20T10:00:00.000Z",
    });
  });

  it("converts due date from RFC 3339 to YYYY-MM-DD", () => {
    const raw = {
      id: "task2",
      title: "Report",
      due: "2026-03-26T00:00:00.000Z",
      status: "needsAction",
      updated: "2026-03-20T10:00:00.000Z",
    };

    const result = normalizeTask(raw, "list1", "Work");

    expect(result.due).toBe("2026-03-26");
  });

  it("handles completed tasks", () => {
    const raw = {
      id: "task3",
      title: "Done task",
      status: "completed",
      completed: "2026-03-22T14:30:00.000Z",
      updated: "2026-03-22T14:30:00.000Z",
    };

    const result = normalizeTask(raw, "@default", "My Tasks");

    expect(result.status).toBe("completed");
    expect(result.completed).toBe("2026-03-22T14:30:00.000Z");
  });

  it("defaults missing fields", () => {
    const raw = {};

    const result = normalizeTask(raw, "@default", "My Tasks");

    expect(result).toEqual({
      id: "",
      title: "",
      notes: null,
      status: "needsAction",
      due: null,
      completed: null,
      list_id: "@default",
      list_title: "My Tasks",
      parent: null,
      updated: "",
    });
  });

  it("preserves parent task id for subtasks", () => {
    const raw = {
      id: "subtask1",
      title: "Sub item",
      parent: "task1",
      status: "needsAction",
      updated: "2026-03-20T10:00:00.000Z",
    };

    const result = normalizeTask(raw, "@default", "My Tasks");

    expect(result.parent).toBe("task1");
  });
});

// --- Helper to create mock client ---

function createMockClient(responses: Record<string, unknown>): GoogleTasksClient {
  return {
    tasklists: {
      list: vi.fn().mockImplementation(async (params?: { pageToken?: string }) => {
        const key = params?.pageToken ?? "default";
        return { data: responses[key] ?? responses["default"] };
      }),
    },
    tasks: {
      list: vi.fn().mockImplementation(async (params: { tasklist: string; pageToken?: string }) => {
        const key = params.pageToken ?? "default";
        return { data: responses[key] ?? responses["default"] };
      }),
      get: vi.fn().mockImplementation(async (params: { tasklist: string; task: string }) => {
        const key = params.task;
        const response = responses[key];
        if (!response) {
          const error = new Error("Not Found") as Error & { code: number };
          error.code = 404;
          throw error;
        }
        return { data: response };
      }),
      insert: vi.fn().mockImplementation(async () => {
        return { data: responses["inserted"] ?? responses["default"] };
      }),
      patch: vi.fn().mockImplementation(async () => {
        return { data: responses["patched"] ?? responses["default"] };
      }),
      delete: vi.fn().mockImplementation(async (params: { tasklist: string; task: string }) => {
        const key = params.task;
        if (responses[key] === "not_found") {
          const error = new Error("Not Found") as Error & { code: number };
          error.code = 404;
          throw error;
        }
      }),
    },
  };
}

describe("listTaskLists", () => {
  it("returns normalized TaskList[] from Google API response", async () => {
    const client = createMockClient({
      default: {
        items: [
          { id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00.000Z" },
          { id: "list2", title: "Work", updated: "2026-03-21T10:00:00.000Z" },
        ],
      },
    });

    const api = createGoogleTasksApi(client);
    const result = await api.listTaskLists();

    expect(result).toEqual([
      { id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00.000Z" },
      { id: "list2", title: "Work", updated: "2026-03-21T10:00:00.000Z" },
    ]);
  });

  it("handles pagination (nextPageToken)", async () => {
    const client = createMockClient({
      default: {
        items: [{ id: "list1", title: "First", updated: "2026-03-20T10:00:00.000Z" }],
        nextPageToken: "page2",
      },
      page2: {
        items: [{ id: "list2", title: "Second", updated: "2026-03-21T10:00:00.000Z" }],
      },
    });

    const api = createGoogleTasksApi(client);
    const result = await api.listTaskLists();

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("list1");
    expect(result[1]!.id).toBe("list2");
  });

  it("throws API_ERROR when pagination exceeds MAX_PAGES", async () => {
    const client: GoogleTasksClient = {
      tasklists: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [{ id: "list1", title: "List", updated: "" }],
            nextPageToken: "next",
          },
        }),
      },
      tasks: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.listTaskLists().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
    expect(error.message).toContain(`${MAX_PAGES}`);
  });
});

describe("listTasks", () => {
  it("returns normalized Task[] from Google API response", async () => {
    const client = createMockClient({
      default: {
        items: [
          {
            id: "task1",
            title: "Buy groceries",
            notes: "Milk",
            status: "needsAction",
            due: "2026-03-25T00:00:00.000Z",
            updated: "2026-03-20T10:00:00.000Z",
          },
        ],
      },
    });

    const api = createGoogleTasksApi(client);
    const result = await api.listTasks("@default");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("task1");
    expect(result[0]!.title).toBe("Buy groceries");
    expect(result[0]!.due).toBe("2026-03-25");
    expect(result[0]!.list_id).toBe("@default");
  });

  it("passes filter options to the API", async () => {
    const listFn = vi.fn().mockResolvedValue({ data: { items: [] } });
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: listFn,
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    await api.listTasks("@default", {
      showCompleted: true,
      dueMin: "2026-03-01T00:00:00Z",
      dueMax: "2026-03-31T23:59:59Z",
    });

    expect(listFn).toHaveBeenCalledWith(
      expect.objectContaining({
        tasklist: "@default",
        showCompleted: true,
        dueMin: "2026-03-01T00:00:00Z",
        dueMax: "2026-03-31T23:59:59Z",
      }),
    );
  });

  it("handles pagination", async () => {
    const client = createMockClient({
      default: {
        items: [{ id: "task1", title: "First", status: "needsAction", updated: "" }],
        nextPageToken: "page2",
      },
      page2: {
        items: [{ id: "task2", title: "Second", status: "needsAction", updated: "" }],
      },
    });

    const api = createGoogleTasksApi(client);
    const result = await api.listTasks("@default");

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("task1");
    expect(result[1]!.id).toBe("task2");
  });

  it("throws API_ERROR when pagination exceeds MAX_PAGES", async () => {
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [{ id: "t1", title: "T", status: "needsAction", updated: "" }],
            nextPageToken: "next",
          },
        }),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.listTasks("@default").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
    expect(error.message).toContain(`${MAX_PAGES}`);
  });
});

describe("getTask", () => {
  it("returns a single normalized task by ID", async () => {
    const client = createMockClient({
      task1: {
        id: "task1",
        title: "Buy groceries",
        status: "needsAction",
        updated: "2026-03-20T10:00:00.000Z",
      },
    });

    const api = createGoogleTasksApi(client);
    const result = await api.getTask("@default", "task1");

    expect(result.id).toBe("task1");
    expect(result.title).toBe("Buy groceries");
    expect(result.list_id).toBe("@default");
  });

  it("throws NOT_FOUND for non-existent task", async () => {
    const client = createMockClient({});

    const api = createGoogleTasksApi(client);
    const error = await api.getTask("@default", "missing").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("createTask", () => {
  it("sends correct payload and returns normalized task", async () => {
    const returnedTask = {
      id: "new1",
      title: "Buy groceries",
      notes: "Milk, eggs",
      status: "needsAction",
      due: "2026-03-25T00:00:00.000Z",
      updated: "2026-03-23T10:00:00.000Z",
    };

    const client = createMockClient({ inserted: returnedTask });
    const api = createGoogleTasksApi(client);

    const input: CreateTaskInput = {
      title: "Buy groceries",
      notes: "Milk, eggs",
      due: "2026-03-25T00:00:00.000Z",
    };

    const result = await api.createTask("@default", input);

    expect(client.tasks.insert).toHaveBeenCalledWith({
      tasklist: "@default",
      requestBody: {
        title: "Buy groceries",
        notes: "Milk, eggs",
        due: "2026-03-25T00:00:00.000Z",
      },
    });

    expect(result.id).toBe("new1");
    expect(result.title).toBe("Buy groceries");
    expect(result.due).toBe("2026-03-25");
  });

  it("supports parent parameter for subtasks", async () => {
    const returnedTask = {
      id: "sub1",
      title: "Sub task",
      parent: "parent1",
      status: "needsAction",
      updated: "2026-03-23T10:00:00.000Z",
    };

    const client = createMockClient({ inserted: returnedTask });
    const api = createGoogleTasksApi(client);

    const input: CreateTaskInput = {
      title: "Sub task",
      parent: "parent1",
    };

    await api.createTask("@default", input);

    expect(client.tasks.insert).toHaveBeenCalledWith({
      tasklist: "@default",
      parent: "parent1",
      requestBody: {
        title: "Sub task",
      },
    });
  });

  it("maps API errors correctly", async () => {
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 })),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.createTask("@default", { title: "Test" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("updateTask", () => {
  it("sends partial update and returns normalized updated task", async () => {
    const returnedTask = {
      id: "task1",
      title: "Updated Title",
      notes: "Original notes",
      status: "needsAction",
      updated: "2026-03-23T10:00:00.000Z",
    };

    const client = createMockClient({ patched: returnedTask });
    const api = createGoogleTasksApi(client);

    const input: UpdateTaskInput = { title: "Updated Title" };
    const result = await api.updateTask("@default", "task1", input);

    expect(client.tasks.patch).toHaveBeenCalledWith({
      tasklist: "@default",
      task: "task1",
      requestBody: { title: "Updated Title" },
    });

    expect(result.id).toBe("task1");
    expect(result.title).toBe("Updated Title");
  });

  it("maps API errors correctly", async () => {
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: vi.fn(),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 })),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api
      .updateTask("@default", "missing", { title: "New" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteTask", () => {
  it("sends delete request", async () => {
    const client = createMockClient({ task1: "exists" });
    const api = createGoogleTasksApi(client);

    await api.deleteTask("@default", "task1");

    expect(client.tasks.delete).toHaveBeenCalledWith({
      tasklist: "@default",
      task: "task1",
    });
  });

  it("throws NOT_FOUND for non-existent task", async () => {
    const client = createMockClient({ missing: "not_found" });
    const api = createGoogleTasksApi(client);

    const error = await api.deleteTask("@default", "missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("completeTask", () => {
  it("patches task with completed status and returns normalized task", async () => {
    const returnedTask = {
      id: "task1",
      title: "Buy groceries",
      status: "completed",
      completed: "2026-03-23T12:00:00.000Z",
      updated: "2026-03-23T12:00:00.000Z",
    };

    const client = createMockClient({ patched: returnedTask });
    const api = createGoogleTasksApi(client);

    const result = await api.completeTask("@default", "task1");

    expect(client.tasks.patch).toHaveBeenCalledWith({
      tasklist: "@default",
      task: "task1",
      requestBody: { status: "completed" },
    });

    expect(result.status).toBe("completed");
    expect(result.completed).toBe("2026-03-23T12:00:00.000Z");
  });
});

describe("uncompleteTask", () => {
  it("patches task with needsAction status and clears completed", async () => {
    const returnedTask = {
      id: "task1",
      title: "Buy groceries",
      status: "needsAction",
      completed: null,
      updated: "2026-03-23T12:00:00.000Z",
    };

    const client = createMockClient({ patched: returnedTask });
    const api = createGoogleTasksApi(client);

    const result = await api.uncompleteTask("@default", "task1");

    expect(client.tasks.patch).toHaveBeenCalledWith({
      tasklist: "@default",
      task: "task1",
      requestBody: { status: "needsAction", completed: null },
    });

    expect(result.status).toBe("needsAction");
    expect(result.completed).toBeNull();
  });
});

describe("API error mapping", () => {
  it("maps 401 errors to AUTH_REQUIRED", async () => {
    const client: GoogleTasksClient = {
      tasklists: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
      },
      tasks: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.listTaskLists().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("maps 403 errors to AUTH_REQUIRED", async () => {
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 })),
        get: vi.fn(),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.listTasks("@default").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("maps other HTTP errors to API_ERROR", async () => {
    const client: GoogleTasksClient = {
      tasklists: { list: vi.fn() },
      tasks: {
        list: vi.fn(),
        get: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Internal Server Error"), { code: 500 })),
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const api = createGoogleTasksApi(client);
    const error = await api.getTask("@default", "task1").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "API_ERROR" });
  });

  it("re-throws non-HTTP errors as-is", async () => {
    const client: GoogleTasksClient = {
      tasklists: {
        list: vi.fn().mockRejectedValue(new TypeError("Network error")),
      },
      tasks: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };

    const api = createGoogleTasksApi(client);
    await expect(api.listTaskLists()).rejects.toThrow(TypeError);
  });
});
