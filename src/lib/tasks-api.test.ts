import { describe, it, expect } from "vitest";
import { normalizeTaskList, normalizeTask } from "./tasks-api.ts";

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
