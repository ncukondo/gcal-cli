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
  const originalEnv = process.env;

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
