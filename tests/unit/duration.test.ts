import { describe, expect, it } from "vitest";
import { parseDuration } from "../../src/lib/duration.ts";

describe("parseDuration", () => {
  it("parses minutes only", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
  });

  it("parses hours only", () => {
    expect(parseDuration("1h")).toBe(60 * 60 * 1000);
    expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
  });

  it("parses days only", () => {
    expect(parseDuration("2d")).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("parses combined hours and minutes", () => {
    expect(parseDuration("1h30m")).toBe(90 * 60 * 1000);
  });

  it("parses combined days and hours", () => {
    expect(parseDuration("1d12h")).toBe(36 * 60 * 60 * 1000);
  });

  it("throws on empty string", () => {
    expect(() => parseDuration("")).toThrow("Invalid duration");
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration");
  });

  it("throws on zero duration", () => {
    expect(() => parseDuration("0m")).toThrow("Duration must be greater than zero");
  });

  it("throws on negative numbers", () => {
    expect(() => parseDuration("-1h")).toThrow("Invalid duration");
  });
});
