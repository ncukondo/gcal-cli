import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi, GoogleEvent, GoogleEventImportBody } from "../lib/api.ts";
import { ApiError, getEventWithRaw } from "../lib/api.ts";
import { createUpdateCommand, handleUpdate } from "./update.ts";
import type { UpdateHandlerOptions } from "./update.ts";

const SERIES = "s";
const NEW_SERIES = "s_R20261023T010000";
const TARGET = "s_20261023T010000Z";

const occurrenceId = (day: number) => `${SERIES}_202610${day}T010000Z`;

function master(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: SERIES,
    iCalUID: `${SERIES}@google.com`,
    status: "confirmed",
    summary: "Daily",
    description: "Series agenda",
    start: { dateTime: "2026-10-19T10:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-10-19T10:30:00+09:00", timeZone: "Asia/Tokyo" },
    transparency: "opaque",
    organizer: { email: "me@example.com", self: true },
    recurrence: ["RRULE:FREQ=DAILY;COUNT=10"],
    ...overrides,
  };
}

function occurrence(day: number, overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  const start = `2026-10-${day}T10:00:00+09:00`;
  return {
    id: occurrenceId(day),
    status: "confirmed",
    summary: "Daily",
    description: "Series agenda",
    start: { dateTime: start },
    end: { dateTime: `2026-10-${day}T10:30:00+09:00` },
    originalStartTime: { dateTime: start },
    recurringEventId: SERIES,
    transparency: "opaque",
    organizer: { email: "me@example.com", self: true },
    ...overrides,
  };
}

/** The ten occurrences of the series, 10/19 to 10/28, with some replaced. */
function series(replace: Record<number, Partial<GoogleEvent>> = {}): GoogleEvent[] {
  return Array.from({ length: 10 }, (_, i) => occurrence(19 + i, replace[19 + i]));
}

interface World {
  master: GoogleEvent;
  instances: GoogleEvent[];
}

function makeApi(world: World): GoogleCalendarApi {
  const byId = (id: string) =>
    id === SERIES ? world.master : world.instances.find((i) => i.id === id);
  return {
    calendarList: { list: vi.fn() },
    events: {
      list: vi.fn(),
      get: vi.fn(async ({ eventId }: { eventId: string }) => {
        const found = byId(eventId);
        if (!found) throw Object.assign(new Error("Not Found"), { code: 404 });
        return { data: found };
      }),
      instances: vi.fn(async (p: { showDeleted?: boolean }) => ({
        data: {
          items: p.showDeleted
            ? world.instances
            : world.instances.filter((i) => i.status !== "cancelled"),
        },
      })),
      insert: vi.fn(),
      import: vi.fn(async ({ requestBody }: { requestBody: GoogleEventImportBody }) => ({
        data: { ...requestBody, id: requestBody.iCalUID.replace("@google.com", "") },
      })),
      patch: vi.fn(async ({ eventId, requestBody }: { eventId: string; requestBody: object }) => ({
        data: { ...(byId(eventId) ?? { id: eventId }), ...requestBody } as GoogleEvent,
      })),
      delete: vi.fn(async () => {}),
    },
  };
}

async function run(api: GoogleCalendarApi, opts: Partial<UpdateHandlerOptions> = {}) {
  const output: string[] = [];
  const stderr: string[] = [];
  const result = await handleUpdate({
    api,
    eventId: TARGET,
    calendarId: "primary",
    calendarName: "Main",
    format: "text",
    timezone: "Asia/Tokyo",
    write: (msg) => output.push(msg),
    writeStderr: (msg) => stderr.push(msg),
    getEvent: (calId, calName, evtId, tz) => getEventWithRaw(api, calId, calName, evtId, tz),
    thisAndFollowing: true,
    ...opts,
  });
  return { ...result, output: output.join("\n"), stderr: stderr.join("\n") };
}

function patches(api: GoogleCalendarApi) {
  return vi.mocked(api.events.patch).mock.calls.map((c) => c[0]);
}

function imported(api: GoogleCalendarApi): GoogleEventImportBody {
  return vi.mocked(api.events.import).mock.calls[0]![0].requestBody;
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("update --this-and-following (#72)", () => {
  describe("what it applies to", () => {
    it("refuses a series master: there is no occurrence to split at", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const error = await failure(run(api, { eventId: SERIES, title: "New" }));
      expect(error.code).toBe("INVALID_ARGS");
      expect(error.message).toContain("occurrence");
      expect(api.events.patch).not.toHaveBeenCalled();
    });

    it("refuses an event that is not part of a series", async () => {
      const api = makeApi({ master: master({ recurrence: null }), instances: [] });
      const error = await failure(run(api, { eventId: SERIES, title: "New" }));
      expect(error.code).toBe("INVALID_ARGS");
    });

    it("refuses a series someone else organizes: only the local copy would change", async () => {
      const other = { email: "boss@example.com" };
      const api = makeApi({
        master: master({ organizer: other }),
        instances: series({ 23: { organizer: other } }),
      });
      const error = await failure(run(api, { title: "New" }));
      expect(error.code).toBe("INVALID_ARGS");
      expect(error.message).toContain("boss@example.com");
      expect(api.events.patch).not.toHaveBeenCalled();
      expect(api.events.import).not.toHaveBeenCalled();
    });

    it("updates the whole series when the split is at the first occurrence", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const result = await run(api, { eventId: occurrenceId(19), title: "New" });
      expect(result.exitCode).toBe(0);
      expect(api.events.import).not.toHaveBeenCalled();
      expect(patches(api)).toEqual([
        expect.objectContaining({ eventId: SERIES, requestBody: { summary: "New" } }),
      ]);
      expect(result.stderr).toContain("first occurrence");
    });
  });

  describe("the split", () => {
    it("ends the original series before the occurrence and imports the rest", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const result = await run(api, { title: "New" });

      expect(result.exitCode).toBe(0);
      expect(patches(api)[0]).toEqual({
        calendarId: "primary",
        eventId: SERIES,
        requestBody: { recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261023T005959Z"] },
        sendUpdates: "none",
      });
      expect(imported(api)).toMatchObject({
        iCalUID: `${NEW_SERIES}@google.com`,
        summary: "New",
        description: "Series agenda",
        recurrence: ["RRULE:FREQ=DAILY;COUNT=6"],
        start: { dateTime: "2026-10-23T01:00:00.000Z", timeZone: "Asia/Tokyo" },
      });
      expect(result.output).toContain(NEW_SERIES);
      expect(result.output).toContain("New");
    });

    it("splits before any write: the rule is cut first, then the new series added", async () => {
      const api = makeApi({ master: master(), instances: series() });
      await run(api, { title: "New" });
      const patchOrder = vi.mocked(api.events.patch).mock.invocationCallOrder[0]!;
      const importOrder = vi.mocked(api.events.import).mock.invocationCallOrder[0]!;
      expect(patchOrder).toBeLessThan(importOrder);
    });

    it("moves the new series when the time changes", async () => {
      const api = makeApi({ master: master(), instances: series() });
      await run(api, { start: "2026-10-23T11:00", overwriteExceptions: true });
      expect(imported(api).start).toEqual({
        dateTime: "2026-10-23T11:00:00+09:00",
        timeZone: "Asia/Tokyo",
      });
      expect(imported(api).end).toEqual({
        dateTime: "2026-10-23T11:30:00+09:00",
        timeZone: "Asia/Tokyo",
      });
      expect(imported(api).iCalUID).toBe(`${NEW_SERIES}@google.com`);
    });

    it("merges a guest list diff against the series, not the occurrence", async () => {
      const api = makeApi({
        master: master({ attendees: [{ email: "alice@example.com" }] }),
        instances: series({ 23: { attendees: [{ email: "carol@example.com" }] } }),
      });
      await run(api, { addAttendee: ["bob@example.com"], overwriteExceptions: true });
      expect(imported(api).attendees).toEqual([
        { email: "alice@example.com" },
        { email: "bob@example.com" },
      ]);
    });

    it("attaches a new Meet conference to the new series after importing it", async () => {
      const api = makeApi({ master: master(), instances: series() });
      await run(api, { meet: true });
      expect(imported(api)).not.toHaveProperty("conferenceData");
      const last = patches(api).at(-1)!;
      expect(last.eventId).toBe(NEW_SERIES);
      expect(last.conferenceDataVersion).toBe(1);
      expect(last.requestBody).toEqual({
        conferenceData: { createRequest: { requestId: expect.any(String) } },
      });
    });

    it("drops the conference from the new series with --remove-meet", async () => {
      const conferenceData = { conferenceId: "abc", entryPoints: [] };
      const api = makeApi({
        master: master({ conferenceData }),
        instances: series().map((i) => ({ ...i, conferenceData })),
      });
      await run(api, { removeMeet: true });
      expect(imported(api)).not.toHaveProperty("conferenceData");
    });

    it("notifies only the truncation and says the new series is not announced", async () => {
      const attendees = [{ email: "alice@example.com" }];
      const api = makeApi({
        master: master({ attendees }),
        instances: series().map((i) => ({ ...i, attendees })),
      });
      const result = await run(api, { title: "New", notify: "all" });
      expect(patches(api)[0]!.sendUpdates).toBe("all");
      expect(result.stderr).toContain("not notified");
    });

    it("prints the new series ID in quiet mode", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const result = await run(api, { title: "New", quiet: true });
      expect(result.output).toBe(NEW_SERIES);
    });

    it("reports both halves of the split in JSON", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const result = await run(api, { title: "New", format: "json" });
      const data = JSON.parse(result.output).data;
      expect(data.event.id).toBe(NEW_SERIES);
      expect(data.split).toEqual({
        series_id: SERIES,
        new_series_id: NEW_SERIES,
        split_at: "2026-10-23T10:00:00+09:00",
        recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261023T005959Z"],
        new_recurrence: ["RRULE:FREQ=DAILY;COUNT=6"],
      });
    });
  });

  describe("occurrences after the split", () => {
    it("writes back their own values for fields the update does not change", async () => {
      const api = makeApi({
        master: master(),
        instances: series({
          20: { description: "Before the split" },
          25: { description: "Own agenda", location: "Room 2" },
        }),
      });
      const result = await run(api, { title: "New" });

      expect(result.exitCode).toBe(0);
      const restores = patches(api).filter((p) => p.eventId !== SERIES);
      expect(restores).toEqual([
        {
          calendarId: "primary",
          eventId: occurrenceId(25),
          requestBody: { description: "Own agenda", location: "Room 2" },
          sendUpdates: "none",
        },
      ]);
    });

    it("puts a moved occurrence back where it was moved", async () => {
      const api = makeApi({
        master: master(),
        instances: series({
          25: {
            start: { dateTime: "2026-10-25T15:00:00+09:00" },
            end: { dateTime: "2026-10-25T15:30:00+09:00" },
          },
        }),
      });
      await run(api, { title: "New" });
      const restore = patches(api).find((p) => p.eventId === occurrenceId(25))!;
      expect(restore.requestBody).toEqual({
        start: { dateTime: "2026-10-25T15:00:00+09:00" },
        end: { dateTime: "2026-10-25T15:30:00+09:00" },
      });
    });

    it("deletes again the occurrences that were deleted, which the import brings back", async () => {
      const api = makeApi({
        master: master(),
        instances: series({ 21: { status: "cancelled" }, 26: { status: "cancelled" } }),
      });
      await run(api, { title: "New" });
      expect(vi.mocked(api.events.delete).mock.calls.map((c) => c[0])).toEqual([
        { calendarId: "primary", eventId: occurrenceId(26), sendUpdates: "none" },
      ]);
    });

    it("aborts without writing when one has its own value for a changed field", async () => {
      const api = makeApi({
        master: master(),
        instances: series({ 25: { summary: "Special" } }),
      });
      const error = await failure(run(api, { title: "New" }));
      expect(error.code).toBe("INVALID_ARGS");
      expect(error.message).toContain(occurrenceId(25));
      expect(error.message).toContain("--preserve-exceptions");
      expect(api.events.patch).not.toHaveBeenCalled();
      expect(api.events.import).not.toHaveBeenCalled();
    });

    it("--preserve-exceptions keeps that value too", async () => {
      const api = makeApi({
        master: master(),
        instances: series({ 25: { summary: "Special", description: "Own agenda" } }),
      });
      await run(api, { title: "New", preserveExceptions: true });
      const restore = patches(api).find((p) => p.eventId === occurrenceId(25))!;
      expect(restore.requestBody).toEqual({ summary: "Special", description: "Own agenda" });
    });

    it("--overwrite-exceptions replaces that value but keeps the others", async () => {
      const api = makeApi({
        master: master(),
        instances: series({ 25: { summary: "Special", description: "Own agenda" } }),
      });
      const result = await run(api, { title: "New", overwriteExceptions: true });
      const restore = patches(api).find((p) => p.eventId === occurrenceId(25))!;
      expect(restore.requestBody).toEqual({ description: "Own agenda" });
      expect(result.stderr).toContain(occurrenceId(25));
    });

    it("cannot keep an occurrence's own conference", async () => {
      const api = makeApi({
        master: master(),
        instances: series({
          25: { conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://x" }] } },
        }),
      });
      const error = await failure(run(api, { title: "New" }));
      expect(error.message).toContain("conference");
      expect(error.message).toContain("--overwrite-exceptions");
      expect(api.events.patch).not.toHaveBeenCalled();

      await failure(run(api, { title: "New", preserveExceptions: true }));
      expect(api.events.patch).not.toHaveBeenCalled();
    });

    describe("when the time changes", () => {
      it("aborts: modified occurrences cannot be carried to new times", async () => {
        const api = makeApi({
          master: master(),
          instances: series({ 25: { description: "Own agenda" } }),
        });
        const error = await failure(run(api, { start: "2026-10-23T11:00" }));
        expect(error.message).toContain(occurrenceId(25));
        expect(error.message).toContain("--overwrite-exceptions");
        expect(api.events.patch).not.toHaveBeenCalled();
      });

      it("aborts for deleted occurrences, which would come back", async () => {
        const api = makeApi({
          master: master(),
          instances: series({ 26: { status: "cancelled" } }),
        });
        const error = await failure(run(api, { start: "2026-10-23T11:00" }));
        expect(error.message).toContain(occurrenceId(26));
        expect(error.message).toContain("deleted");
      });

      it("refuses --preserve-exceptions", async () => {
        const api = makeApi({
          master: master(),
          instances: series({ 25: { description: "Own agenda" } }),
        });
        const error = await failure(
          run(api, { start: "2026-10-23T11:00", preserveExceptions: true }),
        );
        expect(error.code).toBe("INVALID_ARGS");
        expect(api.events.patch).not.toHaveBeenCalled();
      });

      it("--overwrite-exceptions goes ahead without writing anything back", async () => {
        const api = makeApi({
          master: master(),
          instances: series({ 25: { description: "Own agenda" }, 26: { status: "cancelled" } }),
        });
        const result = await run(api, { start: "2026-10-23T11:00", overwriteExceptions: true });
        expect(result.exitCode).toBe(0);
        expect(patches(api).map((p) => p.eventId)).toEqual([SERIES]);
        expect(api.events.delete).not.toHaveBeenCalled();
      });
    });

    it("reports what it wrote back and what failed, with the values, in JSON", async () => {
      const api = makeApi({
        master: master(),
        instances: series({
          25: { description: "Own agenda" },
          27: { description: "Other agenda" },
          26: { status: "cancelled" },
        }),
      });
      vi.mocked(api.events.patch).mockImplementation(async (p) => {
        if (p.eventId === occurrenceId(27)) throw new Error("Backend Error");
        return { data: { ...master(), ...p.requestBody } as GoogleEvent };
      });
      const result = await run(api, { title: "New", format: "json" });

      expect(result.exitCode).toBe(1);
      const exceptions = JSON.parse(result.output).data.exceptions;
      expect(exceptions.action).toBe("carried");
      expect(exceptions.instances.map((i: { id: string }) => i.id)).toEqual([
        occurrenceId(25),
        occurrenceId(27),
      ]);
      expect(exceptions.deleted).toEqual([occurrenceId(26)]);
      expect(exceptions.failed).toEqual([
        expect.objectContaining({
          id: occurrenceId(27),
          values: { description: "Other agenda" },
        }),
      ]);
    });
  });

  describe("--dry-run", () => {
    it("shows the split, both rules and the affected occurrences, and writes nothing", async () => {
      const api = makeApi({
        master: master(),
        instances: series({ 25: { summary: "Special" }, 26: { status: "cancelled" } }),
      });
      const result = await run(api, { title: "New", dryRun: true });

      expect(result.exitCode).toBe(0);
      expect(api.events.patch).not.toHaveBeenCalled();
      expect(api.events.import).not.toHaveBeenCalled();
      expect(result.output).toContain("2026-10-23T10:00:00+09:00");
      expect(result.output).toContain("RRULE:FREQ=DAILY;UNTIL=20261023T005959Z");
      expect(result.output).toContain("RRULE:FREQ=DAILY;COUNT=6");
      expect(result.output).toContain(NEW_SERIES);
      expect(result.output).toContain(occurrenceId(25));
      expect(result.output).toContain(occurrenceId(26));
    });

    it("describes the split in JSON", async () => {
      const api = makeApi({ master: master(), instances: series() });
      const result = await run(api, { title: "New", dryRun: true, format: "json" });
      const data = JSON.parse(result.output).data;
      expect(data.dry_run).toBe(true);
      expect(data.split).toMatchObject({ new_series_id: NEW_SERIES });
      expect(data.changes).toEqual({ title: "New" });
    });
  });

  describe("when adding the new series fails", () => {
    function failingImport(world: World) {
      const api = makeApi(world);
      vi.mocked(api.events.import).mockRejectedValue(
        Object.assign(new Error("Backend Error"), { code: 500 }),
      );
      return api;
    }

    it("restores the original rule and its occurrences, then reports the failure", async () => {
      const api = failingImport({
        master: master(),
        instances: series({ 25: { description: "Own agenda" }, 26: { status: "cancelled" } }),
      });
      const error = await failure(run(api, { title: "New" }));

      expect(error.message).toContain("Backend Error");
      expect(error.message).toContain("restored");
      expect(patches(api)).toEqual([
        expect.objectContaining({ eventId: SERIES }),
        expect.objectContaining({
          eventId: SERIES,
          requestBody: { recurrence: ["RRULE:FREQ=DAILY;COUNT=10"] },
          sendUpdates: "none",
        }),
        expect.objectContaining({
          eventId: occurrenceId(25),
          requestBody: { description: "Own agenda" },
        }),
      ]);
      expect(api.events.delete).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: occurrenceId(26) }),
      );
    });

    it("names the original rule when even the rollback fails", async () => {
      const api = failingImport({ master: master(), instances: series() });
      vi.mocked(api.events.patch)
        .mockResolvedValueOnce({ data: master() })
        .mockRejectedValueOnce(new Error("Rate Limit"));
      const error = await failure(run(api, { title: "New" }));
      expect(error.message).toContain("RRULE:FREQ=DAILY;COUNT=10");
      expect(error.message).toContain(SERIES);
    });
  });

  it("is wired to the CLI as --this-and-following", () => {
    const cmd = createUpdateCommand();
    const opt = cmd.options.find((o) => o.long === "--this-and-following");
    expect(opt).toBeDefined();
    expect(cmd.helpInformation()).toContain("--this-and-following");
  });
});
