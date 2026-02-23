import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerCommands } from "./index.ts";

describe("registerCommands", () => {
  it("is a function that accepts a Command", () => {
    const program = new Command();
    expect(() => registerCommands(program)).not.toThrow();
  });

  it("registers the search command", () => {
    const program = new Command();
    registerCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("search");
  });
});
