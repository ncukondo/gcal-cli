import { describe, expect, it } from "vitest";
import { parseAttendees, parseNotify } from "./attendees.ts";

describe("parseAttendees", () => {
  it("maps email addresses to attendee inputs", () => {
    expect(parseAttendees(["alice@example.com", "bob@example.com"])).toEqual([
      { email: "alice@example.com" },
      { email: "bob@example.com" },
    ]);
  });

  it("returns an empty array for no input", () => {
    expect(parseAttendees([])).toEqual([]);
  });

  it("trims surrounding whitespace", () => {
    expect(parseAttendees(["  alice@example.com  "])).toEqual([{ email: "alice@example.com" }]);
  });

  it("de-duplicates repeated addresses, keeping the first occurrence", () => {
    expect(parseAttendees(["alice@example.com", "bob@example.com", "alice@example.com"])).toEqual([
      { email: "alice@example.com" },
      { email: "bob@example.com" },
    ]);
  });

  it("de-duplicates case-insensitively but preserves the original casing", () => {
    expect(parseAttendees(["Alice@Example.com", "alice@example.com"])).toEqual([
      { email: "Alice@Example.com" },
    ]);
  });

  it("rejects a value without an @", () => {
    expect(() => parseAttendees(["not-an-email"])).toThrow(/not-an-email/);
  });

  it("rejects an empty value", () => {
    expect(() => parseAttendees([""])).toThrow(/empty/i);
  });
});

describe("parseNotify", () => {
  it("defaults to none when not specified", () => {
    expect(parseNotify(undefined)).toBe("none");
  });

  it("maps all to the API value", () => {
    expect(parseNotify("all")).toBe("all");
  });

  it("maps external to externalOnly", () => {
    expect(parseNotify("external")).toBe("externalOnly");
  });

  it("maps none to none", () => {
    expect(parseNotify("none")).toBe("none");
  });

  it("rejects an unknown value", () => {
    expect(() => parseNotify("everyone")).toThrow(/everyone/);
  });
});
