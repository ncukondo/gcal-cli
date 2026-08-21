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

// example.com is reserved by RFC 2606 and never accepts mail, so these can
// never reach a real inbox even if a notification were sent by mistake.
const GUEST_A = "gcal-cli-e2e-a@example.com";
const GUEST_B = "gcal-cli-e2e-b@example.com";

const start = `${dateOffset(51)}T10:00`;

interface EventPayload {
  data: {
    event: {
      id: string;
      attendees: {
        email: string;
        display_name: string | null;
        response_status: string;
        optional: boolean;
        organizer: boolean;
        self: boolean;
      }[];
    };
  };
}

function emailsOf(payload: EventPayload): string[] {
  return payload.data.event.attendees.map((a) => a.email.toLowerCase());
}

describe.runIf(creds)(
  "E2E: attendees",
  () => {
    const cleanup = new TestCleanup();
    let eventId = "";

    afterAll(async () => {
      await cleanup.deleteAll();
    });

    it("add invites attendees without sending mail", async () => {
      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("Attendees"),
        "--start",
        start,
        "--attendee",
        GUEST_A,
        "--attendee",
        GUEST_B,
      );

      expect(result.exitCode).toBe(0);
      const payload = json as EventPayload;
      eventId = payload.data.event.id;
      cleanup.track(eventId);

      expect(emailsOf(payload)).toEqual(expect.arrayContaining([GUEST_A, GUEST_B]));
    });

    it("show reports the guest list with response status", async () => {
      await retryUntil(async () => {
        const { json } = await runCliJson("show", eventId);
        const payload = json as EventPayload;
        const guest = payload.data.event.attendees.find((a) => a.email.toLowerCase() === GUEST_A);
        expect(guest).toBeDefined();
        expect(guest!.response_status).toBe("needsAction");
      });

      const text = await runCli("show", eventId);
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain("Attendees:");
      expect(text.stdout).toContain(GUEST_A);
      expect(text.stdout).toContain("[needsAction]");
    });

    it("update --clear-attendees empties the guest list", async () => {
      const cleared = await runCli("update", eventId, "--clear-attendees");
      expect(cleared.exitCode).toBe(0);

      await retryUntil(async () => {
        const { json } = await runCliJson("show", eventId);
        const emails = emailsOf(json as EventPayload);
        expect(emails).not.toContain(GUEST_A);
        expect(emails).not.toContain(GUEST_B);
      });
    });

    it("events created without guests report an empty attendees array", async () => {
      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("NoAttendees"),
        "--start",
        start,
      );

      expect(result.exitCode).toBe(0);
      const payload = json as EventPayload;
      cleanup.track(payload.data.event.id);
      expect(payload.data.event.attendees).toEqual([]);
    });

    it("rejects a malformed attendee address before calling the API", async () => {
      const result = await runCli(
        "add",
        "--title",
        testEventTitle("BadAttendee"),
        "--start",
        start,
        "--attendee",
        "not-an-email",
      );

      expect(result.exitCode).toBe(3);
    });

    it("rejects an unknown --notify scope", async () => {
      const result = await runCli(
        "add",
        "--title",
        testEventTitle("BadNotify"),
        "--start",
        start,
        "--notify",
        "everyone",
      );

      expect(result.exitCode).toBe(3);
    });
  },
  E2E_TIMEOUT,
);
