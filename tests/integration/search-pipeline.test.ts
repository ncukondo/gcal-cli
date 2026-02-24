import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleSearch } from "../../src/commands/search.ts";
import { loadConfig, selectCalendars } from "../../src/lib/config.ts";
import { resolveTimezone } from "../../src/lib/timezone.ts";
import {
  createMockApi,
  createMockFs,
  makeGoogleEvent,
  SAMPLE_CONFIG_TOML,
  captureWrite,
} from "./helpers.ts";

describe("search command pipeline: config → API → filter → output", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GCAL_CLI_CONFIG", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("searches across multiple enabled calendars and returns combined results", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [makeGoogleEvent({ id: "e1", summary: "Team Meeting" })],
        "work@group.calendar.google.com": [
          makeGoogleEvent({ id: "e2", summary: "Project Meeting" }),
        ],
      },
    });
    const mockFs = createMockFs(SAMPLE_CONFIG_TOML);

    const config = loadConfig(mockFs);
    const calendars = selectCalendars(undefined, config);
    const timezone = resolveTimezone(undefined, config.timezone);
    const out = captureWrite();

    const result = await handleSearch({
      api: mockApi,
      query: "Meeting",
      format: "json",
      calendars,
      timezone,
      write: out.write,
    });

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(out.output());
    expect(json.success).toBe(true);
    expect(json.data.query).toBe("Meeting");
    expect(json.data.count).toBe(2);

    // Verify API was called with query parameter
    const listFn = mockApi.events.list as ReturnType<typeof vi.fn>;
    for (const call of listFn.mock.calls) {
      expect(call[0].q).toBe("Meeting");
    }
  });

  it("applies --busy filter in search results", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({ id: "e1", summary: "Busy Meeting", transparency: "opaque" }),
          makeGoogleEvent({ id: "e2", summary: "Free Block", transparency: "transparent" }),
        ],
      },
    });
    const out = captureWrite();

    const result = await handleSearch({
      api: mockApi,
      query: "test",
      format: "json",
      calendars: [{ id: "primary", name: "Main", enabled: true }],
      timezone: "Asia/Tokyo",
      busy: true,
      write: out.write,
    });

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(out.output());
    expect(json.data.count).toBe(1);
    expect(json.data.events[0].id).toBe("e1");
  });

  it("text output shows search result header with match count", async () => {
    const mockApi = createMockApi({
      events: {
        primary: [
          makeGoogleEvent({ id: "e1", summary: "Team Meeting" }),
          makeGoogleEvent({ id: "e2", summary: "Review Meeting" }),
        ],
      },
    });
    const out = captureWrite();

    await handleSearch({
      api: mockApi,
      query: "Meeting",
      format: "text",
      calendars: [{ id: "primary", name: "Main Calendar", enabled: true }],
      timezone: "Asia/Tokyo",
      write: out.write,
    });

    const output = out.output();
    expect(output).toContain('Found 2 events matching "Meeting"');
    expect(output).toContain("Team Meeting");
    expect(output).toContain("Review Meeting");
  });

  it("returns empty results when no events match", async () => {
    const mockApi = createMockApi({ events: { primary: [] } });
    const out = captureWrite();

    await handleSearch({
      api: mockApi,
      query: "nonexistent",
      format: "json",
      calendars: [{ id: "primary", name: "Main", enabled: true }],
      timezone: "Asia/Tokyo",
      write: out.write,
    });

    const json = JSON.parse(out.output());
    expect(json.data.count).toBe(0);
    expect(json.data.events).toEqual([]);
  });

  it("passes date range through to API from --from/--to options", async () => {
    const mockApi = createMockApi({ events: { primary: [] } });
    const out = captureWrite();

    await handleSearch({
      api: mockApi,
      query: "test",
      format: "json",
      calendars: [{ id: "primary", name: "Main", enabled: true }],
      timezone: "Asia/Tokyo",
      from: "2026-03-01",
      to: "2026-03-31",
      write: out.write,
    });

    const listFn = mockApi.events.list as ReturnType<typeof vi.fn>;
    const params = listFn.mock.calls[0]![0];
    expect(params.timeMin).toContain("2026-03-01");
    expect(params.timeMax).toContain("2026-03-31");
  });
});
