import type { Command } from "commander";

/**
 * Test helper: parse `args` with `cmd` (and all subcommands) set to throw instead
 * of exiting, and return the thrown error plus everything written to stderr.
 */
export function captureParseError(
  cmd: Command,
  args: string[],
): { thrown: (Error & { exitCode?: number; code?: string }) | undefined; stderr: string } {
  let stderr = "";
  const all: Command[] = [];
  const walk = (c: Command) => {
    all.push(c);
    c.commands.forEach(walk);
  };
  walk(cmd);
  for (const c of all) {
    c.exitOverride();
    c.configureOutput({ writeErr: (s) => (stderr += s), writeOut: () => {} });
  }
  let thrown: (Error & { exitCode?: number; code?: string }) | undefined;
  try {
    cmd.parse(args, { from: "user" });
  } catch (e) {
    thrown = e as Error & { exitCode?: number };
  }
  return { thrown, stderr };
}
