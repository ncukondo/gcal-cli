import { describe, expect, it } from "vitest";
import type { GoogleEvent } from "./api.ts";
import {
  buildRestoreBody,
  findOverriddenInstances,
  isRecurringMaster,
} from "./recurring-exceptions.ts";

function master(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "series",
    summary: "Weekly sync",
    description: "Series agenda",
    start: { dateTime: "2026-08-06T20:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-08-06T21:00:00+09:00", timeZone: "Asia/Tokyo" },
    transparency: "opaque",
    recurrence: ["RRULE:FREQ=WEEKLY;COUNT=4"],
    attendees: [{ email: "alice@example.com", responseStatus: "accepted" }],
    ...overrides,
  };
}

/** An unmodified occurrence: the master's values at the given original start. */
function instance(day: string, overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  const start = `2026-08-${day}T20:00:00+09:00`;
  return {
    id: `series_202608${day}T110000Z`,
    summary: "Weekly sync",
    description: "Series agenda",
    start: { dateTime: start, timeZone: "Asia/Tokyo" },
    end: { dateTime: `2026-08-${day}T21:00:00+09:00`, timeZone: "Asia/Tokyo" },
    originalStartTime: { dateTime: start, timeZone: "Asia/Tokyo" },
    recurringEventId: "series",
    transparency: "opaque",
    attendees: [{ email: "alice@example.com", responseStatus: "accepted" }],
    ...overrides,
  };
}

describe("isRecurringMaster", () => {
  it("is true only for an event that carries a recurrence rule", () => {
    expect(isRecurringMaster(master())).toBe(true);
    expect(isRecurringMaster(master({ recurrence: null }))).toBe(false);
    expect(isRecurringMaster(master({ recurrence: [] }))).toBe(false);
    expect(isRecurringMaster(instance("13"))).toBe(false);
  });
});

describe("findOverriddenInstances", () => {
  it("returns nothing when no occurrence differs in the fields being changed", () => {
    const instances = [instance("06"), instance("13"), instance("20")];
    expect(findOverriddenInstances(master(), instances, ["description"])).toEqual([]);
  });

  it("finds occurrences whose description differs from the series", () => {
    const instances = [
      instance("06"),
      instance("13", { description: "Only on the 13th" }),
      instance("20"),
    ];
    const found = findOverriddenInstances(master(), instances, ["description"]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "series_20260813T110000Z",
      start: "2026-08-13T20:00:00+09:00",
      original_start: "2026-08-13T20:00:00+09:00",
      fields: ["description"],
    });
  });

  it("ignores overrides in fields the update does not touch", () => {
    const instances = [instance("13", { summary: "Renamed once" })];
    expect(findOverriddenInstances(master(), instances, ["description"])).toEqual([]);
    expect(findOverriddenInstances(master(), instances, ["title"])).toHaveLength(1);
  });

  it("treats a missing description and an empty one as the same", () => {
    const instances = [instance("13", { description: "" })];
    expect(
      findOverriddenInstances(master({ description: null }), instances, ["description"]),
    ).toEqual([]);
  });

  it("compares transparency with the API default applied", () => {
    const instances = [instance("13", { transparency: null })];
    expect(findOverriddenInstances(master(), instances, ["transparency"])).toEqual([]);
    const free = [instance("13", { transparency: "transparent" })];
    expect(findOverriddenInstances(master(), free, ["transparency"])).toHaveLength(1);
  });

  it("compares guest lists by address, ignoring order, case and RSVPs", () => {
    const series = master({
      attendees: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
    });
    const same = instance("13", {
      attendees: [
        { email: "BOB@example.com", responseStatus: "declined" },
        { email: "alice@example.com" },
      ],
    });
    const extra = instance("20", {
      attendees: [
        { email: "alice@example.com" },
        { email: "bob@example.com" },
        { email: "carol@example.com" },
      ],
    });
    const found = findOverriddenInstances(series, [same, extra], ["attendees"]);
    expect(found.map((f) => f.id)).toEqual(["series_20260820T110000Z"]);
  });

  it("compares the attached conference", () => {
    const series = master({ hangoutLink: "https://meet.google.com/aaa-aaaa-aaa" });
    const own = instance("13", { hangoutLink: "https://meet.google.com/bbb-bbbb-bbb" });
    const found = findOverriddenInstances(series, [own], ["conference"]);
    expect(found[0]?.fields).toEqual(["conference"]);
  });

  it("on a time change, reports every modified occurrence, moved ones included", () => {
    const instances = [
      instance("06"),
      instance("13", { description: "Only on the 13th" }),
      instance("20", {
        start: { dateTime: "2026-08-20T22:00:00+09:00" },
        end: { dateTime: "2026-08-20T23:00:00+09:00" },
      }),
      instance("27", { location: "Room B" }),
    ];
    const found = findOverriddenInstances(master(), instances, ["time"]);
    expect(found.map((f) => [f.id, f.fields])).toEqual([
      ["series_20260813T110000Z", ["description"]],
      ["series_20260820T110000Z", ["time"]],
      ["series_20260827T110000Z", ["location"]],
    ]);
  });

  it("detects a changed duration as a moved occurrence", () => {
    const longer = instance("13", { end: { dateTime: "2026-08-13T22:00:00+09:00" } });
    expect(findOverriddenInstances(master(), [longer], ["time"])[0]?.fields).toEqual(["time"]);
  });

  it("compares start times as instants, not strings", () => {
    const utc = instance("13", {
      start: { dateTime: "2026-08-13T11:00:00Z" },
      end: { dateTime: "2026-08-13T12:00:00Z" },
    });
    expect(findOverriddenInstances(master(), [utc], ["time"])).toEqual([]);
  });

  it("skips cancelled occurrences", () => {
    const gone = instance("13", { status: "cancelled", description: "x" });
    expect(findOverriddenInstances(master(), [gone], ["description"])).toEqual([]);
  });
});

describe("buildRestoreBody", () => {
  it("writes back the occurrence's own values for the overridden fields only", () => {
    const own = instance("13", {
      summary: "Special session",
      description: "Only on the 13th",
      transparency: "transparent",
      attendees: [{ email: "carol@example.com", comment: "kept as-is" }],
    });
    expect(buildRestoreBody(own, ["description"])).toEqual({ description: "Only on the 13th" });
    expect(buildRestoreBody(own, ["title", "transparency", "attendees"])).toEqual({
      summary: "Special session",
      transparency: "transparent",
      attendees: [{ email: "carol@example.com", comment: "kept as-is" }],
    });
  });

  it("restores an absent description as cleared", () => {
    expect(buildRestoreBody(instance("13", { description: null }), ["description"])).toEqual({
      description: null,
    });
  });

  it("writes back the location and the moved time", () => {
    const own = instance("13", {
      location: "Room 2",
      start: { dateTime: "2026-08-13T15:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2026-08-13T15:30:00+09:00", timeZone: "Asia/Tokyo" },
    });
    expect(buildRestoreBody(own, ["location", "time"])).toEqual({
      location: "Room 2",
      start: { dateTime: "2026-08-13T15:00:00+09:00", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2026-08-13T15:30:00+09:00", timeZone: "Asia/Tokyo" },
    });
  });

  it("writes back an all-day occurrence's dates", () => {
    const own = instance("13", {
      start: { date: "2026-08-14" },
      end: { date: "2026-08-15" },
    });
    expect(buildRestoreBody(own, ["time"])).toEqual({
      start: { date: "2026-08-14" },
      end: { date: "2026-08-15" },
    });
  });
});
