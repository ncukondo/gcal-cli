# Task: Show Command (`gcal show`)

## Purpose

Implement the `gcal show` command to display detailed information about a single event by its ID.

## Context

- Related files: `src/commands/show.ts` (new), `src/commands/show.test.ts` (new)
- Dependencies: 008-cli-entry, 009a-api-read, 005-output
- Related specs: `spec/commands.md` (`gcal show`), `spec/output.md` (Event data structure)

## Implementation Steps

- [ ] Write test: command fetches single event by ID from API
- [ ] Write test: text output shows all event fields (title, time, calendar, status, description, link)
- [ ] Write test: JSON output returns event in success envelope
- [ ] Write test: non-existent event ID returns `NOT_FOUND` error with exit code 1
- [ ] Implement show command handler
- [ ] Write test: all-day event displays date range without times
- [ ] Write test: timed event displays datetime with timezone
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal show <event-id>` displays event details
- [ ] `gcal show <event-id> -f json` returns valid JSON event object

## Acceptance Criteria

- [ ] Event fetched by ID from Google Calendar API
- [ ] Text output: human-readable event detail with all fields
- [ ] JSON output: `{ success: true, data: { event: {...} } }`
- [ ] `NOT_FOUND` error for invalid event IDs
- [ ] Both all-day and timed events render correctly
- [ ] All unit tests pass
- [ ] `bun run lint` passes
