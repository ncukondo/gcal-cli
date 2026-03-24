import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import { handleTaskShow } from "./show.ts";
import { makeRawTask, makeClient, makeOutput, defaultConfig } from "./test-helpers.ts";

const showDefaults = {
  id: "abc123" as const,
  notes: "Milk, eggs, bread",
  due: "2026-03-25T00:00:00.000Z",
  updated: "2026-03-20T10:00:00.000Z",
};

function makeGetClient(rawTask = makeRawTask(showDefaults)) {
  return makeClient({ get: { data: rawTask } });
}

describe("handleTaskShow", () => {
  describe("text output", () => {
    it("shows task details in label-value format", async () => {
      const client = makeGetClient();
      const { output, write } = makeOutput();

      const result = await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("ID:        abc123");
      expect(text).toContain("Title:     Buy groceries");
      expect(text).toContain("Status:    needsAction");
      expect(text).toContain("Due:       2026-03-25");
      expect(text).toContain("Notes:     Milk, eggs, bread");
      expect(text).toContain("List:      My Tasks");
      expect(text).toContain("Updated:   2026-03-20T10:00:00Z");
    });

    it("omits due line when task has no due date", async () => {
      const raw = makeRawTask({ ...showDefaults, due: null });
      const client = makeGetClient(raw);
      const { output, write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      const text = output.join("\n");
      expect(text).not.toContain("Due:");
    });

    it("omits notes line when task has no notes", async () => {
      const raw = makeRawTask({ ...showDefaults, notes: null });
      const client = makeGetClient(raw);
      const { output, write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      const text = output.join("\n");
      expect(text).not.toContain("Notes:");
    });
  });

  describe("json output", () => {
    it("returns task in success envelope", async () => {
      const client = makeGetClient();
      const { output, write } = makeOutput();

      const result = await handleTaskShow({
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
      expect(json.data.task).toMatchObject({
        id: "abc123",
        title: "Buy groceries",
        status: "needsAction",
        due: "2026-03-25",
        notes: "Milk, eggs, bread",
        list_id: "@default",
        list_title: "My Tasks",
      });
    });
  });

  describe("quiet output", () => {
    it("outputs TSV: Title, Status, Due", async () => {
      const client = makeGetClient();
      const { output, write } = makeOutput();

      const result = await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(output[0]).toBe("Buy groceries\tneedsAction\t2026-03-25");
    });

    it("outputs empty string for due when no due date", async () => {
      const raw = makeRawTask({ ...showDefaults, due: null });
      const client = makeGetClient(raw);
      const { output, write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(output[0]).toBe("Buy groceries\tneedsAction\t");
    });
  });

  describe("task list resolution", () => {
    it("uses @default when no --list and no config", async () => {
      const client = makeGetClient();
      const { write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(client.tasks.get).toHaveBeenCalledWith({ tasklist: "@default", task: "abc123" });
    });

    it("resolves --list by name from config", async () => {
      const client = makeGetClient();
      const { write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "work-id", name: "Work", enabled: true },
        ],
        list: "Work",
      });

      expect(client.tasks.get).toHaveBeenCalledWith({ tasklist: "work-id", task: "abc123" });
    });

    it("uses first enabled config list when no --list", async () => {
      const client = makeGetClient();
      const { write } = makeOutput();

      await handleTaskShow({
        client,
        taskId: "abc123",
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "disabled-list", name: "Disabled", enabled: false },
          { id: "work-id", name: "Work", enabled: true },
        ],
      });

      expect(client.tasks.get).toHaveBeenCalledWith({ tasklist: "work-id", task: "abc123" });
    });
  });

  describe("error handling", () => {
    it("throws ApiError on NOT_FOUND", async () => {
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
          get: vi.fn().mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 })),
          insert: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskShow({
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
