import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient, GoogleRawTask } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import type { TaskListConfig } from "../../types/index.ts";
import { handleTaskUpdate } from "./update.ts";

function makeRawTask(overrides: Partial<GoogleRawTask> = {}): GoogleRawTask {
  return {
    id: "id" in overrides ? overrides.id : "task-123",
    title: "title" in overrides ? overrides.title : "Updated title",
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

function makeClient(rawTask?: GoogleRawTask): GoogleTasksClient {
  return {
    tasklists: {
      list: vi.fn().mockResolvedValue({
        data: {
          items: [{ id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" }],
          nextPageToken: undefined,
        },
      }),
    },
    tasks: {
      list: vi.fn(),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn().mockResolvedValue({ data: rawTask ?? makeRawTask() }),
      delete: vi.fn(),
    },
  };
}

function makeOutput(): { output: string[]; write: (msg: string) => void } {
  const output: string[] = [];
  return { output, write: (msg: string) => output.push(msg) };
}

const defaultConfig: TaskListConfig[] = [];

describe("handleTaskUpdate", () => {
  describe("text output", () => {
    it("shows updated message with title and id", async () => {
      const client = makeClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "Updated title",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("Task updated: Updated title (task-123)");
    });

    it("passes title to API via patch", async () => {
      const client = makeClient();
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "New title",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.patch).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "task-123",
        requestBody: { title: "New title" },
      });
    });

    it("passes notes to API", async () => {
      const raw = makeRawTask({ notes: "New notes" });
      const client = makeClient(raw);
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        notes: "New notes",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.patch).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "task-123",
        requestBody: { notes: "New notes" },
      });
    });

    it("passes due date to API in RFC 3339 format", async () => {
      const raw = makeRawTask({ due: "2026-03-30T00:00:00.000Z" });
      const client = makeClient(raw);
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        due: "2026-03-30",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.patch).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "task-123",
        requestBody: { due: "2026-03-30T00:00:00.000Z" },
      });
    });

    it("passes multiple fields to API", async () => {
      const raw = makeRawTask({
        title: "New title",
        notes: "New notes",
        due: "2026-03-30T00:00:00.000Z",
      });
      const client = makeClient(raw);
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "New title",
        notes: "New notes",
        due: "2026-03-30",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.patch).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "task-123",
        requestBody: {
          title: "New title",
          notes: "New notes",
          due: "2026-03-30T00:00:00.000Z",
        },
      });
    });
  });

  describe("json output", () => {
    it("returns task in success envelope with message", async () => {
      const client = makeClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "Updated title",
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("Task updated");
      expect(json.data.task).toMatchObject({
        id: "task-123",
        title: "Updated title",
      });
    });
  });

  describe("quiet output", () => {
    it("outputs task ID only", async () => {
      const client = makeClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "Updated title",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("task-123");
    });
  });

  describe("validation", () => {
    it("returns error when no update options provided", async () => {
      const client = makeClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(output[0]).toContain("at least one update option");
      expect(client.tasks.patch).not.toHaveBeenCalled();
    });

    it("returns JSON error when no update options in json format", async () => {
      const client = makeClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_ARGS");
    });

    it("returns error for invalid due date format", async () => {
      const client = makeClient();
      const { write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        due: "not-a-date",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(client.tasks.patch).not.toHaveBeenCalled();
    });

    it("returns error for invalid date like 2026-02-30", async () => {
      const client = makeClient();
      const { write } = makeOutput();

      const result = await handleTaskUpdate({
        client,
        taskId: "task-123",
        due: "2026-02-30",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
    });
  });

  describe("task list resolution", () => {
    it("uses @default when no --list and no config", async () => {
      const client = makeClient();
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "Updated",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(client.tasks.patch).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "@default" }),
      );
    });

    it("resolves --list by name from config", async () => {
      const client = makeClient();
      const { write } = makeOutput();

      await handleTaskUpdate({
        client,
        taskId: "task-123",
        title: "Updated",
        list: "Work",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "work-id", name: "Work", enabled: true },
        ],
      });

      expect(client.tasks.patch).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "work-id" }),
      );
    });
  });

  describe("error handling", () => {
    it("throws ApiError on API failure", async () => {
      const { ApiError } = await import("../../lib/api.ts");
      const client: GoogleTasksClient = {
        tasklists: {
          list: vi.fn().mockResolvedValue({
            data: {
              items: [{ id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" }],
              nextPageToken: undefined,
            },
          }),
        },
        tasks: {
          list: vi.fn(),
          get: vi.fn(),
          insert: vi.fn(),
          patch: vi
            .fn()
            .mockRejectedValue(Object.assign(new Error("Server Error"), { code: 500 })),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskUpdate({
          client,
          taskId: "task-123",
          title: "Updated",
          format: "text",
          quiet: false,
          write: vi.fn(),
          configTaskLists: [],
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
