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

  it("--days rejects non-integer values (1.5, abc) as NaN so the handler reports an error", () => {
    const daysOpt = optionOf("--days");
    expect(daysOpt.parseArg?.("1.5")).toBeNaN();
    expect(daysOpt.parseArg?.("abc")).toBeNaN();
    expect(daysOpt.parseArg?.("")).toBeNaN();
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
  it("--all and --completed conflict with each other", () => {
    expect(optionOf("--all").conflictsWith).toEqual(expect.arrayContaining(["completed"]));
    expect(optionOf("--completed").conflictsWith).toEqual(expect.arrayContaining(["all"]));
  });

  it("rejects --all together with --completed and points to the right flag", () => {
    const { tasksCmd } = createTasksCommand();
    tasksCmd.exitOverride();
    for (const sub of tasksCmd.commands) sub.exitOverride();
    let stderr = "";
    for (const cmd of [tasksCmd, ...tasksCmd.commands]) {
      cmd.configureOutput({ writeErr: (s) => (stderr += s) });
    }
    let thrown: unknown;
    try {
      tasksCmd.parse(["list", "--all", "--completed"], { from: "user" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { exitCode: number }).exitCode).not.toBe(0);
    expect(stderr).toMatch(/cannot be used with/);
    expect(stderr).toMatch(/--completed/);
    expect(stderr).toMatch(/completed tasks only/i);
    expect(stderr).toMatch(/--all/);
  });

  it("does not add the --all/--completed hint to unrelated errors", () => {
    const { tasksCmd } = createTasksCommand();
    tasksCmd.exitOverride();
    for (const sub of tasksCmd.commands) sub.exitOverride();
    let stderr = "";
    for (const cmd of [tasksCmd, ...tasksCmd.commands]) {
      cmd.configureOutput({ writeErr: (s) => (stderr += s) });
    }
    expect(() => tasksCmd.parse(["list", "--today", "--overdue"], { from: "user" })).toThrow();
    expect(stderr).not.toMatch(/completed tasks only/i);
  });
});
