import { describe, it, expect, afterAll } from "vitest";
import {
  runCli,
  runCliJson,
  testEventTitle,
  todayDate,
  TestCleanup,
  hasCredentials,
  retryUntil,
} from "./helpers.ts";

const creds = hasCredentials();

/** YYYY-MM-DD `days` after today, in local time. */
function dateOffset(days: number): string {
  const [y, m, d] = todayDate().split("-").map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Far enough out that unrelated events are unlikely to share these days.
const day1 = dateOffset(40);
const day2 = dateOffset(41);
const day3 = dateOffset(42);

describe.runIf(creds)("E2E: multi-day all-day events", () => {
  const cleanup = new TestCleanup();

  afterAll(async () => {
    await cleanup.deleteAll();
  });

  const title = testEventTitle("MultiDay");

  it("add creates a two-day all-day event", async () => {
    // All-day --end is inclusive on input, so day1..day2 is a two-day event.
    const { json, result } = await runCliJson(
      "add",
      "--title",
      title,
      "--start",
      day1,
      "--end",
      day2,
    );

    expect(result.exitCode).toBe(0);
    const data = json as { success: boolean; data: { event: { id: string; all_day: boolean } } };
    expect(data.success).toBe(true);
    expect(data.data.event.all_day).toBe(true);
    cleanup.track(data.data.event.id);
  });

  it("list shows the event when only its second day is requested", async () => {
    await retryUntil(async () => {
      const result = await runCli("list", "--from", day2, "--to", day2);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(title);
      expect(result.stdout).toContain("[All Day 2/2]");
    });
  });

  it("list shows the event under every day of a wider range", async () => {
    await retryUntil(async () => {
      const result = await runCli("list", "--from", day1, "--to", day3);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`${day1} (`);
      expect(result.stdout).toContain("[All Day 1/2]");
      expect(result.stdout).toContain(`${day2} (`);
      expect(result.stdout).toContain("[All Day 2/2]");
    });
  });

  it("list does not render day groups outside the requested range", async () => {
    const result = await runCli("list", "--from", day2, "--to", day2);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(day1);
    expect(result.stdout).not.toContain(day3);
  });

  it("list --quiet repeats the event on each occupied day", async () => {
    await retryUntil(async () => {
      const result = await runCli("list", "--quiet", "--from", day1, "--to", day3);
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.split("\n").filter((line) => line.includes(title));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain(`${day1.slice(5, 7)}/${day1.slice(8, 10)}`);
      expect(lines[1]).toContain(`${day2.slice(5, 7)}/${day2.slice(8, 10)}`);
    });
  });

  it("list -f json still reports the event once with its original span", async () => {
    await retryUntil(async () => {
      const { json, result } = await runCliJson("list", "--from", day2, "--to", day2);
      expect(result.exitCode).toBe(0);

      const data = json as {
        data: { events: { title: string; start: string; end: string; all_day: boolean }[] };
      };
      const matches = data.data.events.filter((event) => event.title === title);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.start).toBe(day1);
      // The API reports all-day end as exclusive.
      expect(matches[0]!.end).toBe(day3);
    });
  });
});

describe.runIf(creds)("E2E: timed events crossing midnight", () => {
  const cleanup = new TestCleanup();

  afterAll(async () => {
    await cleanup.deleteAll();
  });

  const title = testEventTitle("Overnight");

  it("add creates an event spanning midnight", async () => {
    const { json, result } = await runCliJson(
      "add",
      "--title",
      title,
      "--start",
      `${day1}T23:00`,
      "--end",
      `${day2}T01:00`,
    );

    expect(result.exitCode).toBe(0);
    const data = json as { success: boolean; data: { event: { id: string } } };
    expect(data.success).toBe(true);
    cleanup.track(data.data.event.id);
  });

  it("list shows each day's occupied range", async () => {
    await retryUntil(async () => {
      const result = await runCli("list", "--from", day1, "--to", day2);
      expect(result.exitCode).toBe(0);

      const lines = result.stdout.split("\n").filter((line) => line.includes(title));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("23:00-24:00");
      expect(lines[1]).toContain("00:00-01:00");
    });
  });

  it("list shows the event when only the second day is requested", async () => {
    await retryUntil(async () => {
      const result = await runCli("list", "--from", day2, "--to", day2);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(title);
      expect(result.stdout).toContain("00:00-01:00");
    });
  });
});
