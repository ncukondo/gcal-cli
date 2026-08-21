import { ApiError } from "./api.ts";

export const MAX_PAGES = 100;

/** Per-error detail Google puts on `error.errors` (also mirrored in the response body). */
interface GoogleApiErrorDetail {
  domain?: string;
  reason?: string;
  message?: string;
}

export function isGoogleApiError(error: unknown): error is Error & {
  code: number;
  errors?: GoogleApiErrorDetail[];
  response?: { data?: { error?: { errors?: GoogleApiErrorDetail[] } } };
} {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  );
}

/**
 * The 403 reasons observed on the real API that re-authenticating cannot fix,
 * each with what the user can actually do about it. Nothing outside this map is
 * routed to FORBIDDEN: an unrecognised reason falls back to AUTH_REQUIRED, which
 * at worst wastes a re-auth instead of hiding a genuine auth problem. Add a
 * reason only after seeing it come back from the real API.
 */
const FORBIDDEN_HINTS: Readonly<Record<string, string>> = {
  requiredAccessLevel: "Re-authenticating will not help; you need write access here.",
  forbiddenForNonOrganizer:
    "Re-authenticating will not help; only the organizer can change this event.",
};

/** The hint for the first detail naming a reason we route, or undefined. */
function forbiddenHint(details: GoogleApiErrorDetail[] | undefined): string | undefined {
  for (const detail of details ?? []) {
    const hint = detail.reason === undefined ? undefined : FORBIDDEN_HINTS[detail.reason];
    if (hint !== undefined) {
      return hint;
    }
  }
  return undefined;
}

export function mapApiError(error: unknown): never {
  if (isGoogleApiError(error)) {
    if (error.code === 403) {
      // Both carry the same array in the pinned googleapis version; read either.
      const hint = forbiddenHint(error.errors ?? error.response?.data?.error?.errors);
      if (hint !== undefined) {
        throw new ApiError("FORBIDDEN", `${error.message} ${hint}`);
      }
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
