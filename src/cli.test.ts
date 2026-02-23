import { describe, expect, it } from "vitest";
import type { GlobalOptions } from "./cli.ts";
import { createProgram, resolveGlobalOptions } from "./cli.ts";

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

  describe("--calendar / -c", () => {
    it("defaults to empty array", () => {
      const opts = parseArgs([]);
      expect(opts.calendar).toEqual([]);
    });

    it("accepts single --calendar value", () => {
      const opts = parseArgs(["--calendar", "primary"]);
      expect(opts.calendar).toEqual(["primary"]);
    });

    it("accepts -c shorthand", () => {
      const opts = parseArgs(["-c", "work@group.calendar.google.com"]);
      expect(opts.calendar).toEqual(["work@group.calendar.google.com"]);
    });

    it("can be specified multiple times", () => {
      const opts = parseArgs(["-c", "cal1", "-c", "cal2", "-c", "cal3"]);
      expect(opts.calendar).toEqual(["cal1", "cal2", "cal3"]);
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
