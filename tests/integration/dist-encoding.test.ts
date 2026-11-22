import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BUILD_SCRIPT = resolve(import.meta.dirname, "../../scripts/build.ts");
const BUILD_TIMEOUT_MS = 60_000;

// The installed CLI runs dist/index.js under bun (#77). Bun reads a file that
// starts with the `// @bun` pragma as Latin-1, and its bundler leaves some
// non-ASCII text raw, so every such character came out garbled.
// Requires `bun` on PATH, even when this suite runs under plain vitest (Node).
describe("built CLI under bun (#77)", () => {
  let outdir: string;
  let bundle: string;

  beforeAll(() => {
    outdir = mkdtempSync(join(tmpdir(), "gcal-dist-"));
    execFileSync("bun", [BUILD_SCRIPT, "--outdir", outdir], { stdio: "ignore" });
    bundle = join(outdir, "index.js");
  }, BUILD_TIMEOUT_MS);

  afterAll(() => {
    rmSync(outdir, { recursive: true, force: true });
  });

  function runBundle(...args: string[]): string {
    return execFileSync("bun", [bundle, ...args], { encoding: "utf8" });
  }

  it("keeps the shebang but drops the `// @bun` pragma", () => {
    const [first, second] = readFileSync(bundle, "utf8").split("\n");
    expect(first).toBe("#!/usr/bin/env bun");
    expect(second).not.toBe("// @bun");
  });

  it("prints non-ASCII text from string literals intact", () => {
    expect(runBundle("update", "--help")).toContain("Datetime (YYYY-MM-DDTHH:MM) → timed");
  });

  it("prints non-ASCII text from template literals intact", () => {
    expect(runBundle("add", "--help")).toContain('--location "A-2会議室"');
  });
});
