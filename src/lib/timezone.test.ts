import { describe, it, expect } from "vitest";
import { resolveTimezone } from "./timezone";

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
