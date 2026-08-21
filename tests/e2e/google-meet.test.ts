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
      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("Meet"),
        "--start",
        start,
        "--meet",
      );

      if (result.exitCode !== 0 && /support creating conferences/.test(result.stderr)) {
        conferencingUnavailable = true;
        return;
      }

      expect(result.exitCode).toBe(0);
      const payload = json as EventPayload;
      eventId = payload.data.event.id;
      cleanup.track(eventId);

      // Conference allocation is asynchronous, so the link may not be ready yet.
      const link = payload.data.event.meet_link;
      expect(link === null || link.startsWith("https://")).toBe(true);
    });

    it("show reports the conference link once it is ready", async () => {
      if (conferencingUnavailable || !eventId) return;

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

    it("update --remove-meet detaches the conference", async () => {
      if (conferencingUnavailable || !eventId) return;

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

    it("rejects --meet on an all-day event", async () => {
      const result = await runCli(
        "add",
        "--title",
        testEventTitle("AllDayMeet"),
        "--start",
        dateOffset(52),
        "--meet",
      );

      expect(result.exitCode).toBe(3);
    });

    it("rejects --meet together with --remove-meet", async () => {
      const result = await runCli("update", "some-event-id", "--meet", "--remove-meet");

      expect(result.exitCode).not.toBe(0);
    });
  },
  E2E_TIMEOUT,
);
