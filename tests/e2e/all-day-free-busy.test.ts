import { describe, it, expect, afterAll } from "vitest";
import {
  runCli,
  runCliJson,
  testEventTitle,
  todayDate,
  TestCleanup,
  hasCredentials,
  retryUntil,
  E2E_TIMEOUT,
} from "./helpers.ts";

const creds = hasCredentials();

/** YYYY-MM-DD `days` after today, in local time. */
function dateOffset(days: number): string {
  const [y, m, d] = todayDate().split("-").map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const day = dateOffset(50);

describe.runIf(creds)(
  "E2E: all-day free/busy",
  () => {
    const cleanup = new TestCleanup();

    afterAll(async () => {
      await cleanup.deleteAll();
    });

    const freeTitle = testEventTitle("AllDayFree");

    it("add creates a free all-day event", async () => {
      const { json, result } = await runCliJson(
        "add",
        "--title",
        freeTitle,
        "--start",
        day,
        "--free",
      );

      expect(result.exitCode).toBe(0);
      const data = json as {
        data: { event: { id: string; all_day: boolean; transparency: string } };
      };
      expect(data.data.event.all_day).toBe(true);
      expect(data.data.event.transparency).toBe("transparent");
      cleanup.track(data.data.event.id);
    });

    it("list tags the all-day event as [free]", async () => {
      await retryUntil(async () => {
        const result = await runCli("list", "--from", day, "--to", day);
        expect(result.exitCode).toBe(0);
        const line = result.stdout.split("\n").find((l) => l.includes(freeTitle));
        expect(line).toBeDefined();
        expect(line).toContain("[All Day]");
        expect(line).toContain("[free]");
      });
    });

    it("list --busy hides it from stdout but names it on stderr", async () => {
      await retryUntil(async () => {
        const result = await runCli("list", "--from", day, "--to", day, "--busy");
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain(freeTitle);
        expect(result.stderr).toContain("hidden by --busy");
        expect(result.stderr).toContain(freeTitle);
        expect(result.stderr).toContain(day);
      });
    });

    // Retried: asserting the event is present races Google's eventual consistency.
    it("list --free does not emit the notice", async () => {
      await retryUntil(async () => {
        const result = await runCli("list", "--from", day, "--to", day, "--free");
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(freeTitle);
        expect(result.stderr).not.toContain("hidden by --busy");
      });
    });

    it("list without a transparency filter does not emit the notice", async () => {
      const result = await runCli("list", "--from", day, "--to", day);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("hidden by --busy");
    });

    it("list --busy -f json keeps stdout parseable", async () => {
      const result = await runCli("-f", "json", "list", "--from", day, "--to", day, "--busy");
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stderr).toContain("hidden by --busy");
    });
  },
  E2E_TIMEOUT,
);
