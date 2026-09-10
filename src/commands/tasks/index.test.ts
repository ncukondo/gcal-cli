import { describe, expect, it } from "vitest";
import { createTasksCommand } from "./index.ts";

function optionOf(long: string) {
  const { listCmd } = createTasksCommand();
  const opt = listCmd.options.find((o) => o.long === long) as
    | { conflictsWith: string[]; parseArg?: (v: string) => unknown }
    | undefined;
  expect(opt, `${long} should be defined`).toBeDefined();
  return opt!;
}

describe("tasks list command options", () => {
  it("has --today, --overdue and --days options", () => {
    optionOf("--today");
    optionOf("--overdue");
    optionOf("--days");
  });

  it("--days parses its value as an integer", () => {
    const daysOpt = optionOf("--days");
    expect(daysOpt.parseArg?.("3")).toBe(3);
  });

  it("--today conflicts with the other shortcuts and --due-before/--due-after", () => {
    const opt = optionOf("--today");
    expect(opt.conflictsWith).toEqual(
      expect.arrayContaining(["overdue", "days", "dueBefore", "dueAfter"]),
    );
  });

  it("--overdue conflicts with the other shortcuts and --due-before/--due-after", () => {
    const opt = optionOf("--overdue");
    expect(opt.conflictsWith).toEqual(
      expect.arrayContaining(["today", "days", "dueBefore", "dueAfter"]),
    );
  });

  it("--days conflicts with the other shortcuts and --due-before/--due-after", () => {
    const opt = optionOf("--days");
    expect(opt.conflictsWith).toEqual(
      expect.arrayContaining(["today", "overdue", "dueBefore", "dueAfter"]),
    );
  });

  it("--due-before and --due-after conflict with the shortcuts", () => {
    expect(optionOf("--due-before").conflictsWith).toEqual(
      expect.arrayContaining(["today", "overdue", "days"]),
    );
    expect(optionOf("--due-after").conflictsWith).toEqual(
      expect.arrayContaining(["today", "overdue", "days"]),
    );
  });

  it("rejects --today together with --due-before at parse time", () => {
    const { tasksCmd } = createTasksCommand();
    tasksCmd.exitOverride();
    for (const sub of tasksCmd.commands) sub.exitOverride();
    tasksCmd.configureOutput({ writeErr: () => {} });
    expect(() =>
      tasksCmd.parse(["list", "--today", "--due-before", "2026-01-01"], { from: "user" }),
    ).toThrow(/cannot be used with/);
  });
});
