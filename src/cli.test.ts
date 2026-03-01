import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlobalOptions } from "./cli.ts";
import { createProgram, resolveGlobalOptions, handleError } from "./cli.ts";
import type { ErrorCode } from "./types/index.ts";
import { ExitCode } from "./types/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function parseArgs(args: string[]): GlobalOptions {
  const program = createProgram();
  program.parse(["node", "gcal", ...args]);
  return resolveGlobalOptions(program);
}

describe("global options", () => {
  describe("--format / -f", () => {
    it("defaults to text", () => {
      const opts = parseArgs([]);
      expect(opts.format).toBe("text");
    });

    it("accepts --format json", () => {
      const opts = parseArgs(["--format", "json"]);
      expect(opts.format).toBe("json");
    });

    it("accepts -f json shorthand", () => {
      const opts = parseArgs(["-f", "json"]);
      expect(opts.format).toBe("json");
    });

    it("accepts --format text explicitly", () => {
      const opts = parseArgs(["--format", "text"]);
      expect(opts.format).toBe("text");
    });
  });

  describe("--calendar / -c removed from global", () => {
    it("does not have calendar property", () => {
      const opts = parseArgs([]);
      expect(opts).not.toHaveProperty("calendar");
    });
  });

  describe("--timezone / --tz", () => {
    it("defaults to undefined", () => {
      const opts = parseArgs([]);
      expect(opts.timezone).toBeUndefined();
    });

    it("accepts --timezone value", () => {
      const opts = parseArgs(["--timezone", "Asia/Tokyo"]);
      expect(opts.timezone).toBe("Asia/Tokyo");
    });

    it("accepts --tz alias", () => {
      const opts = parseArgs(["--tz", "America/New_York"]);
      expect(opts.timezone).toBe("America/New_York");
    });
  });

  describe("--quiet / -q", () => {
    it("defaults to false", () => {
      const opts = parseArgs([]);
      expect(opts.quiet).toBe(false);
    });

    it("sets quiet to true with --quiet", () => {
      const opts = parseArgs(["--quiet"]);
      expect(opts.quiet).toBe(true);
    });

    it("sets quiet to true with -q", () => {
      const opts = parseArgs(["-q"]);
      expect(opts.quiet).toBe(true);
    });
  });
});

describe("unknown command", () => {
  it("exits with code 3 for unknown commands", () => {
    const program = createProgram();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    program.parse(["node", "gcal", "unknowncommand"]);

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.ARGUMENT);
  });
});

describe("format validation", () => {
  it("rejects invalid format values with exit code 3", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const program = createProgram();
    program.parse(["node", "gcal", "--format", "xml"]);
    resolveGlobalOptions(program);

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.ARGUMENT);
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("invalid format");
  });
});

describe("handleError", () => {
  it("outputs text error message to stderr", () => {
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    handleError(new Error("something failed"), "text");

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("something failed");
  });

  it("outputs JSON error to stderr for json format", () => {
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    handleError(new Error("auth required"), "json");

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.error.message).toBe("auth required");
  });

  it("exits with code 1 for general errors", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    handleError(new Error("general failure"), "text");

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.GENERAL);
  });

  it("exits with code 2 for auth errors", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const error = new Error("not authenticated");
    (error as Error & { code: ErrorCode }).code = "AUTH_REQUIRED";
    handleError(error, "text");

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.AUTH);
  });

  it("exits with code 3 for argument errors", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const error = new Error("invalid argument");
    (error as Error & { code: ErrorCode }).code = "INVALID_ARGS";
    handleError(error, "text");

    expect(exitSpy).toHaveBeenCalledWith(ExitCode.ARGUMENT);
  });

  it("uses API_ERROR code in JSON output for general errors", () => {
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    handleError(new Error("unexpected"), "json");

    const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
    const parsed = JSON.parse(output);
    expect(parsed.error.code).toBe("API_ERROR");
  });
});
