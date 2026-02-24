import { describe, it, expect, afterAll } from "vitest";
import {
  runCli,
  runCliJson,
  testEventTitle,
  todayAt,
  TestCleanup,
  hasCredentials,
} from "./helpers.ts";

const creds = hasCredentials();

describe.runIf(creds)("E2E: output formats", () => {
  it("list --today returns text output", async () => {
    const result = await runCli("list", "--today");
    expect(result.exitCode).toBe(0);
    // Text output should not be JSON
    expect(result.stdout).not.toMatch(/^\s*\{/);
  });

  it("list -f json --today returns valid JSON output", async () => {
    const { json, result } = await runCliJson("list", "--today");

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { events: unknown[]; count: number } };
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.events)).toBe(true);
    expect(typeof data.data.count).toBe("number");
    expect(data.data.count).toBe(data.data.events.length);
  });
});

describe.runIf(creds)("E2E: filtering", () => {
  const cleanup = new TestCleanup();

  afterAll(async () => {
    await cleanup.deleteAll();
  });

  const busyTitle = testEventTitle("Busy");
  let busyEventId: string;

  it("add creates a busy event for filter testing", async () => {
    const start = todayAt(16);
    const end = todayAt(17);

    const { json, result } = await runCliJson(
      "add",
      "--title",
      busyTitle,
      "--start",
      start,
      "--end",
      end,
      "--busy",
    );

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { event: { id: string } } };
    busyEventId = data.data.event.id;
    cleanup.track(busyEventId);
  });

  it("list --today --busy includes the busy event", async () => {
    expect(busyEventId).toBeTruthy();

    const { json, result } = await runCliJson("list", "--today", "--busy");

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { events: { id: string }[] } };
    expect(data.success).toBe(true);

    const found = data.data.events.find((e) => e.id === busyEventId);
    expect(found).toBeTruthy();
  });
});

describe.runIf(creds)("E2E: timezone override", () => {
  const cleanup = new TestCleanup();

  afterAll(async () => {
    await cleanup.deleteAll();
  });

  const tzTitle = testEventTitle("TZ");
  let tzEventId: string;

  it("add creates an event for timezone testing", async () => {
    const start = todayAt(10);
    const end = todayAt(11);

    const { json, result } = await runCliJson(
      "add",
      "--title",
      tzTitle,
      "--start",
      start,
      "--end",
      end,
    );

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { event: { id: string } } };
    tzEventId = data.data.event.id;
    cleanup.track(tzEventId);
  });

  it("show with different timezones displays different times in text output", async () => {
    expect(tzEventId).toBeTruthy();

    // Show the event in text format with different timezones
    const nyResult = await runCli("--tz", "America/New_York", "show", tzEventId);
    const tokyoResult = await runCli("--tz", "Asia/Tokyo", "show", tzEventId);

    expect(nyResult.exitCode).toBe(0);
    expect(tokyoResult.exitCode).toBe(0);

    // Text format should show visibly different time strings for different timezones
    expect(nyResult.stdout).not.toBe(tokyoResult.stdout);
  });

  it("list with timezone override works without errors", async () => {
    const result = await runCli("--tz", "America/New_York", "list", "--today");
    expect(result.exitCode).toBe(0);
  });
});
