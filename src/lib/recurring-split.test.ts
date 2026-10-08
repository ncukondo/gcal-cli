import { describe, expect, it } from "vitest";
import { continueRecurrence, splitSeriesId, truncateRecurrence } from "./recurring-split.ts";

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
