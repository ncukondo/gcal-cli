import { describe, expect, it } from "vitest";
import { todayInZone } from "./date-utils.ts";

describe("todayInZone", () => {
  it("returns the calendar date of `now` in the given timezone", () => {
    const now = new Date("2026-03-25T12:00:00Z");
    expect(todayInZone(now, "UTC")).toBe("2026-03-25");
  });

  it("rolls over to the next day when the zone is ahead of UTC", () => {
    const now = new Date("2026-03-25T23:30:00Z");
    expect(todayInZone(now, "Asia/Tokyo")).toBe("2026-03-26");
    expect(todayInZone(now, "UTC")).toBe("2026-03-25");
  });

  it("stays on the previous day when the zone is behind UTC", () => {
    const now = new Date("2026-03-26T02:00:00Z");
    expect(todayInZone(now, "America/New_York")).toBe("2026-03-25");
  });
});
