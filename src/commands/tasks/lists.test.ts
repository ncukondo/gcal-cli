import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import { handleTaskLists } from "./lists.ts";

function makeClient(
  taskLists: { id: string; title: string; updated: string }[],
): GoogleTasksClient {
  const items = taskLists.map((tl) => ({
    id: tl.id,
    title: tl.title,
    updated: tl.updated,
  }));

  return {
    tasklists: {
      list: vi.fn().mockResolvedValue({
        data: { items, nextPageToken: undefined },
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
}

function makeOutput(): { output: string[]; write: (msg: string) => void } {
  const output: string[] = [];
  return { output, write: (msg: string) => output.push(msg) };
}

const sampleTaskLists = [
  { id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" },
  { id: "abc123", title: "Work", updated: "2026-03-21T10:00:00Z" },
  { id: "def456", title: "Shopping", updated: "2026-03-22T10:00:00Z" },
];

describe("handleTaskLists", () => {
  describe("text output", () => {
    it("shows task lists with checkboxes when config has task_lists", async () => {
      const client = makeClient(sampleTaskLists);
      const { output, write } = makeOutput();

      const result = await handleTaskLists({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "abc123", name: "Work", enabled: true },
          { id: "def456", name: "Shopping", enabled: false },
        ],
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("Task Lists:");
      expect(text).toContain("[x] My Tasks (@default)");
      expect(text).toContain("[x] Work (abc123)");
      expect(text).toContain("[ ] Shopping (def456) (disabled)");
    });

    it("shows all lists as [x] when config has no task_lists", async () => {
      const client = makeClient(sampleTaskLists);
      const { output, write } = makeOutput();

      const result = await handleTaskLists({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("[x] My Tasks (@default)");
      expect(text).toContain("[x] Work (abc123)");
      expect(text).toContain("[x] Shopping (def456)");
      expect(text).not.toContain("(disabled)");
    });
  });

  describe("quiet output", () => {
    it("outputs only task list IDs", async () => {
      const client = makeClient(sampleTaskLists);
      const { output, write } = makeOutput();

      const result = await handleTaskLists({
        client,
        format: "text",
        quiet: true,
        write,
        configTaskLists: [],
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toBe("@default\nabc123\ndef456");
    });
  });

  describe("json output", () => {
    it("returns task lists in success envelope with count", async () => {
      const client = makeClient(sampleTaskLists);
      const { output, write } = makeOutput();

      const result = await handleTaskLists({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "abc123", name: "Work", enabled: true },
        ],
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.task_lists).toHaveLength(3);
      expect(json.data.count).toBe(3);
      expect(json.data.task_lists[0]).toMatchObject({
        id: "@default",
        title: "My Tasks",
        enabled: true,
        updated: "2026-03-20T10:00:00Z",
      });
    });

    it("defaults enabled to true when config has no task_lists", async () => {
      const client = makeClient([sampleTaskLists[0]!]);
      const { output, write } = makeOutput();

      await handleTaskLists({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: [],
      });

      const json = JSON.parse(output.join(""));
      expect(json.data.task_lists[0].enabled).toBe(true);
    });

    it("reflects disabled state from config", async () => {
      const client = makeClient([sampleTaskLists[2]!]);
      const { output, write } = makeOutput();

      await handleTaskLists({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: [{ id: "def456", name: "Shopping", enabled: false }],
      });

      const json = JSON.parse(output.join(""));
      expect(json.data.task_lists[0].enabled).toBe(false);
    });
  });

  describe("error handling", () => {
    it("throws ApiError on API error", async () => {
      const { ApiError } = await import("../../lib/api.ts");
      const client: GoogleTasksClient = {
        tasklists: {
          list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
        },
        tasks: {
          list: vi.fn(),
          get: vi.fn(),
          insert: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskLists({
          client,
          format: "text",
          quiet: false,
          write: vi.fn(),
          configTaskLists: [],
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
