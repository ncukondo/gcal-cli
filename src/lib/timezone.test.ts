import { describe, it, expect } from "vitest";
import {
  resolveTimezone,
  formatDateTimeInZone,
  parseDateTimeInZone,
} from "./timezone";

describe("resolveTimezone", () => {
  it("returns CLI timezone when provided", () => {
    expect(resolveTimezone("America/New_York", "Asia/Tokyo")).toBe(
      "America/New_York",
    );
  });

  it("falls back to config timezone when CLI is undefined", () => {
    expect(resolveTimezone(undefined, "Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("falls back to system timezone when both CLI and config are undefined", () => {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveTimezone(undefined, undefined)).toBe(systemTz);
  });

  it("throws on invalid timezone string", () => {
    expect(() => resolveTimezone("Invalid/Timezone")).toThrow();
  });

  it("throws on invalid config timezone when CLI is undefined", () => {
    expect(() => resolveTimezone(undefined, "Not/A/Timezone")).toThrow();
  });
});

describe("formatDateTimeInZone", () => {
  it("converts a Date to ISO 8601 string with offset in given timezone", () => {
    // 2026-01-24T01:00:00.000Z (UTC) = 2026-01-24T10:00:00+09:00 (Asia/Tokyo)
    const date = new Date("2026-01-24T01:00:00.000Z");
    expect(formatDateTimeInZone(date, "Asia/Tokyo")).toBe(
      "2026-01-24T10:00:00+09:00",
    );
  });

  it("handles negative UTC offsets", () => {
    // 2026-01-24T15:00:00.000Z (UTC) = 2026-01-24T10:00:00-05:00 (America/New_York, EST)
    const date = new Date("2026-01-24T15:00:00.000Z");
    expect(formatDateTimeInZone(date, "America/New_York")).toBe(
      "2026-01-24T10:00:00-05:00",
    );
  });

  it("handles UTC timezone", () => {
    const date = new Date("2026-01-24T10:00:00.000Z");
    expect(formatDateTimeInZone(date, "UTC")).toBe(
      "2026-01-24T10:00:00+00:00",
    );
  });
});

describe("parseDateTimeInZone", () => {
  it("parses datetime string in the given timezone", () => {
    const result = parseDateTimeInZone("2026-01-24T10:00", "Asia/Tokyo");
    // 2026-01-24T10:00 in Asia/Tokyo = 2026-01-24T01:00:00.000Z
    expect(result.toISOString()).toBe("2026-01-24T01:00:00.000Z");
  });

  it("parses date-only string in the given timezone", () => {
    const result = parseDateTimeInZone("2026-01-24", "Asia/Tokyo");
    // 2026-01-24T00:00 in Asia/Tokyo = 2026-01-23T15:00:00.000Z
    expect(result.toISOString()).toBe("2026-01-23T15:00:00.000Z");
  });

  it("parses datetime in negative offset timezone", () => {
    const result = parseDateTimeInZone("2026-01-24T10:00", "America/New_York");
    // 2026-01-24T10:00 in America/New_York (EST, -05:00) = 2026-01-24T15:00:00.000Z
    expect(result.toISOString()).toBe("2026-01-24T15:00:00.000Z");
  });

  it("parses datetime with seconds", () => {
    const result = parseDateTimeInZone("2026-01-24T10:00:00", "Asia/Tokyo");
    // 2026-01-24T10:00:00 in Asia/Tokyo = 2026-01-24T01:00:00.000Z
    expect(result.toISOString()).toBe("2026-01-24T01:00:00.000Z");
  });

  it("throws on invalid date string", () => {
    expect(() => parseDateTimeInZone("not-a-date", "Asia/Tokyo")).toThrow(
      "Invalid date string: not-a-date",
    );
  });

  it("parses offset-aware ISO string without double-applying timezone", () => {
    // String already has +09:00 offset — should parse directly, not re-interpret in timezone
    const result = parseDateTimeInZone("2026-01-24T10:00:00+09:00", "America/New_York");
    // +09:00 means UTC is 2026-01-24T01:00:00.000Z regardless of the timezone parameter
    expect(result.toISOString()).toBe("2026-01-24T01:00:00.000Z");
  });

  it("parses Z-terminated ISO string without double-applying timezone", () => {
    // String with Z suffix — should parse directly as UTC
    const result = parseDateTimeInZone("2026-01-24T10:00:00Z", "Asia/Tokyo");
    expect(result.toISOString()).toBe("2026-01-24T10:00:00.000Z");
  });
});
