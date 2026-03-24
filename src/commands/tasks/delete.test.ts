import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import { handleTaskDelete } from "./delete.ts";
import { makeClient, makeOutput, defaultConfig } from "./test-helpers.ts";

function makeDeleteClient() {
  return makeClient();
}

describe("handleTaskDelete", () => {
  describe("text output", () => {
    it("shows deleted message with id", async () => {
      const client = makeDeleteClient();
      const { output, write } = makeOutput();

      const result = await handleTaskDelete({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("Task deleted (abc123)");
    });

    it("calls delete with correct params", async () => {
      const client = makeDeleteClient();
      const { write } = makeOutput();

      await handleTaskDelete({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(client.tasks.delete).toHaveBeenCalledWith({
        tasklist: "@default",
        task: "abc123",
      });
    });
  });

  describe("json output", () => {
    it("returns deleted_id in success envelope with message", async () => {
      const client = makeDeleteClient();
      const { output, write } = makeOutput();

      const result = await handleTaskDelete({
        client,
        taskId: "abc123",
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.deleted_id).toBe("abc123");
      expect(json.data.message).toBe("Task deleted");
    });
  });

  describe("quiet output", () => {
    it("outputs nothing", async () => {
      const client = makeDeleteClient();
      const { output, write } = makeOutput();

      const result = await handleTaskDelete({
        client,
        taskId: "abc123",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output).toHaveLength(0);
    });
  });

  describe("task list resolution", () => {
    it("uses @default when no --list and no config", async () => {
      const client = makeDeleteClient();
      const { write } = makeOutput();

      await handleTaskDelete({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(client.tasks.delete).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "@default" }),
      );
    });

    it("resolves --list by name from config", async () => {
      const client = makeDeleteClient();
      const { write } = makeOutput();

      await handleTaskDelete({
        client,
        taskId: "abc123",
        list: "Work",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "work-id", name: "Work", enabled: true },
        ],
      });

      expect(client.tasks.delete).toHaveBeenCalledWith(
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
          patch: vi.fn(),
          delete: vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 })),
        },
      };

      await expect(
        handleTaskDelete({
          client,
          taskId: "nonexistent",
          format: "text",
          quiet: false,
          write: vi.fn(),
          configTaskLists: [],
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
