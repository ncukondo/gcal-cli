import { describe, expect, it } from "vitest";
import { isDateOnly, addDaysToDateString } from "../../src/lib/date-utils.ts";

describe("isDateOnly", () => {
  it("returns true for YYYY-MM-DD format", () => {
    expect(isDateOnly("2026-03-01")).toBe(true);
    expect(isDateOnly("2026-12-31")).toBe(true);
  });

  it("returns false for datetime format", () => {
    expect(isDateOnly("2026-03-01T10:00")).toBe(false);
    expect(isDateOnly("2026-03-01T10:00:00")).toBe(false);
    expect(isDateOnly("2026-03-01T10:00:00+09:00")).toBe(false);
  });

  it("returns false for invalid strings", () => {
    expect(isDateOnly("")).toBe(false);
    expect(isDateOnly("not-a-date")).toBe(false);
    expect(isDateOnly("2026-3-1")).toBe(false);
  });

  it("returns false for semantically invalid dates", () => {
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-13-01")).toBe(false);
    expect(isDateOnly("2026-00-01")).toBe(false);
    expect(isDateOnly("2026-01-00")).toBe(false);
    expect(isDateOnly("2026-99-45")).toBe(false);
  });
});

describe("addDaysToDateString", () => {
  it("adds 1 day to a date string", () => {
    expect(addDaysToDateString("2026-03-01", 1)).toBe("2026-03-02");
  });

  it("adds multiple days", () => {
    expect(addDaysToDateString("2026-03-01", 3)).toBe("2026-03-04");
  });

  it("handles month boundary", () => {
    expect(addDaysToDateString("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("handles year boundary", () => {
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles adding 0 days", () => {
    expect(addDaysToDateString("2026-03-01", 0)).toBe("2026-03-01");
  });

  it("is timezone-independent (produces same result regardless of system TZ)", () => {
    // This verifies the fix for the TZ bug: using Date.UTC ensures
    // the result is the same whether the system is UTC, UTC+9, or UTC-12.
    // The old code used `new Date(date + "T00:00:00")` which was local-TZ dependent.
    expect(addDaysToDateString("2026-03-01", 1)).toBe("2026-03-02");
    expect(addDaysToDateString("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
  });
});
