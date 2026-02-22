# Task: Calendars Command (`gcal calendars`)

## Purpose

Implement the `gcal calendars` command to list available calendars with their enabled/disabled status, filtered by config.

## Context

- Related files: `src/commands/calendars.ts` (new), `src/commands/calendars.test.ts` (new)
- Dependencies: 008-cli-entry, 009a-api-read, 003-config
- Related specs: `spec/commands.md` (`gcal calendars`), `spec/output.md` (Calendar list output)

## Implementation Steps

- [ ] Write test: command fetches calendars from API and merges with config enabled state
- [ ] Write test: text output shows `[x]`/`[ ]` checkboxes with calendar ID and name
- [ ] Write test: disabled calendars show `(disabled)` label
- [ ] Write test: JSON output returns calendar array in success envelope
- [ ] Implement calendars command handler
- [ ] Write test: `--quiet` flag outputs only calendar IDs
- [ ] Implement quiet mode
- [ ] Register command with CLI (in `src/commands/index.ts`)
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal calendars` lists calendars from the authenticated account
- [ ] `gcal calendars -f json` returns valid JSON envelope with calendar array

## Acceptance Criteria

- [ ] Text output matches spec format: `[x] id  Name` / `[ ] id  Name (disabled)`
- [ ] JSON output uses `{ success: true, data: { calendars: [...] } }` envelope
- [ ] Calendar enabled state reflects config (or defaults to auto-discovery logic)
- [ ] `--quiet` mode outputs calendar IDs only
- [ ] All unit tests pass
- [ ] `bun run lint` passes
