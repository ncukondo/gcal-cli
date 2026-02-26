import { describe, expect, it } from "vitest";
import { isDateOnly } from "../../src/lib/date-utils.ts";

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
});
