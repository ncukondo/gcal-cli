#!/usr/bin/env bun
import { createProgram, resolveGlobalOptions, handleError } from "./cli.ts";
import { registerCommands } from "./commands/index.ts";

const program = createProgram();
registerCommands(program);

try {
  program.parse();
} catch (error) {
  const opts = resolveGlobalOptions(program);
  handleError(error, opts.format);
}
