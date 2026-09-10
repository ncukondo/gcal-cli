import { Command } from "commander";
import { enum as zenum } from "zod";
import type { CommandResult, ErrorCode, OutputFormat } from "./types/index.ts";
import { ExitCode } from "./types/index.ts";
import { formatJsonError, errorCodeToExitCode } from "./lib/output.ts";
import pkg from "../package.json";

const FormatSchema = zenum(["text", "json"]);

export interface GlobalOptions {
  format: "text" | "json";
  timezone?: string;
  quiet: boolean;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("gcal")
    .description("CLI tool for managing Google Calendar events")
    .version(pkg.version)
    .option("-f, --format <format>", "Output format: text | json", "text")
    .option("-q, --quiet", "Minimal output", false)
    .option("--tz, --timezone <zone>", "Timezone (e.g., Asia/Tokyo)");

  // Handle unknown commands: show help and exit with code 3. Commander stops
  // parsing after this listener, so setting process.exitCode is enough and
  // keeps the exit path the same as finish()/handleError().
  program.on("command:*", (operands) => {
    process.stderr.write(`error: unknown command '${operands[0]}'\n\n`);
    program.outputHelp({ error: true });
    process.exitCode = ExitCode.ARGUMENT;
  });

  return program;
}

export function resolveGlobalOptions(program: Command): GlobalOptions {
  const raw = program.opts();

  const formatResult = FormatSchema.safeParse(raw.format);
  if (!formatResult.success) {
    process.stderr.write(`error: invalid format '${raw.format}'. Must be 'text' or 'json'.\n`);
    process.exit(ExitCode.ARGUMENT);
  }

  return {
    format: formatResult.data,
    timezone: raw.timezone,
    quiet: raw.quiet,
  };
}

/**
 * Record the command's exit code and let the process end naturally.
 *
 * Calling `process.exit()` right after `process.stdout.write()` discards
 * whatever is still queued in the async write buffer. Through a pipe that is
 * everything past the 64KB kernel pipe buffer, which truncates large JSON
 * output (#64). Setting `process.exitCode` instead lets Node/Bun drain
 * stdout/stderr before exiting while preserving the exit status.
 */
export function finish(result: CommandResult): void {
  process.exitCode = result.exitCode;
}

function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof Error && "code" in error) {
    const code = (error as Error & { code: string }).code;
    const validCodes: ErrorCode[] = [
      "AUTH_REQUIRED",
      "AUTH_EXPIRED",
      "NOT_FOUND",
      "INVALID_ARGS",
      "API_ERROR",
      "FORBIDDEN",
      "RATE_LIMITED",
      "CONFIG_ERROR",
    ];
    if (validCodes.includes(code as ErrorCode)) {
      return code as ErrorCode;
    }
  }
  return "API_ERROR";
}

export function handleError(error: unknown, format: OutputFormat): void {
  const errorCode = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (format === "json") {
    process.stderr.write(formatJsonError(errorCode, message));
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }

  process.exitCode = errorCodeToExitCode(errorCode);
}
