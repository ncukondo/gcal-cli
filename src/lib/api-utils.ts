import { ApiError } from "./api.ts";

export const MAX_PAGES = 100;

export function isGoogleApiError(error: unknown): error is Error & { code: number } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  );
}

export function mapApiError(error: unknown): never {
  if (isGoogleApiError(error)) {
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
