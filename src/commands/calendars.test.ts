import { describe, expect, it, vi } from "vitest";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { Calendar } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { handleCalendars, createCalendarsCommand } from "./calendars.ts";

function makeApi(calendars: Partial<Calendar>[]): GoogleCalendarApi {
  const items = calendars.map((c) => ({
    id: c.id ?? "",
    summary: c.name ?? "",
    description: c.description ?? null,
    primary: c.primary ?? false,
  }));

  return {
    calendarList: {
      list: vi.fn().mockResolvedValue({
        data: { items, nextPageToken: undefined },
      }),
    },
    events: {
      list: vi.fn(),
      get: vi.fn(),
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeOutput(): { output: string[]; write: (msg: string) => void } {
  const output: string[] = [];
  return { output, write: (msg: string) => output.push(msg) };
}

describe("handleCalendars", () => {
  it("fetches calendars from API and merges with config enabled state", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "work@group.calendar.google.com", name: "Work", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: false,
      write,
      configCalendars: [
        { id: "primary", name: "Main Calendar", enabled: true },
        { id: "work@group.calendar.google.com", name: "Work", enabled: false },
      ],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    // primary should be enabled (from config)
    expect(text).toContain("[x] primary");
    // work should be disabled (from config)
    expect(text).toContain("[ ] work@group");
  });

  it("text output shows [x]/[ ] checkboxes with calendar ID and name", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "family@group.calendar.google.com", name: "Family", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: false,
      write,
      configCalendars: [
        { id: "primary", name: "Main Calendar", enabled: true },
        { id: "family@group.calendar.google.com", name: "Family", enabled: true },
      ],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toContain("Calendars:");
    expect(text).toContain("[x] primary");
    expect(text).toContain("Main Calendar");
    expect(text).toContain("[x]");
    expect(text).toContain("Family");
  });

  it("disabled calendars show (disabled) label", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "work@group.calendar.google.com", name: "Work Main", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: false,
      write,
      configCalendars: [
        { id: "primary", name: "Main Calendar", enabled: true },
        { id: "work@group.calendar.google.com", name: "Work Main", enabled: false },
      ],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toContain("(disabled)");
    expect(text).toMatch(/\[ \].*work@group.*Work Main.*\(disabled\)/);
  });

  it("JSON output returns calendar array in success envelope", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "work@group.calendar.google.com", name: "Work", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "json",
      quiet: false,
      write,
      configCalendars: [
        { id: "primary", name: "Main Calendar", enabled: true },
        { id: "work@group.calendar.google.com", name: "Work", enabled: false },
      ],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(true);
    expect(json.data.calendars).toHaveLength(2);
    expect(json.data.calendars[0]).toMatchObject({
      id: "primary",
      name: "Main Calendar",
      primary: true,
      enabled: true,
    });
    expect(json.data.calendars[1]).toMatchObject({
      id: "work@group.calendar.google.com",
      name: "Work",
      enabled: false,
    });
  });

  it("--quiet flag outputs only calendar IDs", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "work@group.calendar.google.com", name: "Work", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: true,
      write,
      configCalendars: [
        { id: "primary", name: "Main Calendar", enabled: true },
        { id: "work@group.calendar.google.com", name: "Work", enabled: true },
      ],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toBe("primary\nwork@group.calendar.google.com");
  });

  it("calendars not in config default to enabled", async () => {
    const api = makeApi([
      { id: "primary", name: "Main Calendar", primary: true },
      { id: "new@group.calendar.google.com", name: "New Cal", primary: false },
    ]);
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: false,
      write,
      configCalendars: [{ id: "primary", name: "Main Calendar", enabled: true }],
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    // new calendar not in config should default to enabled
    expect(text).toContain("[x]");
    expect(text).toContain("New Cal");
  });

  it("handles API error gracefully", async () => {
    const api: GoogleCalendarApi = {
      calendarList: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
      },
      events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "text",
      quiet: false,
      write,
      configCalendars: [],
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(output.join("")).toContain("Unauthorized");
  });

  it("handles API error in JSON format", async () => {
    const api: GoogleCalendarApi = {
      calendarList: {
        list: vi.fn().mockRejectedValue(Object.assign(new Error("Unauthorized"), { code: 401 })),
      },
      events: { list: vi.fn(), get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };
    const { output, write } = makeOutput();

    const result = await handleCalendars({
      api,
      format: "json",
      quiet: false,
      write,
      configCalendars: [],
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });
});

describe("createCalendarsCommand", () => {
  it("creates a commander command named 'calendars'", () => {
    const cmd = createCalendarsCommand();
    expect(cmd.name()).toBe("calendars");
  });
});
