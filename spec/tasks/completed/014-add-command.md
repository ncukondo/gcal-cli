# Task: Add Command (`gcal add`)

## Purpose

Implement the `gcal add` command to create new calendar events with support for timed and all-day events, timezone handling, and transparency options.

## Context

- Related files: `src/commands/add.ts` (new), `src/commands/add.test.ts` (new)
- Dependencies: 008-cli-entry, 009b-api-write, 002-timezone, 003-config, 005-output
- Related specs: `spec/commands.md` (`gcal add`)

## Implementation Steps

- [ ] Write test: required options `--title`, `--start`, `--end` are validated
- [ ] Write test: missing required option returns `INVALID_ARGS` error with exit code 3
- [ ] Implement argument validation
- [ ] Write test: timed event created with correct datetime in resolved timezone
- [ ] Write test: `--all-day` flag creates all-day event with date-only start/end
- [ ] Write test: event created on first enabled calendar when no `-c` specified
- [ ] Write test: `-c` flag targets specified calendar
- [ ] Implement event creation logic
- [ ] Write test: `--free` flag sets transparency to transparent
- [ ] Write test: default transparency is opaque (busy)
- [ ] Write test: `--description` sets event description
- [ ] Implement optional fields
- [ ] Write test: text output shows confirmation message with event details
- [ ] Write test: JSON output returns `{ event, message: "Event created" }`
- [ ] Implement output formatting
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal add -t "Test" -s "..." -e "..."` creates an event
- [ ] `gcal add -f json -t "Test" -s "..." -e "..."` returns created event in JSON

## Acceptance Criteria

- [ ] Required options (`--title`, `--start`, `--end`) are enforced
- [ ] Timed events: datetime interpreted in resolved timezone
- [ ] All-day events: `--all-day` flag uses date-only values
- [ ] Calendar targeting: first enabled calendar by default, `-c` override
- [ ] Transparency: `--busy` (default) and `--free` options
- [ ] Success output includes created event details
- [ ] `INVALID_ARGS` error for missing/invalid arguments
- [ ] All unit tests pass
- [ ] `bun run lint` passes
