import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Calendar } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { parseConfig } from "../lib/config.ts";
import { createInitCommand, handleInit } from "./init.ts";
import type { HandleInitOptions } from "./init.ts";

function makeCal(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "user@gmail.com",
    name: "Main Calendar",
    description: null,
    primary: true,
    enabled: true,
    ...overrides,
  };
}

function makeFs(overrides: Partial<HandleInitOptions["fs"]> = {}): HandleInitOptions["fs"] {
  return {
    existsSync: vi.fn().mockReturnValue(false),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    ...overrides,
  };
}

function makeOpts(overrides: Partial<HandleInitOptions> = {}): HandleInitOptions {
  const output: string[] = [];
  return {
    listCalendars: vi.fn().mockResolvedValue([
      makeCal({ id: "user@gmail.com", name: "Main Calendar", primary: true }),
      makeCal({ id: "family@group.calendar.google.com", name: "Family", primary: false }),
    ]),
    fs: makeFs(),
    format: "text",
    quiet: false,
    write: (msg: string) => output.push(msg),
    force: false,
    all: false,
    local: false,
    ...overrides,
  };
}

describe("createInitCommand", () => {
  it("creates a command named 'init'", () => {
    const cmd = createInitCommand();
    expect(cmd.name()).toBe("init");
  });

  it("has --force, --all, --local, --timezone options", () => {
    const cmd = createInitCommand();
    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain("--force");
    expect(optionNames).toContain("--all");
    expect(optionNames).toContain("--local");
    expect(optionNames).toContain("--timezone");
  });
});

describe("handleInit", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("HOME", "/home/testuser");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fetches calendars and writes config with only primary enabled by default", async () => {
    const fs = makeFs();
    const output: string[] = [];
    const opts = makeOpts({
      fs,
      write: (msg) => output.push(msg),
    });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(opts.listCalendars).toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();

    // Verify only primary calendar is enabled
    const writtenToml = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const parsed = parseConfig(writtenToml);
    expect(parsed.calendars).toHaveLength(2);
    const primary = parsed.calendars.find((c) => c.id === "user@gmail.com");
    const family = parsed.calendars.find((c) => c.id === "family@group.calendar.google.com");
    expect(primary?.enabled).toBe(true);
    expect(family?.enabled).toBe(false);
  });

  it("writes to default config path", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs });

    await handleInit(opts);

    const writtenPath = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(writtenPath).toBe("/home/testuser/.config/gcal-cli/config.toml");
  });

  it("creates parent directory before writing", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs });

    await handleInit(opts);

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      "/home/testuser/.config/gcal-cli",
      { recursive: true },
    );
  });

  it("outputs text format by default", async () => {
    const output: string[] = [];
    const opts = makeOpts({ write: (msg) => output.push(msg) });

    await handleInit(opts);

    const text = output.join("\n");
    expect(text).toContain("Config file created:");
    expect(text).toContain("Main Calendar");
  });

  it("outputs JSON format when format is json", async () => {
    const output: string[] = [];
    const opts = makeOpts({ format: "json", write: (msg) => output.push(msg) });

    await handleInit(opts);

    const json = JSON.parse(output[0]!);
    expect(json.success).toBe(true);
    expect(json.data.path).toContain("config.toml");
    expect(json.data.calendars).toBeInstanceOf(Array);
    expect(json.data.enabled_count).toBe(1);
    expect(json.data.total_count).toBe(2);
  });

  it("outputs only path in quiet mode", async () => {
    const output: string[] = [];
    const opts = makeOpts({ quiet: true, write: (msg) => output.push(msg) });

    await handleInit(opts);

    expect(output).toHaveLength(1);
    expect(output[0]).toContain("config.toml");
  });

  it("includes system timezone in generated config", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs });

    await handleInit(opts);

    const writtenToml = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const parsed = parseConfig(writtenToml);
    // Should include some timezone (system default)
    expect(parsed.timezone).toBeDefined();
  });

  it("--all enables all calendars", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs, all: true });

    await handleInit(opts);

    const writtenToml = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const parsed = parseConfig(writtenToml);
    expect(parsed.calendars.every((c) => c.enabled)).toBe(true);
  });

  it("--force overwrites existing config file", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
    });
    const opts = makeOpts({ fs, force: true });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("errors when config exists without --force", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
    });
    const output: string[] = [];
    const opts = makeOpts({ fs, write: (msg) => output.push(msg) });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.GENERAL);
    expect(output.join("\n")).toContain("already exists");
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("errors when config exists without --force (JSON)", async () => {
    const fs = makeFs({
      existsSync: vi.fn().mockReturnValue(true),
    });
    const output: string[] = [];
    const opts = makeOpts({ fs, format: "json", write: (msg) => output.push(msg) });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.GENERAL);
    const json = JSON.parse(output[0]!);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("CONFIG_ERROR");
  });

  it("--local writes to ./gcal-cli.toml", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs, local: true });

    await handleInit(opts);

    const writtenPath = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(writtenPath).toContain("gcal-cli.toml");
    expect(writtenPath).not.toContain(".config");
  });

  it("--timezone overrides timezone in config", async () => {
    const fs = makeFs();
    const opts = makeOpts({ fs, timezone: "America/New_York" });

    await handleInit(opts);

    const writtenToml = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const parsed = parseConfig(writtenToml);
    expect(parsed.timezone).toBe("America/New_York");
  });

  it("--timezone appears in text output", async () => {
    const output: string[] = [];
    const opts = makeOpts({ timezone: "Asia/Tokyo", write: (msg) => output.push(msg) });

    await handleInit(opts);

    expect(output.join("\n")).toContain("Asia/Tokyo");
  });

  it("errors when no calendars found", async () => {
    const output: string[] = [];
    const opts = makeOpts({
      listCalendars: vi.fn().mockResolvedValue([]),
      write: (msg) => output.push(msg),
    });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.GENERAL);
    expect(output.join("\n")).toContain("No calendars found");
  });

  it("errors when no calendars found (JSON)", async () => {
    const output: string[] = [];
    const opts = makeOpts({
      listCalendars: vi.fn().mockResolvedValue([]),
      format: "json",
      write: (msg) => output.push(msg),
    });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.GENERAL);
    const json = JSON.parse(output[0]!);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("API_ERROR");
  });

  it("propagates non-auth API errors", async () => {
    const apiError = Object.assign(new Error("Server error"), { code: 500 });
    const opts = makeOpts({
      listCalendars: vi.fn().mockRejectedValue(apiError),
    });

    await expect(handleInit(opts)).rejects.toThrow("Server error");
  });

  it("returns AUTH exit code when auth fails without requestAuth", async () => {
    const authError = Object.assign(new Error("Not authenticated"), { code: "AUTH_REQUIRED" });
    const output: string[] = [];
    const opts = makeOpts({
      listCalendars: vi.fn().mockRejectedValue(authError),
      write: (msg) => output.push(msg),
    });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(output.join("\n")).toContain("Not authenticated");
  });

  it("auto-authenticates when listCalendars throws AUTH_REQUIRED", async () => {
    const authError = Object.assign(new Error("Not authenticated"), { code: "AUTH_REQUIRED" });
    let callCount = 0;
    const listCalendars = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(authError);
      return Promise.resolve([makeCal()]);
    });
    const requestAuth = vi.fn().mockResolvedValue(undefined);
    const output: string[] = [];
    const opts = makeOpts({
      listCalendars,
      requestAuth,
      write: (msg) => output.push(msg),
    });

    const result = await handleInit(opts);

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(requestAuth).toHaveBeenCalled();
    expect(listCalendars).toHaveBeenCalledTimes(2);
  });
});
