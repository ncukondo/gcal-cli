#!/usr/bin/env bun
import { Command, Option } from "commander";

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
    .option("-q, --quiet", "Minimal output", false);

  program.addOption(new Option("--timezone <zone>", "Timezone (e.g., Asia/Tokyo)"));
  program.addOption(new Option("--tz <zone>", "Timezone alias").hideHelp());

  return program;
}

export function resolveGlobalOptions(program: Command): GlobalOptions {
  const raw = program.opts();
  const timezone = raw.timezone ?? raw.tz;
  return {
    format: raw.format,
    calendar: raw.calendar,
    timezone,
    quiet: raw.quiet,
  };
}
