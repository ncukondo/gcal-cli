import type { Command } from "commander";
import { createSearchCommand } from "./search.ts";

export function registerCommands(program: Command): void {
  program.addCommand(createSearchCommand());
}
