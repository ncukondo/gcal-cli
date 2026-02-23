import type { ErrorCode, OutputFormat } from "../types/index.ts";

export function formatSuccess(data: unknown, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(data, null, 2);
  }
  return String(data);
}

export function formatError(
  code: number,
  message: string,
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify({ error: { code, message } }, null, 2);
  }
  return `Error: ${message}`;
}

export function formatJsonSuccess(data: unknown): string {
  return JSON.stringify({ success: true, data }, null, 2);
}

export function formatJsonError(code: ErrorCode, message: string): string {
  return JSON.stringify(
    { success: false, error: { code, message } },
    null,
    2,
  );
}
