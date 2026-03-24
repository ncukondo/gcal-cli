import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import { handleTaskUndone } from "./undone.ts";
import { makeRawTask, makeClient, makeOutput, defaultConfig } from "./test-helpers.ts";

const reopenedTask = makeRawTask();

function makePatchClient(rawTask = reopenedTask) {
  return makeClient({ patch: { data: rawTask } });
}

describe("handleTaskUndone", () => {
  describe("text output", () => {
    it("shows reopened message with title and id", async () => {
      const client = makePatchClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUndone({
        client,
        taskId: "task-123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("Task reopened: Buy groceries (task-123)");
    });

    it("calls patch with status needsAction and completed null", async () => {
      const client = makePatchClient();
      const { write } = makeOutput();

      await handleTaskUndone({
        client,
        taskId: "task-123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.patch).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "task-123",
        requestBody: { status: "needsAction", completed: null },
      });
    });
  });

  describe("json output", () => {
    it("returns task in success envelope with message", async () => {
      const client = makePatchClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUndone({
        client,
        taskId: "task-123",
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.message).toBe("Task reopened");
      expect(json.data.task).toMatchObject({
        id: "task-123",
        title: "Buy groceries",
      });
    });
  });

  describe("quiet output", () => {
    it("outputs task ID only", async () => {
      const client = makePatchClient();
      const { output, write } = makeOutput();

      const result = await handleTaskUndone({
        client,
        taskId: "task-123",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("task-123");
    });
  });

  describe("task list resolution", () => {
    it("uses @default when no --list and no config", async () => {
      const client = makePatchClient();
      const { write } = makeOutput();

      await handleTaskUndone({
        client,
        taskId: "task-123",
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
      const client = makePatchClient();
      const { write } = makeOutput();

      await handleTaskUndone({
        client,
        taskId: "task-123",
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
            },
          }),
        },
        tasks: {
          list: vi.fn(),
          get: vi.fn(),
          insert: vi.fn(),
          patch: vi.fn().mockRejectedValue(Object.assign(new Error("Server Error"), { code: 500 })),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskUndone({
          client,
          taskId: "task-123",
          format: "text",
          quiet: false,
          write: vi.fn(),
          configTaskLists: [],
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
