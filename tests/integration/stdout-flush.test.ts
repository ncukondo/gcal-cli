import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE = resolve(import.meta.dirname, "fixtures/large-output.ts");
const COMMANDS_INDEX = resolve(import.meta.dirname, "../../src/commands/index.ts");

// Well above the 64KB Linux pipe buffer so anything left in the async write
// queue at exit time shows up as a short read.
const PAYLOAD_BYTES = 200_000;
const HANG_TIMEOUT_MS = 10_000;

interface SpawnResult {
  stdout: string;
  exitCode: number | null;
}

// Node/Bun give a spawned child a socketpair for stdout, whose buffer is far
// larger than a kernel pipe, so the truncation does not reproduce with a
// direct `spawn(..., { stdio: "pipe" })`. Route the fixture through a real
// shell pipe (`| cat`) to get the same 64KB pipe buffer a user's shell uses.
// `pipefail` makes the shell report the fixture's exit code, not cat's.
// Requires `bun` on PATH, even when this suite runs under plain vitest (Node).
function runFixtureThroughPipe(size: number, exitCode: number): Promise<SpawnResult> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(
      "bash",
      ["-o", "pipefail", "-c", 'bun "$0" "$1" "$2" | cat', FIXTURE, String(size), String(exitCode)],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`fixture did not exit within ${String(HANG_TIMEOUT_MS)}ms`));
    }, HANG_TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout: Buffer.concat(chunks).toString("utf8"), exitCode: code });
    });
  });
}

describe("stdout is flushed before the process exits", () => {
  it(
    "delivers more than 64KB through a pipe with exit code 0",
    async () => {
      const { stdout, exitCode } = await runFixtureThroughPipe(PAYLOAD_BYTES, 0);

      expect(stdout.length).toBe(PAYLOAD_BYTES);
      expect(exitCode).toBe(0);
    },
    HANG_TIMEOUT_MS + 1_000,
  );

  it(
    "preserves a non-zero exit code while still delivering all output",
    async () => {
      const { stdout, exitCode } = await runFixtureThroughPipe(PAYLOAD_BYTES, 3);

      expect(stdout.length).toBe(PAYLOAD_BYTES);
      expect(exitCode).toBe(3);
    },
    HANG_TIMEOUT_MS + 1_000,
  );
});

describe("command actions do not call process.exit directly", () => {
  it("src/commands/index.ts contains no process.exit( call", () => {
    const source = readFileSync(COMMANDS_INDEX, "utf8");
    expect(source).not.toContain("process.exit(");
  });
});
