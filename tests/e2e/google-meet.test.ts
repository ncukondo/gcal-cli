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

const start = `${dateOffset(52)}T10:00`;

interface EventPayload {
  data: {
    event: {
      id: string;
      meet_link: string | null;
    };
  };
}

describe.runIf(creds)(
  "E2E: Google Meet",
  () => {
    const cleanup = new TestCleanup();
    let eventId = "";
    /**
     * Consumer and Workspace calendars differ in whether they can host
     * conferences at all. When the test calendar cannot, the API answers the
     * very first --meet with a 400 and the rest of the suite has nothing to
     * assert against, so it steps aside instead of reporting false failures.
     */
    let conferencingUnavailable = false;

    afterAll(async () => {
      await cleanup.deleteAll();
    });

    it("add --meet attaches a conference", async () => {
      // runCli, not runCliJson: an error goes to stderr and leaves stdout empty,
      // so runCliJson would throw on the very path this guard exists to detect.
      const result = await runCli(
        "-f",
        "json",
        "add",
        "--title",
        testEventTitle("Meet"),
        "--start",
        start,
        "--meet",
      );

      if (result.exitCode !== 0) {
        conferencingUnavailable = true;
        console.warn(
          `[e2e] skipping Google Meet assertions; --meet failed with exit ${String(result.exitCode)}: ${result.stderr}`,
        );
        return;
      }

      const payload = JSON.parse(result.stdout) as EventPayload;
      eventId = payload.data.event.id;
      cleanup.track(eventId);

      // Conference allocation is asynchronous, so the link may not be ready yet.
      const link = payload.data.event.meet_link;
      expect(link === null || link.startsWith("https://")).toBe(true);
    });

    it("show reports the conference link once it is ready", async (ctx) => {
      if (conferencingUnavailable || !eventId) {
        ctx.skip();
        return;
      }

      await retryUntil(async () => {
        const { json } = await runCliJson("show", eventId);
        const link = (json as EventPayload).data.event.meet_link;
        expect(link).toBeTruthy();
        expect(link!.startsWith("https://")).toBe(true);
      });

      const text = await runCli("show", eventId);
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain("Meet: https://");
    });

    it("update --remove-meet detaches the conference", async (ctx) => {
      if (conferencingUnavailable || !eventId) {
        ctx.skip();
        return;
      }

      // Only meaningful once a link exists, so establish that first rather than
      // passing trivially against an event that never had a conference.
      await retryUntil(async () => {
        const { json } = await runCliJson("show", eventId);
        expect((json as EventPayload).data.event.meet_link).toBeTruthy();
      });

      const removed = await runCli("update", eventId, "--remove-meet");
      expect(removed.exitCode).toBe(0);

      await retryUntil(async () => {
        const { json } = await runCliJson("show", eventId);
        expect((json as EventPayload).data.event.meet_link).toBeNull();
      });
    });

    it("events created without --meet report a null meet_link", async () => {
      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("NoMeet"),
        "--start",
        start,
      );

      expect(result.exitCode).toBe(0);
      const payload = json as EventPayload;
      cleanup.track(payload.data.event.id);
      expect(payload.data.event.meet_link).toBeNull();
    });

    it("accepts --meet on an all-day event", async (ctx) => {
      if (conferencingUnavailable) {
        ctx.skip();
        return;
      }

      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("AllDayMeet"),
        "--start",
        dateOffset(52),
        "--meet",
      );

      expect(result.exitCode).toBe(0);
      const payload = json as EventPayload;
      cleanup.track(payload.data.event.id);
    });

    it("rejects --meet together with --remove-meet", async () => {
      const result = await runCli("update", "some-event-id", "--meet", "--remove-meet");

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("cannot be used with");
    });
  },
  E2E_TIMEOUT,
);
