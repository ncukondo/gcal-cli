import { describe, expect, it } from "vitest";
import {
  formatJsonSuccess,
  formatJsonError,
  formatError,
  formatSuccess,
} from "./output.ts";

describe("formatSuccess", () => {
  it("returns JSON string for json format", () => {
    const result = formatSuccess({ key: "value" }, "json");
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("returns string representation for text format", () => {
    const result = formatSuccess("hello", "text");
    expect(result).toBe("hello");
  });
});

describe("formatError", () => {
  it("returns JSON error for json format", () => {
    const result = formatError(1, "something failed", "json");
    expect(JSON.parse(result)).toEqual({
      error: { code: 1, message: "something failed" },
    });
  });

  it("returns text error for text format", () => {
    const result = formatError(1, "something failed", "text");
    expect(result).toBe("Error: something failed");
  });
});

describe("formatJsonSuccess", () => {
  it("wraps data in success envelope", () => {
    const data = { events: [], count: 0 };
    const result = formatJsonSuccess(data);
    expect(JSON.parse(result)).toEqual({
      success: true,
      data: { events: [], count: 0 },
    });
  });

  it("preserves nested data structures", () => {
    const data = { event: { id: "abc", title: "Test" }, message: "Created" };
    const result = formatJsonSuccess(data);
    expect(JSON.parse(result)).toEqual({
      success: true,
      data: { event: { id: "abc", title: "Test" }, message: "Created" },
    });
  });
});

describe("formatJsonError", () => {
  it("wraps error in failure envelope with code and message", () => {
    const result = formatJsonError("AUTH_REQUIRED", "Not authenticated");
    expect(JSON.parse(result)).toEqual({
      success: false,
      error: { code: "AUTH_REQUIRED", message: "Not authenticated" },
    });
  });

  it("supports all error codes", () => {
    const result = formatJsonError("NOT_FOUND", "Event not found");
    expect(JSON.parse(result)).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Event not found" },
    });
  });
});
