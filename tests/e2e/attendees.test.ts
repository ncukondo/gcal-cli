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
const GUEST_C = "gcal-cli-e2e-c@example.com";
const GUEST_UNKNOWN = "gcal-cli-e2e-nobody@example.com";

const start = `${dateOffset(51)}T10:00`;
// A separate day so the diff suite cannot collide with the suites above.
const diffStart = `${dateOffset(53)}T10:00`;

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

describe.runIf(creds)(
  "E2E: attendee diff",
  () => {
    const cleanup = new TestCleanup();
    let eventId = "";

    afterAll(async () => {
      await cleanup.deleteAll();
    });

    it("creates an event with two guests", async () => {
      const { json, result } = await runCliJson(
        "add",
        "--title",
        testEventTitle("AttendeeDiff"),
        "--start",
        diffStart,
        "--attendee",
        GUEST_A,
        "--attendee",
        GUEST_B,
      );

      expect(result.exitCode, result.stderr).toBe(0);
      const payload = json as EventPayload;
      eventId = payload.data.event.id;
      cleanup.track(eventId);

      expect(emailsOf(payload)).toEqual(expect.arrayContaining([GUEST_A, GUEST_B]));
    });

    it("--add-attendee adds a guest and keeps the existing ones", async () => {
      const { json, result } = await runCliJson("update", eventId, "--add-attendee", GUEST_C);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(emailsOf(json as EventPayload)).toEqual(
        expect.arrayContaining([GUEST_A, GUEST_B, GUEST_C]),
      );

      await retryUntil(async () => {
        const shown = await runCliJson("show", eventId);
        expect(emailsOf(shown.json as EventPayload)).toEqual(
          expect.arrayContaining([GUEST_A, GUEST_B, GUEST_C]),
        );
      });
    });

    it("--remove-attendee drops one guest and keeps the others", async () => {
      const { json, result } = await runCliJson("update", eventId, "--remove-attendee", GUEST_B);

      expect(result.exitCode, result.stderr).toBe(0);
      const emails = emailsOf(json as EventPayload);
      expect(emails).not.toContain(GUEST_B);
      expect(emails).toEqual(expect.arrayContaining([GUEST_A, GUEST_C]));

      await retryUntil(async () => {
        const shown = await runCliJson("show", eventId);
        const current = emailsOf(shown.json as EventPayload);
        expect(current).not.toContain(GUEST_B);
        expect(current).toEqual(expect.arrayContaining([GUEST_A, GUEST_C]));
      });
    });

    it("removing a non-attendee succeeds and notes it on stderr", async () => {
      const result = await runCli("update", eventId, "--remove-attendee", GUEST_UNKNOWN);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toContain(`Note: ${GUEST_UNKNOWN} is not an attendee`);

      const { json } = await runCliJson("show", eventId);
      expect(emailsOf(json as EventPayload)).toEqual(expect.arrayContaining([GUEST_A, GUEST_C]));
    });

    it("rejects --attendee together with --add-attendee", async () => {
      const result = await runCli(
        "update",
        eventId,
        "--attendee",
        GUEST_A,
        "--add-attendee",
        GUEST_C,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("cannot be used with");
    });
  },
  E2E_TIMEOUT,
);
