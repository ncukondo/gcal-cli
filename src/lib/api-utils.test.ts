import { describe, it, expect } from "vitest";
import { isGoogleApiError, mapApiError } from "./api-utils.ts";
import { ApiError } from "./api.ts";

/**
 * Shape captured from the live API on 2026-08-21: `events.insert` against a
 * read-only subscribed calendar. `reason` is readable straight off `e.errors`.
 */
function makeApiError(
  code: number,
  message: string,
  reason?: string,
): Error & { code: number; errors?: { domain?: string; reason?: string; message?: string }[] } {
  const error = Object.assign(new Error(message), { code });
  if (reason === undefined) {
    return error;
  }
  return Object.assign(error, { errors: [{ domain: "calendar", reason, message }] });
}

describe("isGoogleApiError", () => {
  it("accepts an Error carrying a numeric code", () => {
    expect(isGoogleApiError(makeApiError(403, "Forbidden"))).toBe(true);
  });

  it("rejects a plain Error and a non-Error value", () => {
    expect(isGoogleApiError(new Error("boom"))).toBe(false);
    expect(isGoogleApiError({ code: 403 })).toBe(false);
  });
});

describe("mapApiError", () => {
  function mapped(error: unknown): ApiError {
    try {
      mapApiError(error);
    } catch (e: unknown) {
      return e as ApiError;
    }
    throw new Error("mapApiError did not throw");
  }

  it("maps 401 to AUTH_REQUIRED", () => {
    const error = mapped(makeApiError(401, "Invalid Credentials", "authError"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.message).toBe("Invalid Credentials");
  });

  // An expired token must never be reported as a permission problem: that would
  // tell the caller not to re-authenticate, the inverse of the right answer.
  it("maps 401 to AUTH_REQUIRED even when it carries a permission reason", () => {
    const error = mapped(makeApiError(401, "Invalid Credentials", "requiredAccessLevel"));
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.message).toBe("Invalid Credentials");
  });

  it("maps 403 requiredAccessLevel to FORBIDDEN, keeping the API message", () => {
    const error = mapped(
      makeApiError(403, "You need to have writer access to this calendar.", "requiredAccessLevel"),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toContain("You need to have writer access to this calendar.");
    expect(error.message).toContain("may not have permission");
  });

  it("maps 403 forbiddenForNonOrganizer to FORBIDDEN", () => {
    const error = mapped(
      makeApiError(403, "Forbidden for non organizer", "forbiddenForNonOrganizer"),
    );
    expect(error.code).toBe("FORBIDDEN");
  });

  it("keeps 403 insufficientPermissions on AUTH_REQUIRED (re-auth does fix it)", () => {
    const error = mapped(makeApiError(403, "Insufficient Permission", "insufficientPermissions"));
    expect(error.code).toBe("AUTH_REQUIRED");
    expect(error.message).toBe("Insufficient Permission");
  });

  it("falls back to AUTH_REQUIRED for an unknown 403 reason", () => {
    const error = mapped(makeApiError(403, "Forbidden", "someReasonWeHaveNeverSeen"));
    expect(error.code).toBe("AUTH_REQUIRED");
  });

  it("falls back to AUTH_REQUIRED when the 403 carries no reason", () => {
    const error = mapped(makeApiError(403, "Forbidden"));
    expect(error.code).toBe("AUTH_REQUIRED");
  });

  it("maps 404 to NOT_FOUND", () => {
    expect(mapped(makeApiError(404, "Not Found")).code).toBe("NOT_FOUND");
  });

  it("maps other HTTP errors to API_ERROR", () => {
    expect(mapped(makeApiError(500, "Backend Error")).code).toBe("API_ERROR");
  });

  it("rethrows values that are not Google API errors", () => {
    const original = new Error("boom");
    expect(mapped(original)).toBe(original);
  });
});
