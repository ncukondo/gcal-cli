import { Command } from "commander";
import { enum as zenum } from "zod";
import type { ErrorCode, OutputFormat } from "./types/index.ts";
import { ExitCode } from "./types/index.ts";
import { formatJsonError, errorCodeToExitCode } from "./lib/output.ts";

const FormatSchema = zenum(["text", "json"]);

export interface GlobalOptions {
  format: "text" | "json";
  calendar: string[];
  timezone?: string;
  quiet: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("gcal")
    .description("CLI tool for managing Google Calendar events")
    .version("0.1.0")
    .option("-f, --format <format>", "Output format: text | json", "text")
    .option("-c, --calendar <id>", "Target calendar ID (repeatable)", collect, [])
    .option("-q, --quiet", "Minimal output", false)
    .option("--tz, --timezone <zone>", "Timezone (e.g., Asia/Tokyo)");

  // Handle unknown commands: show help and exit with code 3
  program.on("command:*", (operands) => {
    process.stderr.write(`error: unknown command '${operands[0]}'\n\n`);
    program.outputHelp({ error: true });
    process.exit(ExitCode.ARGUMENT);
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
    calendar: raw.calendar,
    timezone: raw.timezone,
    quiet: raw.quiet,
  };
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

  process.exit(errorCodeToExitCode(errorCode));
}
