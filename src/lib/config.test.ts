import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  findConfigPath,
  parseConfig,
  loadConfig,
  getEnabledCalendars,
  selectCalendars,
} from "./config.ts";
import type { AppConfig, CalendarConfig } from "../types/index.ts";

describe("findConfigPath", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns $GCAL_CLI_CONFIG path when env var is set", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "/custom/path/config.toml");
    const result = findConfigPath({
      existsSync: (path: string) => path === "/custom/path/config.toml",
    });
    expect(result).toBe("/custom/path/config.toml");
  });

  it("throws when $GCAL_CLI_CONFIG is set but file does not exist", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "/missing/config.toml");
    expect(() => findConfigPath({ existsSync: () => false })).toThrow(
      "Config file not found: /missing/config.toml",
    );
  });

  it("returns ./gcal-cli.toml when present in cwd", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    const cwd = process.cwd();
    const cwdConfig = `${cwd}/gcal-cli.toml`;
    const result = findConfigPath({
      existsSync: (path: string) => path === cwdConfig,
    });
    expect(result).toBe(cwdConfig);
  });

  it("returns ~/.config/gcal-cli/config.toml as fallback", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    vi.stubEnv("HOME", "/home/testuser");
    const defaultPath = "/home/testuser/.config/gcal-cli/config.toml";
    const result = findConfigPath({
      existsSync: (path: string) => path === defaultPath,
    });
    expect(result).toBe(defaultPath);
  });

  it("returns null when no config exists", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    const result = findConfigPath({
      existsSync: () => false,
    });
    expect(result).toBeNull();
  });
});

describe("parseConfig", () => {
  it("correctly parses a valid TOML config string into AppConfig", () => {
    const toml = `
timezone = "Asia/Tokyo"
default_format = "text"

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true

[[calendars]]
id = "family@group.calendar.google.com"
name = "Family"
enabled = false
`;
    const config: AppConfig = parseConfig(toml);
    expect(config.timezone).toBe("Asia/Tokyo");
    expect(config.default_format).toBe("text");
    expect(config.calendars).toHaveLength(2);
    expect(config.calendars[0]).toEqual({
      id: "primary",
      name: "Main Calendar",
      enabled: true,
    });
    expect(config.calendars[1]).toEqual({
      id: "family@group.calendar.google.com",
      name: "Family",
      enabled: false,
    });
  });

  it("handles missing optional fields with defaults", () => {
    const toml = "";
    const config: AppConfig = parseConfig(toml);
    expect(config.timezone).toBeUndefined();
    expect(config.default_format).toBe("text");
    expect(config.calendars).toEqual([]);
  });

  it("respects GCAL_CLI_FORMAT env var", () => {
    vi.stubEnv("GCAL_CLI_FORMAT", "json");
    const config: AppConfig = parseConfig("");
    expect(config.default_format).toBe("json");
    vi.unstubAllEnvs();
  });

  it("respects GCAL_CLI_TIMEZONE env var", () => {
    vi.stubEnv("GCAL_CLI_TIMEZONE", "America/New_York");
    const config: AppConfig = parseConfig("");
    expect(config.timezone).toBe("America/New_York");
    vi.unstubAllEnvs();
  });

  it("env vars override config file values", () => {
    vi.stubEnv("GCAL_CLI_FORMAT", "json");
    vi.stubEnv("GCAL_CLI_TIMEZONE", "America/New_York");
    const toml = `
timezone = "Asia/Tokyo"
default_format = "text"
`;
    const config: AppConfig = parseConfig(toml);
    expect(config.timezone).toBe("America/New_York");
    expect(config.default_format).toBe("json");
    vi.unstubAllEnvs();
  });

  it("throws on invalid TOML syntax", () => {
    const badToml = `
timezone = "Asia/Tokyo"
this is not valid toml [[[
`;
    expect(() => parseConfig(badToml)).toThrow();
  });

  it("throws on invalid default_format in TOML", () => {
    const toml = `default_format = "yaml"`;
    expect(() => parseConfig(toml)).toThrow('Invalid output format "yaml" from config file');
  });

  it("throws on invalid GCAL_CLI_FORMAT env var", () => {
    vi.stubEnv("GCAL_CLI_FORMAT", "xml");
    expect(() => parseConfig("")).toThrow(
      'Invalid output format "xml" from GCAL_CLI_FORMAT env var',
    );
    vi.unstubAllEnvs();
  });
});

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads and parses config from disk", () => {
    const tomlContent = `
timezone = "Asia/Tokyo"
default_format = "json"

[[calendars]]
id = "primary"
name = "Work"
enabled = true
`;
    vi.stubEnv("GCAL_CLI_CONFIG", "/mock/config.toml");
    const config = loadConfig({
      existsSync: (path: string) => path === "/mock/config.toml",
      readFileSync: (path: string) => {
        if (path === "/mock/config.toml") return tomlContent;
        throw new Error(`File not found: ${path}`);
      },
    });
    expect(config.timezone).toBe("Asia/Tokyo");
    expect(config.default_format).toBe("json");
    expect(config.calendars).toHaveLength(1);
    expect(config.calendars[0]!.id).toBe("primary");
  });

  it("returns default config when no config file exists", () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    const config = loadConfig({
      existsSync: () => false,
      readFileSync: () => {
        throw new Error("Should not be called");
      },
    });
    expect(config.default_format).toBe("text");
    expect(config.calendars).toEqual([]);
  });
});

describe("getEnabledCalendars", () => {
  it("returns only calendars with enabled = true", () => {
    const calendars: CalendarConfig[] = [
      { id: "primary", name: "Main", enabled: true },
      { id: "work", name: "Work", enabled: false },
      { id: "family", name: "Family", enabled: true },
    ];
    const result = getEnabledCalendars(calendars);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("primary");
    expect(result[1]!.id).toBe("family");
  });

  it("returns empty array when no calendars are enabled", () => {
    const calendars: CalendarConfig[] = [{ id: "work", name: "Work", enabled: false }];
    expect(getEnabledCalendars(calendars)).toEqual([]);
  });
});

describe("selectCalendars", () => {
  const config: AppConfig = {
    default_format: "text",
    calendars: [
      { id: "primary", name: "Main", enabled: true },
      { id: "work", name: "Work", enabled: false },
      { id: "family", name: "Family", enabled: true },
    ],
  };

  it("returns CLI-specified calendars when -c provided (overrides config)", () => {
    const result = selectCalendars(["work", "other"], config);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("work");
    expect(result[1]!.id).toBe("other");
  });

  it("returns enabled calendars from config when no CLI override", () => {
    const result = selectCalendars(undefined, config);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("primary");
    expect(result[1]!.id).toBe("family");
  });

  it("returns empty array when no CLI override and no enabled calendars", () => {
    const emptyConfig: AppConfig = {
      default_format: "text",
      calendars: [{ id: "work", name: "Work", enabled: false }],
    };
    const result = selectCalendars(undefined, emptyConfig);
    expect(result).toEqual([]);
  });
});
