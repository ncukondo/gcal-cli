import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import { handleTaskAdd } from "./add.ts";
import { makeRawTask, makeClient, makeOutput, defaultConfig } from "./test-helpers.ts";

const newTask = makeRawTask({ id: "new-task-id" });

function makeInsertClient(rawTask = newTask) {
  return makeClient({ insert: { data: rawTask } });
}

describe("handleTaskAdd", () => {
  describe("text output", () => {
    it("shows created message with title and id", async () => {
      const client = makeInsertClient();
      const { output, write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "Buy groceries",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("Task created: Buy groceries (new-task-id)");
    });

    it("passes notes and due to API", async () => {
      const raw = makeRawTask({
        id: "new-task-id",
        title: "Write report",
        notes: "Q1 summary",
        due: "2026-03-26T00:00:00.000Z",
      });
      const client = makeInsertClient(raw);
      const { write } = makeOutput();

      await handleTaskAdd({
        client,
        title: "Write report",
        notes: "Q1 summary",
        due: "2026-03-26",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.insert).toHaveBeenCalledWith({
        tasklist: "@default",
        requestBody: {
          title: "Write report",
          notes: "Q1 summary",
          due: "2026-03-26T00:00:00.000Z",
        },
      });
    });

    it("passes parent to API as query param", async () => {
      const client = makeInsertClient();
      const { write } = makeOutput();

      await handleTaskAdd({
        client,
        title: "Subtask",
        parent: "parent-id",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ parent: "parent-id" }),
      );
    });
  });

  describe("json output", () => {
    it("returns task in success envelope with message", async () => {
      const client = makeInsertClient();
      const { output, write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "Buy groceries",
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("Task created");
      expect(json.data.task).toMatchObject({
        id: "new-task-id",
        title: "Buy groceries",
      });
    });
  });

  describe("quiet output", () => {
    it("outputs task ID only", async () => {
      const client = makeInsertClient();
      const { output, write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "Buy groceries",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("new-task-id");
    });
  });

  describe("validation", () => {
    it("returns error when title is empty string", async () => {
      const client = makeInsertClient();
      const { write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(client.tasks.insert).not.toHaveBeenCalled();
    });

    it("returns JSON error when title is empty in json format", async () => {
      const client = makeInsertClient();
      const { output, write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "",
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
      const client = makeInsertClient();
      const { write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "Task",
        due: "not-a-date",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(client.tasks.insert).not.toHaveBeenCalled();
    });

    it("returns error for invalid date like 2026-02-30", async () => {
      const client = makeInsertClient();
      const { write } = makeOutput();

      const result = await handleTaskAdd({
        client,
        title: "Task",
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
      const client = makeInsertClient();
      const { write } = makeOutput();

      await handleTaskAdd({
        client,
        title: "Task",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(client.tasks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "@default" }),
      );
    });

    it("resolves --list by name from config", async () => {
      const client = makeInsertClient();
      const { write } = makeOutput();

      await handleTaskAdd({
        client,
        title: "Task",
        list: "Work",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "work-id", name: "Work", enabled: true },
        ],
      });

      expect(client.tasks.insert).toHaveBeenCalledWith(
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
          insert: vi
            .fn()
            .mockRejectedValue(Object.assign(new Error("Server Error"), { code: 500 })),
          patch: vi.fn(),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskAdd({
          client,
          title: "Task",
          format: "text",
          quiet: false,
          write: vi.fn(),
          configTaskLists: [],
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
