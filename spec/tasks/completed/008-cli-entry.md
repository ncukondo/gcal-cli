# Task: CLI Entry Point and Global Options

## Purpose

Set up the main CLI entry point with commander: define global options, register all commands, and implement top-level error handling with structured error output.

## Context

- Related files: `src/index.ts`, `src/commands/index.ts` (new)
- Dependencies: 005-output
- Related specs: `spec/commands.md` (Global Options), `spec/architecture.md` (Entry point), `spec/overview.md` (Exit Codes)

Current `src/index.ts` is a skeleton with no commands registered.

## Implementation Steps

- [x] Write test: CLI parses global `--format` / `-f` option (text/json)
- [x] Write test: CLI parses global `--calendar` / `-c` option (repeatable)
- [x] Write test: CLI parses global `--timezone` / `--tz` option
- [x] Write test: CLI parses global `--quiet` / `-q` option
- [x] Write test: unknown command prints help and exits with code 3
- [x] Implement global options in commander program setup
- [x] Write test: top-level error handler outputs structured error (text and JSON)
- [x] Write test: top-level error handler uses correct exit codes
- [x] Implement top-level error handling wrapper
- [x] Create `src/commands/index.ts` that registers all available commands
- [x] Wire command registration into `src/index.ts`
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] `gcal --help` displays help text with all global options
- [x] `gcal unknowncommand` exits with code 3

## Acceptance Criteria

- [x] Global options `--format`, `--calendar`, `--timezone`, `--quiet` are parsed correctly
- [x] `--calendar` can be specified multiple times
- [x] Unknown commands produce help text and exit code 3
- [x] Top-level errors are caught and formatted via output module
- [x] Exit codes follow spec: 0 success, 1 general, 2 auth, 3 argument
- [x] All commands can be registered via `src/commands/index.ts`
- [x] All unit tests pass
- [x] `bun run lint` passes
