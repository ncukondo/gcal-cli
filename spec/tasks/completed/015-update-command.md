# Task: Update Command (`gcal update`)

## Purpose

Implement the `gcal update` command to modify existing calendar events. Supports partial updates — only specified fields are changed.

## Context

- Related files: `src/commands/update.ts` (new), `src/commands/update.test.ts` (new)
- Dependencies: 008-cli-entry, 009b-api-write, 002-timezone, 005-output
- Related specs: `spec/commands.md` (`gcal update`)

## Implementation Steps

- [ ] Write test: event ID is required as positional argument
- [ ] Write test: at least one update option must be provided
- [ ] Implement argument validation
- [ ] Write test: `--title` updates event title only
- [ ] Write test: `--start` and `--end` update event times in resolved timezone
- [ ] Write test: `--description` updates event description
- [ ] Write test: `--busy` / `--free` updates transparency
- [ ] Implement partial update logic (only send changed fields)
- [ ] Write test: non-existent event returns `NOT_FOUND` error
- [ ] Write test: text output shows confirmation with updated event details
- [ ] Write test: JSON output returns updated event in success envelope
- [ ] Implement output formatting
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal update <id> -t "New Title"` updates event title
- [ ] `gcal update <id> -f json -t "New Title"` returns updated event in JSON

## Acceptance Criteria

- [ ] Event ID required as positional argument
- [ ] Partial updates: only specified fields are sent to API
- [ ] Time updates respect resolved timezone
- [ ] `NOT_FOUND` error for invalid event IDs
- [ ] Success output shows updated event details
- [ ] All unit tests pass
- [ ] `bun run lint` passes
