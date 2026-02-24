import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CLI_PATH = resolve(import.meta.dirname, "../../src/index.ts");

/**
 * Check if Google Calendar credentials are available.
 * E2E tests require either client_secret.json or environment variables.
 */
export function hasCredentials(): boolean {
  const home = process.env["HOME"] ?? "";
  const clientSecretPath = `${home}/.config/gcal-cli/client_secret.json`;
  const hasFile = existsSync(clientSecretPath);
  const hasEnv = !!(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]);
  return hasFile || hasEnv;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the gcal CLI with the given arguments.
 * Returns stdout, stderr, and exit code.
 */
export async function runCli(...args: string[]): Promise<CliResult> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Prevent config file from current directory interfering
      NO_COLOR: "1",
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Run the CLI and parse JSON output.
 */
export async function runCliJson(...args: string[]): Promise<{ result: CliResult; json: unknown }> {
  const result = await runCli("-f", "json", ...args);
  let json: unknown;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Failed to parse JSON output:\n${result.stdout}\nstderr: ${result.stderr}`);
  }
  return { result, json };
}

/**
 * Generate a unique test event title to avoid collisions.
 */
export function testEventTitle(suffix?: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `E2E Test ${ts}-${rand}${suffix ? ` ${suffix}` : ""}`;
}

/**
 * Get today's date as YYYY-MM-DD in local timezone.
 */
export function todayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get an ISO datetime string for today at a specific hour (local time).
 */
export function todayAt(hour: number, minute = 0): string {
  return `${todayDate()}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

/**
 * Delete a test event by ID (best-effort cleanup).
 */
export async function deleteTestEvent(eventId: string): Promise<void> {
  await runCli("delete", eventId);
}

/**
 * Cleanup tracker: collects event IDs and deletes them all in afterAll.
 */
export class TestCleanup {
  private eventIds: string[] = [];

  track(eventId: string): void {
    this.eventIds.push(eventId);
  }

  async deleteAll(): Promise<void> {
    for (const id of this.eventIds) {
      try {
        await deleteTestEvent(id);
      } catch {
        // Best-effort cleanup
      }
    }
    this.eventIds = [];
  }
}
