import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { addConflictRules } from "./conflict-hints.ts";
import { captureParseError } from "./parse-error-helper.ts";

function makeCmd() {
  const cmd = new Command("x");
  cmd.option("--alpha", "a");
  cmd.option("--beta <v>", "b");
  cmd.option("--gamma", "g");
  cmd.option("--be", "prefix of beta");
  addConflictRules(cmd, [
    { options: ["--alpha", "--beta"], hint: "hint: alpha-or-beta" },
    { options: ["--gamma", "--be"], hint: "hint: gamma-or-be" },
  ]);
  return cmd;
}

describe("addConflictRules", () => {
  it("makes both options conflict with each other", () => {
    const cmd = makeCmd();
    const opt = (l: string) =>
      cmd.options.find((o) => o.long === l) as unknown as { conflictsWith: string[] };
    expect(opt("--alpha").conflictsWith).toContain("beta");
    expect(opt("--beta").conflictsWith).toContain("alpha");
  });

  it("rejects the pair with a non-zero exit and prints the matching hint only", () => {
    const { thrown, stderr } = captureParseError(makeCmd(), ["--alpha", "--beta", "1"]);
    expect(thrown?.code).toBe("commander.conflictingOption");
    expect(thrown?.exitCode).not.toBe(0);
    expect(stderr).toMatch(/cannot be used with/);
    expect(stderr).toContain("hint: alpha-or-beta");
    expect(stderr).not.toContain("hint: gamma-or-be");
  });

  it("matches flags exactly, not by prefix", () => {
    const { stderr } = captureParseError(makeCmd(), ["--gamma", "--be"]);
    expect(stderr).toContain("hint: gamma-or-be");
    expect(stderr).not.toContain("hint: alpha-or-beta");
  });

  it("keeps existing conflicts declared on the options", () => {
    const cmd = new Command("y");
    cmd.option("--a1", "");
    cmd.option("--a2", "");
    cmd.option("--a3", "");
    cmd.options.find((o) => o.long === "--a1")!.conflicts(["a3"]);
    addConflictRules(cmd, [{ options: ["--a1", "--a2"], hint: "hint: h" }]);
    expect(
      (cmd.options.find((o) => o.long === "--a1") as unknown as { conflictsWith: string[] })
        .conflictsWith,
    ).toEqual(["a3", "a2"]);
  });

  it("adds no hint to other errors", () => {
    const { thrown, stderr } = captureParseError(makeCmd(), ["--unknown"]);
    expect(thrown).toBeDefined();
    expect(stderr).not.toContain("hint:");
  });
});
