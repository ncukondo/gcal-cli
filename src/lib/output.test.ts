import { describe, expect, it } from "vitest";
import { formatError, formatSuccess } from "./output.ts";

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
