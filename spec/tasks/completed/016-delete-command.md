# Task: Delete Command (`gcal delete`)

## Purpose

Implement the `gcal delete` command to remove a calendar event by its ID.

## Context

- Related files: `src/commands/delete.ts` (new), `src/commands/delete.test.ts` (new)
- Dependencies: 008-cli-entry, 009b-api-write, 005-output
- Related specs: `spec/commands.md` (`gcal delete`)

## Implementation Steps

- [ ] Write test: event ID is required as positional argument
- [ ] Write test: missing event ID returns `INVALID_ARGS` error
- [ ] Implement argument validation
- [ ] Write test: successful deletion outputs confirmation message
- [ ] Write test: `--quiet` flag suppresses output
- [ ] Write test: JSON output returns `{ deleted_id, message: "Event deleted" }`
- [ ] Implement delete command handler
- [ ] Write test: non-existent event returns `NOT_FOUND` error
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal delete <id>` deletes the event
- [ ] `gcal delete <id> -f json` returns JSON confirmation

## Acceptance Criteria

- [ ] Event ID required as positional argument
- [ ] Successful deletion outputs confirmation
- [ ] `--quiet` flag suppresses output (exit code only)
- [ ] JSON output: `{ success: true, data: { deleted_id, message } }`
- [ ] `NOT_FOUND` error for invalid event IDs
- [ ] All unit tests pass
- [ ] `bun run lint` passes
