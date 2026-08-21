import { describe, it, expect, afterAll } from "vitest";
import {
  runCli,
  testEventTitle,
  todayDate,
  TestCleanup,
  hasCredentials,
  E2E_TIMEOUT,
} from "./helpers.ts";

/**
 * A read-only calendar is the only way to draw a real 403 without a second
 * account, and it cannot be provisioned from here -- point
 * GCAL_E2E_READONLY_CALENDAR_ID at a subscribed or read-access calendar
 * (e.g. `...@import.calendar.google.com`) to enable this suite.
 */
const readOnlyCalendarId = process.env["GCAL_E2E_READONLY_CALENDAR_ID"] ?? "";
const enabled = hasCredentials() && readOnlyCalendarId !== "";

/** YYYY-MM-DD `days` after today, in local time. */
function dateOffset(days: number): string {
  const [y, m, d] = todayDate().split("-").map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const start = `${dateOffset(58)}T10:00`;

interface ErrorPayload {
  success: false;
  error: { code: string; message: string };
}

interface EventPayload {
  data: { event: { id: string } };
}

describe.runIf(enabled)(
  "E2E: permission errors are not authentication errors",
  () => {
    const cleanup = new TestCleanup();

    afterAll(async () => {
      await cleanup.deleteAll();
    });

    it("add to a read-only calendar returns FORBIDDEN and exit 1", async () => {
      // runCli, not runCliJson: the error goes to stderr and leaves stdout empty.
      const result = await runCli(
        "-f",
        "json",
        "add",
        "-c",
        readOnlyCalendarId,
        "--title",
        testEventTitle("Forbidden"),
        "--start",
        start,
      );

      expect(result.exitCode).toBe(1);
      const payload = JSON.parse(result.stderr) as ErrorPayload;
      expect(payload.success).toBe(false);
      expect(payload.error.code).toBe("FORBIDDEN");
      // The API wording is kept, and the user is told a re-auth is not the fix.
      expect(payload.error.message).toContain("Re-authenticating will not help");
      expect(payload.error.message).not.toContain("gcal auth");
      expect(payload.error.message.toLowerCase()).not.toContain("not authenticated");
    });

    it("the same add succeeds on a writable calendar", async () => {
      const result = await runCli(
        "-f",
        "json",
        "add",
        "--title",
        testEventTitle("Forbidden control"),
        "--start",
        start,
      );

      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as EventPayload;
      cleanup.track(payload.data.event.id);
    });
  },
  E2E_TIMEOUT,
);
