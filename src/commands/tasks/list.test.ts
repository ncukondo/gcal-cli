import { describe, expect, it, vi } from "vitest";
import type { GoogleTasksClient } from "../../lib/tasks-api.ts";
import { ExitCode, type Task } from "../../types/index.ts";
import { handleTaskList, sortTasksByDue } from "./list.ts";
import { makeRawTask, makeClient, makeOutput, defaultConfig } from "./test-helpers.ts";

function makeListClient(tasks: ReturnType<typeof makeRawTask>[]) {
  return makeClient({ tasksList: { data: { items: tasks } } });
}

const sampleTasks = [
  makeRawTask({
    id: "task-buy-groceries",
    title: "Buy groceries",
    due: "2026-03-25T00:00:00.000Z",
  }),
  makeRawTask({
    id: "task-write-report",
    title: "Write report",
    due: "2026-03-26T00:00:00.000Z",
    notes: "Q1 summary for marketing team",
  }),
  makeRawTask({ id: "task-call-dentist", title: "Call dentist" }),
];

const completedTask = makeRawTask({
  id: "task-fix-login-bug",
  title: "Fix login bug",
  status: "completed",
  completed: "2026-03-22T14:30:00.000Z",
  updated: "2026-03-20T10:00:00.000Z",
});

const completedTaskWithDue = makeRawTask({
  id: "task-submit-tax-forms",
  title: "Submit tax forms",
  status: "completed",
  due: "2026-03-20T00:00:00.000Z",
  completed: "2026-03-19T10:00:00.000Z",
  updated: "2026-03-20T10:00:00.000Z",
});

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    notes: null,
    status: "needsAction",
    due: null,
    completed: null,
    list_id: "@default",
    list_title: "My Tasks",
    parent: null,
    updated: "2026-03-24T10:00:00.000Z",
    ...overrides,
  };
}

describe("sortTasksByDue", () => {
  it("sorts tasks by due date ascending", () => {
    const tasks = [
      makeTask({ id: "c", due: "2026-03-27" }),
      makeTask({ id: "a", due: "2026-03-25" }),
      makeTask({ id: "b", due: "2026-03-26" }),
    ];

    expect(sortTasksByDue(tasks).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("places tasks without due date last, keeping their API order", () => {
    const tasks = [
      makeTask({ id: "none-1" }),
      makeTask({ id: "b", due: "2026-03-26" }),
      makeTask({ id: "none-2" }),
      makeTask({ id: "a", due: "2026-03-25" }),
    ];

    expect(sortTasksByDue(tasks).map((t) => t.id)).toEqual(["a", "b", "none-1", "none-2"]);
  });

  it("keeps API order for tasks with the same due date (stable)", () => {
    const tasks = [
      makeTask({ id: "same-1", due: "2026-03-25" }),
      makeTask({ id: "later", due: "2026-03-26" }),
      makeTask({ id: "same-2", due: "2026-03-25" }),
      makeTask({ id: "same-3", due: "2026-03-25" }),
    ];

    expect(sortTasksByDue(tasks).map((t) => t.id)).toEqual(["same-1", "same-2", "same-3", "later"]);
  });

  it("returns an empty array for empty input", () => {
    expect(sortTasksByDue([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const tasks = [
      makeTask({ id: "b", due: "2026-03-26" }),
      makeTask({ id: "a", due: "2026-03-25" }),
    ];

    sortTasksByDue(tasks);

    expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("handleTaskList", () => {
  describe("text output", () => {
    it("shows only needsAction tasks by default with correct formatting", async () => {
      const client = makeListClient([...sampleTasks]);
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
      const client = makeListClient([...sampleTasks, completedTask]);
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
      const client = makeListClient([completedTaskWithDue]);
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
      const client = makeListClient([...sampleTasks, completedTask]);
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
        id: "task-multi",
        title: "Multi note task",
        notes: "First line of notes\nSecond line ignored",
      });
      const client = makeListClient([multilineNotes]);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
      // Override tasklists.list to return multiple lists
      client.tasklists.list = vi.fn().mockResolvedValue({
        data: {
          items: [
            { id: "@default", title: "My Tasks", updated: "2026-03-20T10:00:00Z" },
            { id: "work-id", title: "Work", updated: "2026-03-21T10:00:00Z" },
          ],
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient([...sampleTasks, completedTask]);
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
      const client = makeListClient([...sampleTasks, completedTask]);
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
      const client = makeListClient(sampleTasks);
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
      const client = makeListClient([...sampleTasks, completedTask]);
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

  describe("due date ordering", () => {
    // Deliberately scrambled API order: no-due first, then out-of-order dues.
    const scrambledTasks = [
      makeRawTask({ id: "task-no-due-1", title: "No due first" }),
      makeRawTask({ id: "task-late", title: "Late", due: "2026-03-27T00:00:00.000Z" }),
      makeRawTask({ id: "task-mid-1", title: "Mid one", due: "2026-03-26T00:00:00.000Z" }),
      makeRawTask({ id: "task-no-due-2", title: "No due second" }),
      makeRawTask({ id: "task-early", title: "Early", due: "2026-03-25T00:00:00.000Z" }),
      makeRawTask({ id: "task-mid-2", title: "Mid two", due: "2026-03-26T00:00:00.000Z" }),
    ];
    const expectedTitles = ["Early", "Mid one", "Mid two", "Late", "No due first", "No due second"];

    it("text output lists tasks by due ascending with no-due tasks last", async () => {
      const client = makeListClient(scrambledTasks);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      const lines = output.join("\n").split("\n").slice(1);
      expect(lines).toEqual([
        "  □ Early (due: 03/25)",
        "  □ Mid one (due: 03/26)",
        "  □ Mid two (due: 03/26)",
        "  □ Late (due: 03/27)",
        "  □ No due first",
        "  □ No due second",
      ]);
    });

    it("quiet output uses the same order", async () => {
      const client = makeListClient(scrambledTasks);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
      });

      expect(output.join("\n").split("\n")).toEqual([
        "□ Early (due: 03/25)",
        "□ Mid one (due: 03/26)",
        "□ Mid two (due: 03/26)",
        "□ Late (due: 03/27)",
        "□ No due first",
        "□ No due second",
      ]);
    });

    it("json data.tasks uses the same order", async () => {
      const client = makeListClient(scrambledTasks);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
      });

      const json = JSON.parse(output.join(""));
      expect(json.data.tasks.map((t: { title: string }) => t.title)).toEqual(expectedTitles);
    });

    it("--all sorts completed and incomplete tasks together by due", async () => {
      const client = makeListClient([
        makeRawTask({ id: "t-none", title: "Open no due" }),
        makeRawTask({
          id: "t-done-late",
          title: "Done late",
          status: "completed",
          due: "2026-03-28T00:00:00.000Z",
          completed: "2026-03-10T10:00:00.000Z",
        }),
        makeRawTask({ id: "t-open", title: "Open", due: "2026-03-26T00:00:00.000Z" }),
        makeRawTask({
          id: "t-done-early",
          title: "Done early",
          status: "completed",
          due: "2026-03-24T00:00:00.000Z",
          completed: "2026-03-30T10:00:00.000Z",
        }),
        makeRawTask({
          id: "t-done-none",
          title: "Done no due",
          status: "completed",
          completed: "2026-03-01T10:00:00.000Z",
        }),
      ]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "json",
        quiet: false,
        write,
        configTaskLists: defaultConfig,
        all: true,
      });

      const json = JSON.parse(output.join(""));
      expect(json.data.tasks.map((t: { title: string }) => t.title)).toEqual([
        "Done early",
        "Open",
        "Done late",
        "Open no due",
        "Done no due",
      ]);
    });

    it("--completed sorts by due, not by completed date", async () => {
      const client = makeListClient([
        makeRawTask({
          id: "t-done-none",
          title: "Done no due",
          status: "completed",
          completed: "2026-03-01T10:00:00.000Z",
        }),
        makeRawTask({
          id: "t-done-late",
          title: "Done late",
          status: "completed",
          due: "2026-03-28T00:00:00.000Z",
          completed: "2026-03-02T10:00:00.000Z",
        }),
        makeRawTask({
          id: "t-done-early",
          title: "Done early",
          status: "completed",
          due: "2026-03-24T00:00:00.000Z",
          completed: "2026-03-30T10:00:00.000Z",
        }),
      ]);
      const { output, write } = makeOutput();

      await handleTaskList({
        client,
        format: "text",
        quiet: true,
        write,
        configTaskLists: defaultConfig,
        completed: true,
      });

      expect(output.join("\n").split("\n")).toEqual([
        "☑ Done early (due: 03/24, completed: 03/30)",
        "☑ Done late (due: 03/28, completed: 03/02)",
        "☑ Done no due (completed: 03/01)",
      ]);
    });
  });

  describe("API options", () => {
    it("passes showCompleted=true to API when --all", async () => {
      const client = makeListClient([]);
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
      const client = makeListClient([]);
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
