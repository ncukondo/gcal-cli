import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi, GoogleEvent } from "../lib/api.ts";
import { ApiError, getEventWithRaw } from "../lib/api.ts";
import { createUpdateCommand, handleUpdate } from "./update.ts";
import type { UpdateHandlerOptions } from "./update.ts";

const SERIES = "series";

function master(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: SERIES,
    summary: "Monthly meeting",
    description: "Series agenda",
    start: { dateTime: "2026-08-13T20:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-08-13T21:00:00+09:00", timeZone: "Asia/Tokyo" },
    transparency: "opaque",
    recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=2TH"],
    ...overrides,
  };
}

function instance(date: string, overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  const start = `${date}T20:00:00+09:00`;
  return {
    id: `${SERIES}_${date.replaceAll("-", "")}T110000Z`,
    summary: "Monthly meeting",
    description: "Series agenda",
    start: { dateTime: start },
    end: { dateTime: `${date}T21:00:00+09:00` },
    originalStartTime: { dateTime: start },
    recurringEventId: SERIES,
    transparency: "opaque",
    ...overrides,
  };
}

const AUG = "series_20260813T110000Z";
const SEP = "series_20260910T110000Z";

/** The incident from #70: two occurrences carry their own description. */
function incidentInstances(): GoogleEvent[] {
  return [
    instance("2026-08-13", { description: "August agenda" }),
    instance("2026-09-10", { description: "September agenda" }),
    instance("2026-10-08"),
  ];
}

function makeApi(
  target: GoogleEvent,
  instances: GoogleEvent[] = [],
  patchImpl?: (p: { eventId: string }) => Promise<{ data: GoogleEvent }>,
): GoogleCalendarApi {
  return {
    calendarList: { list: vi.fn() },
    events: {
      list: vi.fn(),
      get: vi.fn().mockResolvedValue({ data: target }),
      instances: vi.fn().mockResolvedValue({ data: { items: instances } }),
      insert: vi.fn(),
      import: vi.fn(),
      patch: vi.fn(
        patchImpl ??
          ((p: { eventId: string; requestBody: Partial<GoogleEvent> }) =>
            Promise.resolve({ data: { ...target, ...p.requestBody } })),
      ),
      delete: vi.fn(),
    },
  };
}

async function run(api: GoogleCalendarApi, opts: Partial<UpdateHandlerOptions> = {}) {
  const output: string[] = [];
  const stderr: string[] = [];
  const result = await handleUpdate({
    api,
    eventId: SERIES,
    calendarId: "primary",
    calendarName: "Main",
    format: "text",
    timezone: "Asia/Tokyo",
    write: (msg) => output.push(msg),
    writeStderr: (msg) => stderr.push(msg),
    getEvent: (calId, calName, evtId, tz) => getEventWithRaw(api, calId, calName, evtId, tz),
    ...opts,
  });
  return { ...result, output: output.join("\n"), stderr: stderr.join("\n") };
}

function patchedIds(api: GoogleCalendarApi): string[] {
  return vi.mocked(api.events.patch).mock.calls.map((c) => c[0].eventId);
}

describe("update on a recurring series with modified occurrences (#70)", () => {
  it("leaves a non-recurring event alone: no instance lookup, one patch", async () => {
    const api = makeApi(master({ recurrence: null }));
    const result = await run(api, { description: "New" });
    expect(result.exitCode).toBe(0);
    expect(api.events.instances).not.toHaveBeenCalled();
    expect(patchedIds(api)).toEqual([SERIES]);
  });

  it("leaves a single occurrence alone: it is not a series master", async () => {
    const api = makeApi(instance("2026-08-13"));
    await run(api, { eventId: AUG, description: "New" });
    expect(api.events.instances).not.toHaveBeenCalled();
    expect(patchedIds(api)).toEqual([AUG]);
  });

  it("updates a series without modified occurrences as before", async () => {
    const api = makeApi(master(), [instance("2026-08-13"), instance("2026-09-10")]);
    const result = await run(api, { description: "New" });
    expect(result.exitCode).toBe(0);
    expect(api.events.instances).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "primary", eventId: SERIES }),
    );
    expect(patchedIds(api)).toEqual([SERIES]);
  });

  it("ignores occurrences that differ only in fields the update does not write", async () => {
    const api = makeApi(master(), incidentInstances());
    await run(api, { title: "Renamed" });
    expect(patchedIds(api)).toEqual([SERIES]);
  });

  it("aborts without writing when occurrences would be overwritten", async () => {
    const api = makeApi(master(), incidentInstances());
    const error = await run(api, { description: "New" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_ARGS");
    const message = (error as ApiError).message;
    expect(message).toContain(AUG);
    expect(message).toContain(SEP);
    expect(message).toContain("description");
    expect(message).toContain("--preserve-exceptions");
    expect(message).toContain("--overwrite-exceptions");
    expect(api.events.patch).not.toHaveBeenCalled();
  });

  it("--overwrite-exceptions patches only the series and says what it replaced", async () => {
    const api = makeApi(master(), incidentInstances());
    const result = await run(api, {
      description: "New",
      overwriteExceptions: true,
      format: "json",
    });

    expect(result.exitCode).toBe(0);
    expect(patchedIds(api)).toEqual([SERIES]);
    const json = JSON.parse(result.output);
    expect(json.data.exceptions.action).toBe("overwritten");
    expect(json.data.exceptions.instances.map((i: { id: string }) => i.id)).toEqual([AUG, SEP]);
  });

  it("--preserve-exceptions writes each occurrence's own value back after the series", async () => {
    const api = makeApi(master(), incidentInstances());
    const result = await run(api, {
      description: "New",
      preserveExceptions: true,
      notify: "all",
    });

    expect(result.exitCode).toBe(0);
    expect(patchedIds(api)).toEqual([SERIES, AUG, SEP]);
    const calls = vi.mocked(api.events.patch).mock.calls.map((c) => c[0]);
    expect(calls[0]!.sendUpdates).toBe("all");
    expect(calls[1]).toEqual({
      calendarId: "primary",
      eventId: AUG,
      requestBody: { description: "August agenda" },
      sendUpdates: "none",
    });
    expect(calls[2]!.requestBody).toEqual({ description: "September agenda" });
    expect(result.stderr).toContain("Restored 2 modified occurrence(s)");
  });

  it("--preserve-exceptions reports in JSON which occurrences were restored", async () => {
    const api = makeApi(master(), incidentInstances());
    const result = await run(api, {
      description: "New",
      preserveExceptions: true,
      format: "json",
    });
    const json = JSON.parse(result.output);
    expect(json.data.exceptions).toMatchObject({
      action: "preserved",
      failed: [],
    });
    expect(json.data.exceptions.instances[0]).toMatchObject({
      id: AUG,
      start: "2026-08-13T20:00:00+09:00",
      fields: ["description"],
    });
  });

  it("reports occurrences it could not restore, with their values, and fails", async () => {
    const api = makeApi(master(), incidentInstances(), (p) =>
      p.eventId === SEP
        ? Promise.reject(Object.assign(new Error("Backend Error"), { code: 500 }))
        : Promise.resolve({ data: master({ description: "New" }) }),
    );
    const result = await run(api, {
      description: "New",
      preserveExceptions: true,
      format: "json",
    });

    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.output);
    expect(json.data.exceptions.failed).toEqual([
      expect.objectContaining({ id: SEP, values: { description: "September agenda" } }),
    ]);
    expect(result.stderr).toContain(SEP);
    expect(result.stderr).toContain("September agenda");
  });

  it("--dry-run lists the occurrences that would be overwritten without a flag", async () => {
    const api = makeApi(master(), incidentInstances());
    const result = await run(api, { description: "New", dryRun: true });

    expect(result.exitCode).toBe(0);
    expect(api.events.patch).not.toHaveBeenCalled();
    expect(result.output).toContain(AUG);
    expect(result.output).toContain(SEP);
    expect(result.output).toContain("--preserve-exceptions");
  });

  it("--dry-run JSON names the occurrences and what would happen to them", async () => {
    const api = makeApi(master(), incidentInstances());
    const result = await run(api, {
      description: "New",
      dryRun: true,
      preserveExceptions: true,
      format: "json",
    });
    const json = JSON.parse(result.output);
    expect(json.data.exceptions.action).toBe("preserve");
    expect(json.data.exceptions.instances.map((i: { id: string }) => i.id)).toEqual([AUG, SEP]);
  });

  it("refuses --preserve-exceptions on a time change, which resets every occurrence", async () => {
    const api = makeApi(master(), incidentInstances());
    const error = await run(api, {
      start: "2026-08-13T19:00",
      end: "2026-08-13T20:00",
      preserveExceptions: true,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("cannot be preserved");
    expect((error as ApiError).message).toContain("--overwrite-exceptions");
    expect(api.events.patch).not.toHaveBeenCalled();
  });

  it("counts every modified occurrence as affected by a time change", async () => {
    const api = makeApi(master(), [instance("2026-08-13", { summary: "Special" })]);
    const error = await run(api, { start: "2026-08-13T19:00", end: "2026-08-13T20:00" }).catch(
      (e: unknown) => e,
    );
    expect((error as ApiError).message).toContain(AUG);
  });

  it("rejects --preserve-exceptions together with --overwrite-exceptions", async () => {
    const api = makeApi(master(), incidentInstances());
    const error = await run(api, {
      description: "New",
      preserveExceptions: true,
      overwriteExceptions: true,
    }).catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("INVALID_ARGS");
    expect(api.events.get).not.toHaveBeenCalled();
  });

  it("documents the flags in --help", () => {
    const cmd = createUpdateCommand();
    const help = cmd.helpInformation();
    expect(help).toContain("--preserve-exceptions");
    expect(help).toContain("--overwrite-exceptions");
  });
});

describe("update on a series whose master has no description", () => {
  // Seen on 2026-10-08: when the master has no description, any write to it --
  // a title-only patch included -- clears the descriptions occurrences hold.
  function clearingApi(
    instances: GoogleEvent[],
    patchImpl?: (p: { eventId: string }) => Promise<{ data: GoogleEvent }>,
  ) {
    const api = makeApi(master({ description: null }), instances, patchImpl);
    const cleared = instances.map((i) => ({ ...i, description: null }));
    vi.mocked(api.events.instances)
      .mockResolvedValueOnce({ data: { items: instances } })
      .mockResolvedValue({ data: { items: cleared } });
    return api;
  }

  const own = () => [
    instance("2026-08-13", { description: "August agenda" }),
    instance("2026-09-10", { description: null }),
  ];

  it("writes back the descriptions Google cleared on a title change", async () => {
    const api = clearingApi(own());
    const result = await run(api, { title: "Renamed" });

    expect(result.exitCode).toBe(0);
    expect(patchedIds(api)).toEqual([SERIES, AUG]);
    expect(vi.mocked(api.events.patch).mock.calls[1]![0]).toEqual({
      calendarId: "primary",
      eventId: AUG,
      requestBody: { description: "August agenda" },
      sendUpdates: "none",
    });
    expect(result.stderr).toContain("Restored 1 modified occurrence(s)");
  });

  it("reports them in JSON", async () => {
    const api = clearingApi(own());
    const result = await run(api, { title: "Renamed", format: "json" });
    const json = JSON.parse(result.output);
    expect(json.data.restored).toEqual({
      instances: [expect.objectContaining({ id: AUG, fields: ["description"] })],
      failed: [],
    });
  });

  it("writes nothing back when Google left them alone", async () => {
    const api = makeApi(master({ description: null }), own());
    const result = await run(api, { title: "Renamed", format: "json" });
    expect(patchedIds(api)).toEqual([SERIES]);
    expect(JSON.parse(result.output).data).not.toHaveProperty("restored");
  });

  it("does not re-read when no occurrence holds values the update leaves alone", async () => {
    const api = makeApi(master({ description: null }), [
      instance("2026-08-13", { description: null }),
    ]);
    await run(api, { title: "Renamed" });
    expect(api.events.instances).toHaveBeenCalledTimes(1);
  });

  it("leaves a time change alone: Google resets every occurrence anyway", async () => {
    const api = clearingApi(own());
    await run(api, {
      start: "2026-08-13T19:00",
      end: "2026-08-13T20:00",
      overwriteExceptions: true,
    });
    expect(patchedIds(api)).toEqual([SERIES]);
  });

  it("reports what it could not write back, with the values, and fails", async () => {
    const api = clearingApi(own(), (p) =>
      p.eventId === AUG
        ? Promise.reject(Object.assign(new Error("Backend Error"), { code: 500 }))
        : Promise.resolve({ data: master({ summary: "Renamed" }) }),
    );
    const result = await run(api, { title: "Renamed" });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(AUG);
    expect(result.stderr).toContain("August agenda");
  });
});
