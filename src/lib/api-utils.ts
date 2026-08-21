import { ApiError } from "./api.ts";

export const MAX_PAGES = 100;

/** Per-error detail Google puts on `error.errors` (also mirrored in the response body). */
interface GoogleApiErrorDetail {
  domain?: string;
  reason?: string;
  message?: string;
}

export function isGoogleApiError(
  error: unknown,
): error is Error & { code: number; errors?: GoogleApiErrorDetail[] } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  );
}

/**
 * 403 reasons that re-authenticating cannot fix. Only reasons observed on the real
 * API belong here; an unknown reason falls back to AUTH_REQUIRED, which at worst
 * wastes a re-auth instead of hiding a genuine auth problem.
 */
const FORBIDDEN_REASONS: readonly string[] = ["requiredAccessLevel", "forbiddenForNonOrganizer"];

const FORBIDDEN_HINT = "You may not have permission to change this event; only its organizer can.";

export function mapApiError(error: unknown): never {
  if (isGoogleApiError(error)) {
    const reason = error.errors?.[0]?.reason;
    if (error.code === 403 && reason !== undefined && FORBIDDEN_REASONS.includes(reason)) {
      throw new ApiError("FORBIDDEN", `${error.message} ${FORBIDDEN_HINT}`);
    }
    if (error.code === 401 || error.code === 403) {
      throw new ApiError("AUTH_REQUIRED", error.message);
    }
    if (error.code === 404) {
      throw new ApiError("NOT_FOUND", error.message);
    }
    throw new ApiError("API_ERROR", error.message);
  }
  throw error;
}
