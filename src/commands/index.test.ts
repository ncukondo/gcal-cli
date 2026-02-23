import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerCommands } from "./index.ts";

describe("registerCommands", () => {
  it("is a function that accepts a Command", () => {
    const program = new Command();
    expect(() => registerCommands(program)).not.toThrow();
  });

  it("does not add commands when none are implemented yet", () => {
    const program = new Command();
    registerCommands(program);
    // Only default commands (help, version) should exist
    expect(program.commands.length).toBe(0);
  });
});
