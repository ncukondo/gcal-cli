import { describe, expect, it } from "vitest";
import type { GoogleEvent } from "./api.ts";
import {
  buildSplitSeriesBody,
  continueRecurrence,
  planSplit,
  splitSeriesId,
  truncateRecurrence,
} from "./recurring-split.ts";

describe("splitSeriesId", () => {
  it("names a timed split the way the web UI does: UTC start without Z", () => {
    expect(
      splitSeriesId("g4uit10730vudri44ds0nofis0", { dateTime: "2026-10-23T10:00:00+09:00" }),
    ).toBe("g4uit10730vudri44ds0nofis0_R20261023T010000");
  });

  it("names an all-day split by its date", () => {
    expect(splitSeriesId("opram52gebhe394g6dbfidm6t8", { date: "2026-10-23" })).toBe(
      "opram52gebhe394g6dbfidm6t8_R20261023",
    );
  });

  it("splits a series that was itself split off under the original base", () => {
    expect(splitSeriesId("abc_R20261023T010000", { dateTime: "2026-10-30T10:00:00+09:00" })).toBe(
      "abc_R20261030T010000",
    );
    expect(splitSeriesId("abc_R20261023", { date: "2026-10-30" })).toBe("abc_R20261030");
  });
});

describe("truncateRecurrence", () => {
  const splitAt = { dateTime: "2026-10-23T10:00:00+09:00" };

  it("ends a counted series just before the split", () => {
    expect(truncateRecurrence(["RRULE:FREQ=DAILY;COUNT=10"], splitAt)).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261023T005959Z",
    ]);
  });

  it("moves an UNTIL earlier, keeping the other rule parts in place", () => {
    expect(
      truncateRecurrence(["RRULE:FREQ=WEEKLY;UNTIL=20261231T145959Z;BYDAY=MO,FR"], splitAt),
    ).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261023T005959Z"]);
  });

  it("ends an open-ended series", () => {
    expect(truncateRecurrence(["RRULE:FREQ=MONTHLY;BYDAY=2TH"], splitAt)).toEqual([
      "RRULE:FREQ=MONTHLY;BYDAY=2TH;UNTIL=20261023T005959Z",
    ]);
  });

  it("ends an all-day series on the day before the split", () => {
    expect(truncateRecurrence(["RRULE:FREQ=DAILY;COUNT=10"], { date: "2026-11-01" })).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261031",
    ]);
  });

  it("leaves EXDATE and RDATE lines alone", () => {
    expect(
      truncateRecurrence(
        ["EXDATE;TZID=Asia/Tokyo:20261020T100000", "RRULE:FREQ=DAILY;COUNT=10"],
        splitAt,
      ),
    ).toEqual([
      "EXDATE;TZID=Asia/Tokyo:20261020T100000",
      "RRULE:FREQ=DAILY;UNTIL=20261023T005959Z",
    ]);
  });
});

describe("continueRecurrence", () => {
  it("counts only the occurrences left after the split", () => {
    expect(continueRecurrence(["RRULE:FREQ=DAILY;COUNT=10"], 4)).toEqual([
      "RRULE:FREQ=DAILY;COUNT=6",
    ]);
  });

  it("keeps an UNTIL and an open-ended rule as they are", () => {
    expect(continueRecurrence(["RRULE:FREQ=DAILY;UNTIL=20261028T145959Z"], 4)).toEqual([
      "RRULE:FREQ=DAILY;UNTIL=20261028T145959Z",
    ]);
    expect(continueRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=MO"], 4)).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
    ]);
  });

  it("keeps EXDATE and RDATE lines", () => {
    expect(
      continueRecurrence(["RRULE:FREQ=DAILY;COUNT=10", "EXDATE;VALUE=DATE:20261025"], 4),
    ).toEqual(["RRULE:FREQ=DAILY;COUNT=6", "EXDATE;VALUE=DATE:20261025"]);
  });
});

const SERIES = "s";

function seriesMaster(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: SERIES,
    iCalUID: `${SERIES}@google.com`,
    etag: '"1"',
    htmlLink: "https://calendar.google.com/event?eid=x",
    created: "2026-10-01T00:00:00Z",
    updated: "2026-10-01T00:00:00Z",
    sequence: 2,
    organizer: { email: "me@example.com", self: true },
    creator: { email: "me@example.com", self: true },
    summary: "Daily",
    location: "Room 1",
    start: { dateTime: "2026-10-19T10:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-10-19T10:30:00+09:00", timeZone: "Asia/Tokyo" },
    recurrence: ["RRULE:FREQ=DAILY;COUNT=10"],
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 5 }] },
    ...overrides,
  } as GoogleEvent;
}

function occurrence(day: number, overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  const start = `2026-10-${day}T10:00:00+09:00`;
  return {
    id: `${SERIES}_202610${day}T010000Z`,
    status: "confirmed",
    summary: "Daily",
    start: { dateTime: start },
    end: { dateTime: `2026-10-${day}T10:30:00+09:00` },
    originalStartTime: { dateTime: start },
    recurringEventId: SERIES,
    ...overrides,
  };
}

const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => occurrence(from + i));

describe("planSplit", () => {
  it("splits at the occurrence's original start and counts what comes before", () => {
    const instances = days(19, 28);
    const plan = planSplit(seriesMaster(), instances, occurrence(23));

    expect(plan.splitAt).toEqual({ dateTime: "2026-10-23T10:00:00+09:00" });
    expect(plan.newSeriesId).toBe("s_R20261023T010000");
    expect(plan.occurrencesBefore).toBe(4);
    expect(plan.truncated).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261023T005959Z"]);
    expect(plan.continued).toEqual(["RRULE:FREQ=DAILY;COUNT=6"]);
    expect(plan.following.map((i) => i.id)).toEqual(instances.slice(4).map((i) => i.id));
    expect(plan.deleted).toEqual([]);
  });

  it("splits at where the rule put a moved occurrence, not where it was moved", () => {
    const moved = occurrence(23, { start: { dateTime: "2026-10-23T15:00:00+09:00" } });
    const plan = planSplit(seriesMaster(), days(19, 28), moved);
    expect(plan.newSeriesId).toBe("s_R20261023T010000");
  });

  it("counts deleted occurrences before the split, as COUNT does", () => {
    const instances = days(19, 28);
    instances[1] = occurrence(20, { status: "cancelled" });
    const plan = planSplit(seriesMaster(), instances, occurrence(23));
    expect(plan.occurrencesBefore).toBe(4);
    expect(plan.continued).toEqual(["RRULE:FREQ=DAILY;COUNT=6"]);
  });

  it("keeps deleted occurrences after the split apart from the ones to carry over", () => {
    const instances = days(19, 28);
    instances[6] = occurrence(25, { status: "cancelled" });
    const plan = planSplit(seriesMaster(), instances, occurrence(23));
    expect(plan.deleted.map((i) => i.id)).toEqual(["s_20261025T010000Z"]);
    expect(plan.following.map((i) => i.id)).not.toContain("s_20261025T010000Z");
  });

  it("knows when the split is at the first occurrence", () => {
    expect(planSplit(seriesMaster(), days(19, 28), occurrence(19)).occurrencesBefore).toBe(0);
  });

  it("handles an all-day series", () => {
    const allDay = (day: number): GoogleEvent => ({
      id: `${SERIES}_202610${day}`,
      status: "confirmed",
      start: { date: `2026-10-${day}` },
      end: { date: `2026-10-${day + 1}` },
      originalStartTime: { date: `2026-10-${day}` },
    });
    const master = seriesMaster({
      start: { date: "2026-10-19" },
      end: { date: "2026-10-20" },
    });
    const plan = planSplit(master, [19, 20, 21, 22, 23, 24].map(allDay), allDay(23));
    expect(plan.newSeriesId).toBe("s_R20261023");
    expect(plan.truncated).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261022"]);
    expect(plan.continued).toEqual(["RRULE:FREQ=DAILY;COUNT=6"]);
  });
});

describe("buildSplitSeriesBody", () => {
  it("copies the master from the split onwards, dropping what the server owns", () => {
    const plan = planSplit(seriesMaster(), days(19, 28), occurrence(23));
    const body = buildSplitSeriesBody(seriesMaster(), plan);

    expect(body).toEqual({
      iCalUID: "s_R20261023T010000@google.com",
      summary: "Daily",
      location: "Room 1",
      start: { dateTime: "2026-10-23T01:00:00.000Z", timeZone: "Asia/Tokyo" },
      end: { dateTime: "2026-10-23T01:30:00.000Z", timeZone: "Asia/Tokyo" },
      recurrence: ["RRULE:FREQ=DAILY;COUNT=6"],
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 5 }] },
    });
  });

  it("carries the conference over without asking for a new one", () => {
    const conferenceData = {
      conferenceId: "abc-defg-hij",
      conferenceSolution: { key: { type: "hangoutsMeet" } },
      entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      createRequest: { requestId: "old", status: { statusCode: "success" } },
    };
    const master = seriesMaster({ conferenceData, hangoutLink: "https://meet.google.com/x" });
    const plan = planSplit(master, days(19, 28), occurrence(23));
    const body = buildSplitSeriesBody(master, plan);

    expect(body.conferenceData).toEqual({
      conferenceId: "abc-defg-hij",
      conferenceSolution: { key: { type: "hangoutsMeet" } },
      entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
    });
    expect(body).not.toHaveProperty("hangoutLink");
  });

  it("keeps an all-day master's length in days", () => {
    const master = seriesMaster({ start: { date: "2026-10-19" }, end: { date: "2026-10-21" } });
    const target: GoogleEvent = {
      id: "s_20261023",
      start: { date: "2026-10-23" },
      end: { date: "2026-10-25" },
      originalStartTime: { date: "2026-10-23" },
    };
    const body = buildSplitSeriesBody(master, planSplit(master, [target], target));
    expect(body.start).toEqual({ date: "2026-10-23" });
    expect(body.end).toEqual({ date: "2026-10-25" });
  });
});
