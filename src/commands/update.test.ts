import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { CalendarEvent } from "../types/index.ts";
import { createUpdateCommand, handleUpdate } from "./update.ts";
import type { UpdateHandlerOptions } from "./update.ts";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Original Meeting",
    description: "Original description",
    start: "2026-02-01T10:00:00+09:00",
    end: "2026-02-01T11:00:00+09:00",
    all_day: false,
    calendar_id: "primary",
    calendar_name: "Main Calendar",
    html_link: "https://calendar.google.com/event?eid=evt1",
    status: "confirmed",
    transparency: "opaque",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMockApi(
  opts: {
    patchReturn?: CalendarEvent;
    patchError?: Error;
    getReturn?: CalendarEvent;
  } = {},
): GoogleCalendarApi {
  const patchFn = opts.patchError
    ? vi.fn().mockRejectedValue(opts.patchError)
    : vi.fn().mockResolvedValue({
        data: opts.patchReturn
          ? {
              id: opts.patchReturn.id,
              summary: opts.patchReturn.title,
              description: opts.patchReturn.description,
              start: opts.patchReturn.all_day
                ? { date: opts.patchReturn.start }
                : { dateTime: opts.patchReturn.start },
              end: opts.patchReturn.all_day
                ? { date: opts.patchReturn.end }
                : { dateTime: opts.patchReturn.end },
              htmlLink: opts.patchReturn.html_link,
              status: opts.patchReturn.status,
              transparency: opts.patchReturn.transparency,
              created: opts.patchReturn.created,
              updated: opts.patchReturn.updated,
            }
          : {},
      });

  const getReturn = opts.getReturn ?? makeEvent();
  const getFn = vi.fn().mockResolvedValue({
    data: {
      id: getReturn.id,
      summary: getReturn.title,
      description: getReturn.description,
      start: getReturn.all_day ? { date: getReturn.start } : { dateTime: getReturn.start },
      end: getReturn.all_day ? { date: getReturn.end } : { dateTime: getReturn.end },
      htmlLink: getReturn.html_link,
      status: getReturn.status,
      transparency: getReturn.transparency,
      created: getReturn.created,
      updated: getReturn.updated,
    },
  });

  return {
    calendarList: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
    },
    events: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      get: getFn,
      insert: vi.fn(),
      patch: patchFn,
      delete: vi.fn(),
    },
  };
}

interface RunUpdateOpts {
  eventId: string;
  title?: string;
  start?: string;
  end?: string;
  duration?: string;
  description?: string;
  busy?: boolean;
  free?: boolean;
  format?: "text" | "json";
  calendar?: string;
  timezone?: string;
  dryRun?: boolean;
  getReturn?: CalendarEvent;
}

function runUpdate(api: GoogleCalendarApi, opts: RunUpdateOpts) {
  const output: string[] = [];
  const stderrOutput: string[] = [];
  const handlerOpts: UpdateHandlerOptions = {
    api,
    eventId: opts.eventId,
    calendarId: opts.calendar ?? "primary",
    calendarName: "Main Calendar",
    format: opts.format ?? "text",
    timezone: opts.timezone ?? "Asia/Tokyo",
    write: (msg: string) => {
      output.push(msg);
    },
    writeStderr: (msg: string) => {
      stderrOutput.push(msg);
    },
    getEvent: async (calendarId, calendarName, eventId, timezone) => {
      const { getEvent } = await import("../lib/api.ts");
      return getEvent(api, calendarId, calendarName, eventId, timezone);
    },
  };
  if (opts.title !== undefined) handlerOpts.title = opts.title;
  if (opts.start !== undefined) handlerOpts.start = opts.start;
  if (opts.end !== undefined) handlerOpts.end = opts.end;
  if (opts.duration !== undefined) handlerOpts.duration = opts.duration;
  if (opts.description !== undefined) handlerOpts.description = opts.description;
  if (opts.busy !== undefined) handlerOpts.busy = opts.busy;
  if (opts.free !== undefined) handlerOpts.free = opts.free;
  if (opts.dryRun !== undefined) handlerOpts.dryRun = opts.dryRun;
  return handleUpdate(handlerOpts).then((result) => ({ ...result, output, stderrOutput }));
}

describe("update command", () => {
  describe("argument validation", () => {
    it("event ID is required as positional argument", () => {
      const cmd = createUpdateCommand();
      cmd.exitOverride();
      expect(() => cmd.parse(["node", "update"])).toThrow();
    });

    it("at least one update option must be provided", async () => {
      const api = makeMockApi();
      const result = await runUpdate(api, { eventId: "evt1" }).catch((e: unknown) => e);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain("at least one");
    });
  });

  describe("--title updates event title only", () => {
    it("sends only summary in patch request", async () => {
      const updatedEvent = makeEvent({ title: "New Title" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, { eventId: "evt1", title: "New Title" });

      expect(api.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
        requestBody: {
          summary: "New Title",
        },
      });
    });
  });

  describe("--start and --end update event times in resolved timezone", () => {
    it("parses start/end in given timezone and sends formatted times", async () => {
      const updatedEvent = makeEvent({
        start: "2026-02-01T14:00:00+09:00",
        end: "2026-02-01T15:00:00+09:00",
      });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-02-01T14:00",
        end: "2026-02-01T15:00",
        timezone: "Asia/Tokyo",
      });

      expect(api.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
        requestBody: {
          start: { dateTime: "2026-02-01T14:00:00+09:00", timeZone: "Asia/Tokyo" },
          end: { dateTime: "2026-02-01T15:00:00+09:00", timeZone: "Asia/Tokyo" },
        },
      });
    });
  });

  describe("--start only preserves existing duration", () => {
    it("fetches existing event, computes new end from existing duration", async () => {
      // Existing event: 10:00-11:00 (1h duration)
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
      });
      const updatedEvent = makeEvent({
        start: "2026-02-01T14:00:00+09:00",
        end: "2026-02-01T15:00:00+09:00",
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-02-01T14:00",
        timezone: "Asia/Tokyo",
      });

      // Should call getEvent to fetch existing
      expect(api.events.get).toHaveBeenCalled();
      // New end = new start (14:00) + existing duration (1h) = 15:00
      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.dateTime).toBe("2026-02-01T14:00:00+09:00");
      expect(patchCall.requestBody.end.dateTime).toBe("2026-02-01T15:00:00+09:00");
    });
  });

  describe("--end only preserves existing start", () => {
    it("keeps existing start, updates end only", async () => {
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
      });
      const updatedEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T12:00:00+09:00",
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      await runUpdate(api, {
        eventId: "evt1",
        end: "2026-02-01T12:00",
        timezone: "Asia/Tokyo",
      });

      expect(api.events.get).toHaveBeenCalled();
      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.dateTime).toBe("2026-02-01T10:00:00+09:00");
      expect(patchCall.requestBody.end.dateTime).toBe("2026-02-01T12:00:00+09:00");
    });
  });

  describe("--duration only preserves existing start", () => {
    it("keeps existing start, computes new end from duration", async () => {
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
      });
      const updatedEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T12:00:00+09:00",
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      await runUpdate(api, {
        eventId: "evt1",
        duration: "2h",
        timezone: "Asia/Tokyo",
      });

      expect(api.events.get).toHaveBeenCalled();
      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.dateTime).toBe("2026-02-01T10:00:00+09:00");
      expect(patchCall.requestBody.end.dateTime).toBe("2026-02-01T12:00:00+09:00");
    });
  });

  describe("--start + --duration computes end", () => {
    it("calculates end = start + duration", async () => {
      const updatedEvent = makeEvent({
        start: "2026-02-01T14:00:00+09:00",
        end: "2026-02-01T14:30:00+09:00",
      });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-02-01T14:00",
        duration: "30m",
        timezone: "Asia/Tokyo",
      });

      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.dateTime).toBe("2026-02-01T14:00:00+09:00");
      expect(patchCall.requestBody.end.dateTime).toBe("2026-02-01T14:30:00+09:00");
    });
  });

  describe("--description updates event description", () => {
    it("sends only description in patch request", async () => {
      const updatedEvent = makeEvent({ description: "New description" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, { eventId: "evt1", description: "New description" });

      expect(api.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
        requestBody: {
          description: "New description",
        },
      });
    });
  });

  describe("--busy / --free updates transparency", () => {
    it("--busy sets transparency to opaque", async () => {
      const updatedEvent = makeEvent({ transparency: "opaque" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, { eventId: "evt1", busy: true });

      expect(api.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
        requestBody: {
          transparency: "opaque",
        },
      });
    });

    it("--free sets transparency to transparent", async () => {
      const updatedEvent = makeEvent({ transparency: "transparent" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, { eventId: "evt1", free: true });

      expect(api.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt1",
        requestBody: {
          transparency: "transparent",
        },
      });
    });
  });

  describe("non-existent event returns NOT_FOUND error", () => {
    it("throws NOT_FOUND for missing event", async () => {
      const notFoundError = Object.assign(new Error("Not Found"), { code: 404 });
      const api = makeMockApi({ patchError: notFoundError });

      const error = await runUpdate(api, {
        eventId: "missing",
        title: "New Title",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error & { code: string }).code).toBe("NOT_FOUND");
    });
  });

  describe("text output shows confirmation with updated event details", () => {
    it("shows updated event in text format", async () => {
      const updatedEvent = makeEvent({ title: "Updated Meeting" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        title: "Updated Meeting",
        format: "text",
      });

      const text = result.output.join("\n");
      expect(text).toContain("Updated Meeting");
      expect(text).toContain("Main Calendar");
    });
  });

  describe("JSON output returns updated event in success envelope", () => {
    it("returns success envelope with event data", async () => {
      const updatedEvent = makeEvent({ title: "Updated Meeting" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        title: "Updated Meeting",
        format: "json",
      });

      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data.event.title).toBe("Updated Meeting");
      expect(json.data.event.id).toBe("evt1");
    });
  });

  describe("exit code", () => {
    it("returns exit code 0 on success", async () => {
      const updatedEvent = makeEvent({ title: "Updated" });
      const api = makeMockApi({ patchReturn: updatedEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        title: "Updated",
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe("--dry-run", () => {
    it("does not call API when dry-run is set", async () => {
      const api = makeMockApi();
      await runUpdate(api, { eventId: "evt123", title: "New Title", dryRun: true });

      expect(api.events.patch).not.toHaveBeenCalled();
    });

    it("outputs preview message in text format with changes list", async () => {
      const api = makeMockApi();
      const result = await runUpdate(api, {
        eventId: "evt123",
        title: "New Title",
        description: "Updated desc",
        busy: true,
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      const text = result.output.join("\n");
      expect(text).toContain('DRY RUN: Would update event "evt123":');
      expect(text).toContain('  title: "New Title"');
      expect(text).toContain('  description: "Updated desc"');
      expect(text).toContain("  transparency: opaque");
    });

    it("outputs start/end in text format when provided", async () => {
      const api = makeMockApi();
      const result = await runUpdate(api, {
        eventId: "evt123",
        start: "2026-02-24T10:00",
        end: "2026-02-24T11:00",
        timezone: "Asia/Tokyo",
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      const text = result.output.join("\n");
      expect(text).toContain('  start: "2026-02-24T10:00:00+09:00"');
      expect(text).toContain('  end: "2026-02-24T11:00:00+09:00"');
    });

    it("outputs dry-run data in JSON format", async () => {
      const api = makeMockApi();
      const result = await runUpdate(api, {
        eventId: "evt123",
        title: "New Title",
        busy: true,
        format: "json",
        dryRun: true,
      });

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.output.join(""));
      expect(json.success).toBe(true);
      expect(json.data).toEqual({
        dry_run: true,
        action: "update",
        event_id: "evt123",
        changes: {
          title: "New Title",
          transparency: "opaque",
        },
      });
    });

    it("includes start/end/timeZone in JSON changes when provided", async () => {
      const api = makeMockApi();
      const result = await runUpdate(api, {
        eventId: "evt123",
        start: "2026-02-24T10:00",
        end: "2026-02-24T11:00",
        timezone: "Asia/Tokyo",
        format: "json",
        dryRun: true,
      });

      const json = JSON.parse(result.output.join(""));
      expect(json.data.changes.start).toBe("2026-02-24T10:00:00+09:00");
      expect(json.data.changes.end).toBe("2026-02-24T11:00:00+09:00");
    });
  });

  describe("all-day event support", () => {
    it("--start with date-only creates all-day event", async () => {
      const existingEvent = makeEvent({
        id: "evt1",
        start: "2026-03-01",
        end: "2026-03-02",
        all_day: true,
      });
      const updatedEvent = makeEvent({
        start: "2026-03-05",
        end: "2026-03-06",
        all_day: true,
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-05",
        timezone: "Asia/Tokyo",
      });

      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.date).toBe("2026-03-05");
      expect(patchCall.requestBody.end.date).toBe("2026-03-06");
    });

    it("--start + --end with date-only uses inclusive end (adds 1 day)", async () => {
      const updatedEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-04",
        all_day: true,
      });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        end: "2026-03-03",
        timezone: "Asia/Tokyo",
      });

      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.date).toBe("2026-03-01");
      // inclusive 03-03 → exclusive 03-04
      expect(patchCall.requestBody.end.date).toBe("2026-03-04");
    });

    it("--start + --duration with day units for all-day event", async () => {
      const updatedEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-03",
        all_day: true,
      });
      const api = makeMockApi({ patchReturn: updatedEvent });

      await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        duration: "2d",
        timezone: "Asia/Tokyo",
      });

      const patchCall = (api.events.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(patchCall.requestBody.start.date).toBe("2026-03-01");
      expect(patchCall.requestBody.end.date).toBe("2026-03-03");
    });

    it("all-day --duration with sub-day units throws error", async () => {
      const existingEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-02",
        all_day: true,
      });
      const api = makeMockApi({ getReturn: existingEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        duration: "2h",
        timezone: "Asia/Tokyo",
      }).catch((e: unknown) => e);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain("day-unit duration");
    });
  });

  describe("start/end type validation", () => {
    it("rejects mismatched types (date-only start with datetime end)", async () => {
      const api = makeMockApi();

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        end: "2026-03-01T12:00",
        timezone: "Asia/Tokyo",
      }).catch((e: unknown) => e);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain("same type");
    });
  });

  describe("type conversion warning", () => {
    it("warns on stderr when changing from timed to all-day (--start only)", async () => {
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
        all_day: false,
      });
      const updatedEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-02",
        all_day: true,
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        timezone: "Asia/Tokyo",
      });

      expect(result.stderrOutput.join("\n")).toContain("Event type changed from timed to all-day");
    });

    it("warns on stderr when changing from all-day to timed (--start only)", async () => {
      const existingEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-02",
        all_day: true,
      });
      const updatedEvent = makeEvent({
        start: "2026-03-01T10:00:00+09:00",
        end: "2026-03-01T11:00:00+09:00",
        all_day: false,
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01T10:00",
        timezone: "Asia/Tokyo",
      });

      expect(result.stderrOutput.join("\n")).toContain("Event type changed from all-day to timed");
    });

    it("no warning when both --start and --end are provided (skips fetch)", async () => {
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
        all_day: false,
      });
      const updatedEvent = makeEvent({
        start: "2026-03-01",
        end: "2026-03-02",
        all_day: true,
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-03-01",
        end: "2026-03-01",
        timezone: "Asia/Tokyo",
      });

      // When both start and end are provided, existing event is not fetched,
      // so type conversion warning is not emitted
      expect(result.stderrOutput).toHaveLength(0);
    });

    it("no warning when type stays the same", async () => {
      const existingEvent = makeEvent({
        start: "2026-02-01T10:00:00+09:00",
        end: "2026-02-01T11:00:00+09:00",
        all_day: false,
      });
      const updatedEvent = makeEvent({
        start: "2026-02-01T14:00:00+09:00",
        end: "2026-02-01T15:00:00+09:00",
        all_day: false,
      });
      const api = makeMockApi({ patchReturn: updatedEvent, getReturn: existingEvent });

      const result = await runUpdate(api, {
        eventId: "evt1",
        start: "2026-02-01T14:00",
        timezone: "Asia/Tokyo",
      });

      expect(result.stderrOutput).toHaveLength(0);
    });
  });

  describe("option conflicts", () => {
    function parseUpdate(args: string[]): { error: string | null } {
      const cmd = createUpdateCommand();
      cmd.exitOverride();
      try {
        cmd.parse(["node", "update", ...args]);
        return { error: null };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    }

    it("rejects --busy and --free together", () => {
      const result = parseUpdate(["evt1", "--busy", "--free"]);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("cannot be used with");
    });

    it("rejects --end and --duration together", () => {
      const result = parseUpdate(["evt1", "-e", "2026-03-01T12:00", "--duration", "1h"]);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("cannot be used with");
    });

    it("accepts event ID with --title", () => {
      const result = parseUpdate(["evt1", "-t", "New Title"]);
      expect(result.error).toBeNull();
    });

    it("accepts --duration option", () => {
      const result = parseUpdate(["evt1", "--duration", "1h"]);
      expect(result.error).toBeNull();
    });
  });

  describe("help text", () => {
    it("includes Examples section in help", () => {
      const cmd = createUpdateCommand();
      let helpOutput = "";
      cmd.configureOutput({ writeOut: (str) => (helpOutput += str) });
      cmd.outputHelp();
      expect(helpOutput).toContain("Examples:");
    });
  });
});
