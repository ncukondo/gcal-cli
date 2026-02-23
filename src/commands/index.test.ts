import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerCommands } from "./index.ts";

describe("registerCommands", () => {
  it("is a function that accepts a Command", () => {
    const program = new Command();
    expect(() => registerCommands(program)).not.toThrow();
  });

  it("registers the list command", () => {
    const program = new Command();
    registerCommands(program);
    const listCmd = program.commands.find((c) => c.name() === "list");
    expect(listCmd).toBeDefined();
  });
});
