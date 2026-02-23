import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  findConfigPath,
  parseConfig,
} from "./config.ts";
import type { AppConfig } from "../types/index.ts";

describe("findConfigPath", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns $GCAL_CLI_CONFIG path when env var is set", async () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "/custom/path/config.toml");
    const result = await findConfigPath({
      existsSync: (path: string) => path === "/custom/path/config.toml",
    });
    expect(result).toBe("/custom/path/config.toml");
  });

  it("returns ./gcal-cli.toml when present in cwd", async () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    const cwd = process.cwd();
    const cwdConfig = `${cwd}/gcal-cli.toml`;
    const result = await findConfigPath({
      existsSync: (path: string) => path === cwdConfig,
    });
    expect(result).toBe(cwdConfig);
  });

  it("returns ~/.config/gcal-cli/config.toml as fallback", async () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    vi.stubEnv("HOME", "/home/testuser");
    const defaultPath = "/home/testuser/.config/gcal-cli/config.toml";
    const result = await findConfigPath({
      existsSync: (path: string) => path === defaultPath,
    });
    expect(result).toBe(defaultPath);
  });

  it("returns null when no config exists", async () => {
    vi.stubEnv("GCAL_CLI_CONFIG", "");
    const result = await findConfigPath({
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
});
