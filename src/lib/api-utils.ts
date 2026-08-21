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

/**
 * Google's error guide recommends exponential backoff and mentions no Retry-After
 * header, so do not promise the caller one.
 */
const RATE_LIMIT_HINT = "This is temporary; wait and retry with exponential backoff.";

/**
 * The 403 reasons Google's error guide documents as a limit being exhausted. This
 * is a temporary state rather than a permission or an authentication problem, and
 * the only useful action is to wait: re-authenticating spends another request
 * without clearing it. Shaped like FORBIDDEN_HINTS so the routed reasons are
 * derived from the same map that holds their wording, and so a reason can be
 * given its own wording later. Only reasons confirmed in that guide belong here.
 */
const RATE_LIMIT_HINTS: Readonly<Record<string, string>> = {
  rateLimitExceeded: RATE_LIMIT_HINT,
  userRateLimitExceeded: RATE_LIMIT_HINT,
  quotaExceeded: RATE_LIMIT_HINT,
};

/** The hint for the first detail naming a reason `hints` routes, or undefined. */
function hintFor(
  details: GoogleApiErrorDetail[] | undefined,
  hints: Readonly<Record<string, string>>,
): string | undefined {
  for (const detail of details ?? []) {
    const hint = detail.reason === undefined ? undefined : hints[detail.reason];
    if (hint !== undefined) {
      return hint;
    }
  }
  return undefined;
}

export function mapApiError(error: unknown): never {
  if (isGoogleApiError(error)) {
    // Status alone, deliberately: a status code is sturdier than a reason string
    // and still decides the case when no reason is readable. Google documents the
    // 429 as functionally similar to the 403 rate-limit reasons.
    if (error.code === 429) {
      throw new ApiError("RATE_LIMITED", `${error.message} ${RATE_LIMIT_HINT}`);
    }
    if (error.code === 403) {
      // Both carry the same array in the pinned googleapis version; read either.
      const details = error.errors ?? error.response?.data?.error?.errors;
      // Permission first: a 403 naming a permission reason is about access, even
      // if some other detail also mentions a limit.
      const forbidden = hintFor(details, FORBIDDEN_HINTS);
      if (forbidden !== undefined) {
        throw new ApiError("FORBIDDEN", `${error.message} ${forbidden}`);
      }
      const rateLimited = hintFor(details, RATE_LIMIT_HINTS);
      if (rateLimited !== undefined) {
        throw new ApiError("RATE_LIMITED", `${error.message} ${rateLimited}`);
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
