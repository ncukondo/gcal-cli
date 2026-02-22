# Task: CLI Entry Point and Global Options

## Purpose

Set up the main CLI entry point with commander: define global options, register all commands, and implement top-level error handling with structured error output.

## Context

- Related files: `src/index.ts`, `src/commands/index.ts` (new)
- Dependencies: 005-output
- Related specs: `spec/commands.md` (Global Options), `spec/architecture.md` (Entry point), `spec/overview.md` (Exit Codes)

Current `src/index.ts` is a skeleton with no commands registered.

## Implementation Steps

- [ ] Write test: CLI parses global `--format` / `-f` option (text/json)
- [ ] Write test: CLI parses global `--calendar` / `-c` option (repeatable)
- [ ] Write test: CLI parses global `--timezone` / `--tz` option
- [ ] Write test: CLI parses global `--quiet` / `-q` option
- [ ] Write test: unknown command prints help and exits with code 3
- [ ] Implement global options in commander program setup
- [ ] Write test: top-level error handler outputs structured error (text and JSON)
- [ ] Write test: top-level error handler uses correct exit codes
- [ ] Implement top-level error handling wrapper
- [ ] Create `src/commands/index.ts` that registers all available commands
- [ ] Wire command registration into `src/index.ts`
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal --help` displays help text with all global options
- [ ] `gcal unknowncommand` exits with code 3

## Acceptance Criteria

- [ ] Global options `--format`, `--calendar`, `--timezone`, `--quiet` are parsed correctly
- [ ] `--calendar` can be specified multiple times
- [ ] Unknown commands produce help text and exit code 3
- [ ] Top-level errors are caught and formatted via output module
- [ ] Exit codes follow spec: 0 success, 1 general, 2 auth, 3 argument
- [ ] All commands can be registered via `src/commands/index.ts`
- [ ] All unit tests pass
- [ ] `bun run lint` passes
