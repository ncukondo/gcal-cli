import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import type { GoogleRawTask } from "../../lib/tasks-api.ts";
import { ExitCode } from "../../types/index.ts";
import type { TaskListConfig } from "../../types/index.ts";
import { handleTaskList } from "./list.ts";

function makeRawTask(overrides: Partial<GoogleRawTask> & { title: string }): GoogleRawTask {
  return {
    id: overrides.id ?? `task-${overrides.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: overrides.title,
    notes: overrides.notes ?? null,
    status: overrides.status ?? "needsAction",
    due: overrides.due ?? null,
    completed: overrides.completed ?? null,
    deleted: false,
    hidden: false,
    parent: overrides.parent ?? null,
    position: "00000000000000000000",
    updated: overrides.updated ?? "2026-03-20T10:00:00.000Z",
  };
}

function makeClient(tasks: GoogleRawTask[]): GoogleTasksClient {
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
      list: vi.fn().mockResolvedValue({
        data: { items: tasks, nextPageToken: undefined },
      }),
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

const sampleTasks: GoogleRawTask[] = [
  makeRawTask({ title: "Buy groceries", due: "2026-03-25T00:00:00.000Z" }),
  makeRawTask({
    title: "Write report",
    due: "2026-03-26T00:00:00.000Z",
    notes: "Q1 summary for marketing team",
  }),
  makeRawTask({ title: "Call dentist" }),
];

const completedTask = makeRawTask({
  title: "Fix login bug",
  status: "completed",
  completed: "2026-03-22T14:30:00.000Z",
});

const completedTaskWithDue = makeRawTask({
  title: "Submit tax forms",
  status: "completed",
  due: "2026-03-20T00:00:00.000Z",
  completed: "2026-03-19T10:00:00.000Z",
});

const defaultConfig: TaskListConfig[] = [];

describe("handleTaskList", () => {
  describe("text output", () => {
    it("shows only needsAction tasks by default with correct formatting", async () => {
      const client = makeClient([...sampleTasks]);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("My Tasks:");
      expect(text).toContain("□ Buy groceries (due: 03/25)");
      expect(text).toContain("□ Write report (due: 03/26)");
      expect(text).toContain("Notes: Q1 summary for marketing team");
      expect(text).toContain("□ Call dentist");
    });

    it("shows completed tasks with ☑ and completed date when --all", async () => {
      const client = makeClient([...sampleTasks, completedTask]);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        all: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("□ Buy groceries (due: 03/25)");
      expect(text).toContain("☑ Fix login bug (completed: 03/22)");
    });

    it("shows both due date and completed date for completed tasks with due", async () => {
      const client = makeClient([completedTaskWithDue]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        all: true,
      });

      const text = output.join("\n");
      expect(text).toContain("☑ Submit tax forms (due: 03/20, completed: 03/19)");
    });

    it("shows only completed tasks when --completed", async () => {
      const client = makeClient([...sampleTasks, completedTask]);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        completed: true,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("☑ Fix login bug (completed: 03/22)");
      expect(text).not.toContain("Buy groceries");
      expect(text).not.toContain("Write report");
      expect(text).not.toContain("Call dentist");
    });

    it("shows notes only first line indented", async () => {
      const multilineNotes = makeRawTask({
        title: "Multi note task",
        notes: "First line of notes\nSecond line ignored",
      });
      const client = makeClient([multilineNotes]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      const text = output.join("\n");
      expect(text).toContain("Notes: First line of notes");
      expect(text).not.toContain("Second line ignored");
    });
  });

  describe("task list resolution", () => {
    it("uses @default when no --list and no config", async () => {
      const client = makeClient(sampleTasks);
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "@default" }),
      );
    });

    it("uses first enabled list from config when no --list", async () => {
      const client = makeClient(sampleTasks);
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "disabled-list", name: "Disabled", enabled: false },
          { id: "work-list", name: "Work", enabled: true },
        ],
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "work-list" }),
      );
    });

    it("resolves --list by name from config", async () => {
      const client = makeClient(sampleTasks);
      // Override tasklists.list to return multiple lists
      client.tasklists.list = vi.fn().mockResolvedValue({
        data: {
          items: [
            { id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" },
            { id: "work-id", title: "Work", updated: "2026-03-21T10:00:00Z" },
          ],
          nextPageToken: undefined,
        },
      });
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [
          { id: "@default", name: "My Tasks", enabled: true },
          { id: "work-id", name: "Work", enabled: true },
        ],
        list: "Work",
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "work-id" }),
      );
    });

    it("uses --list value directly as ID if not found in config", async () => {
      const client = makeClient(sampleTasks);
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: [],
        list: "some-direct-id",
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ tasklist: "some-direct-id" }),
      );
    });
  });

  describe("due date filters", () => {
    it("filters tasks with --due-before (inclusive)", async () => {
      const client = makeClient(sampleTasks);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        dueBefore: "2026-03-25",
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("Buy groceries");
      expect(text).not.toContain("Write report");
      // Tasks with no due date are excluded
      expect(text).not.toContain("Call dentist");
    });

    it("filters tasks with --due-after", async () => {
      const client = makeClient(sampleTasks);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        dueAfter: "2026-03-26",
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).not.toContain("Buy groceries");
      expect(text).toContain("Write report");
      // Tasks with no due date are excluded when filtering by due-after
      expect(text).not.toContain("Call dentist");
    });
  });

  describe("date validation", () => {
    it("returns error for invalid --due-before date", async () => {
      const client = makeClient(sampleTasks);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        dueBefore: "not-a-date",
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(output.join("")).toContain("Invalid date for --due-before");
    });

    it("returns error for invalid --due-after date", async () => {
      const client = makeClient(sampleTasks);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        dueAfter: "2026-02-30",
      });

      expect(result.exitCode).toBe(ExitCode.ARGUMENT);
      expect(output.join("")).toContain("Invalid date for --due-after");
    });

    it("accepts valid YYYY-MM-DD dates", async () => {
      const client = makeClient(sampleTasks);
      const { write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        dueBefore: "2026-12-31",
        dueAfter: "2026-01-01",
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    });
  });

  describe("quiet output", () => {
    it("outputs task lines without header", async () => {
      const client = makeClient([...sampleTasks, completedTask]);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const text = output.join("\n");
      expect(text).toContain("□ Buy groceries (due: 03/25)");
      expect(text).not.toContain("My Tasks:");
      // Default: only needsAction
      expect(text).not.toContain("Fix login bug");
    });

    it("quiet --all includes completed tasks", async () => {
      const client = makeClient([...sampleTasks, completedTask]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
        all: true,
      });

      const text = output.join("\n");
      expect(text).toContain("□ Buy groceries (due: 03/25)");
      expect(text).toContain("☑ Fix login bug (completed: 03/22)");
    });
  });

  describe("json output", () => {
    it("returns tasks in success envelope with count and list info", async () => {
      const client = makeClient(sampleTasks);
      const { output, write } = makeOutput();

      const result = await handleTaskList({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const json = JSON.parse(output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.tasks).toHaveLength(3);
      expect(json.data.count).toBe(3);
      expect(json.data.list_id).toBe("@default");
      expect(json.data.list_title).toBe("My Tasks");
      expect(json.data.tasks[0]).toMatchObject({
        id: expect.any(String),
        title: "Buy groceries",
        status: "needsAction",
        due: "2026-03-25",
      });
    });

    it("json --completed returns only completed tasks", async () => {
      const client = makeClient([...sampleTasks, completedTask]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        completed: true,
      });

      const json = JSON.parse(output.join(""));
      expect(json.data.tasks).toHaveLength(1);
      expect(json.data.tasks[0].title).toBe("Fix login bug");
      expect(json.data.tasks[0].status).toBe("completed");
    });
  });

  describe("API options", () => {
    it("passes showCompleted=true to API when --all", async () => {
      const client = makeClient([]);
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        all: true,
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ showCompleted: true, showHidden: true }),
      );
    });

    it("passes showCompleted=true to API when --completed", async () => {
      const client = makeClient([]);
      const { write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        completed: true,
      });

      expect(client.tasks.list).toHaveBeenCalledWith(
        expect.objectContaining({ showCompleted: true, showHidden: true }),
      );
    });
  });

  describe("error handling", () => {
    it("throws ApiError on API error", async () => {
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
          list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
          get: vi.fn(),
          insert: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        },
      };

      await expect(
        handleTaskList({
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
