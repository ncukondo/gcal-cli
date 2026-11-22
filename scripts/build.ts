/**
 * Bundles the CLI into dist/ (or `--outdir <dir>`).
 *
 * The entry point's `#!/usr/bin/env bun` shebang makes the bundler mark the
 * output with a `// @bun` pragma. Bun reads a file carrying that pragma as
 * Latin-1, yet the bundler leaves some non-ASCII text raw -- template literals,
 * and even "⚠" escapes it decodes -- so the installed CLI printed those
 * characters garbled (#77). Dropping the pragma makes Bun read the bundle as
 * UTF-8 like any other script; it costs no measurable startup time.
 */
import { parseArgs } from "node:util";
import { join } from "node:path";

const BUN_PRAGMA = /^(#![^\n]*\n)?\/\/ @bun[^\n]*\n/;

export function stripBunPragma(code: string): string {
  return code.replace(BUN_PRAGMA, "$1");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { outdir: { type: "string", default: "dist" } } });
  const outdir = values.outdir;

  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/index.ts")],
    outdir,
    target: "node",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  for (const output of result.outputs) {
    if (output.kind !== "entry-point") continue;
    const code = await Bun.file(output.path).text();
    await Bun.write(output.path, stripBunPragma(code));
  }
}

if (import.meta.main) {
  await main();
}
