import { describe, it, expect } from "vitest";
import { runCli, runCliJson, hasCredentials } from "./helpers.ts";

const creds = hasCredentials();

describe.runIf(creds)("E2E: auth", () => {
  it("auth --status returns authenticated state", async () => {
    const result = await runCli("auth", "--status");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Authenticated as:");
  });

  it("auth --status returns JSON with authenticated: true", async () => {
    const { json } = await runCliJson("auth", "--status");
    const data = json as {
      success: boolean;
      data: { authenticated: boolean; email: string | null };
    };
    expect(data.success).toBe(true);
    expect(data.data.authenticated).toBe(true);
  });
});

describe.runIf(creds)("E2E: calendars", () => {
  it("calendars lists real calendars", async () => {
    const result = await runCli("calendars");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it("calendars -f json returns valid JSON with calendars array", async () => {
    const { json } = await runCliJson("calendars");
    const data = json as { success: boolean; data: { calendars: unknown[] } };
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.calendars)).toBe(true);
    expect(data.data.calendars.length).toBeGreaterThan(0);
  });
});
