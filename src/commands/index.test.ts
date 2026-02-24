import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerCommands } from "./index.ts";

describe("registerCommands", () => {
  it("is a function that accepts a Command", () => {
    const program = new Command();
    expect(() => registerCommands(program)).not.toThrow();
  });

  it("registers the calendars command", () => {
    const program = new Command();
    registerCommands(program);
    const calendarsCmd = program.commands.find((c) => c.name() === "calendars");
    expect(calendarsCmd).toBeDefined();
  });

  it("registers the list command", () => {
    const program = new Command();
    registerCommands(program);
    const listCmd = program.commands.find((c) => c.name() === "list");
    expect(listCmd).toBeDefined();
  });

  it("registers the search command", () => {
    const program = new Command();
    registerCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("search");
  });

  it("registers the auth command", () => {
    const program = new Command();
    registerCommands(program);
    const authCmd = program.commands.find((c) => c.name() === "auth");
    expect(authCmd).toBeDefined();
  });
});
