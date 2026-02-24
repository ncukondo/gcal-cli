# Task: Search Command (`gcal search`)

## Purpose

Implement the `gcal search` command to search events by keyword within a date range, with filtering and formatted output.

## Context

- Related files: `src/commands/search.ts` (new), `src/commands/search.test.ts` (new)
- Dependencies: 008-cli-entry, 009a-api-read, 002-timezone, 003-config, 004-filter, 005-output
- Related specs: `spec/commands.md` (`gcal search`), `spec/output.md` (Search output)

## Implementation Steps

- [ ] Write test: search passes query string to API `q` parameter
- [ ] Write test: default search range is 30 days
- [ ] Write test: `--days` overrides default search range
- [ ] Write test: `--from` and `--to` set explicit search range
- [ ] Write test: search fetches from all enabled calendars
- [ ] Implement search date range and query handling
- [ ] Write test: results are filtered by transparency and status
- [ ] Implement filter application
- [ ] Write test: text output shows match count and flat event list
- [ ] Write test: JSON output includes `query` field with events and count
- [ ] Implement search command handler
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal search "meeting"` returns matching events
- [ ] `gcal search "meeting" -f json` returns valid JSON with query field

## Acceptance Criteria

- [ ] Query string passed to Google Calendar API search
- [ ] Default range: 30 days; overridable with `--days`, `--from`/`--to`
- [ ] Filtering: `--busy`, `--free`, `--confirmed`, `--include-tentative`
- [ ] Text output: `Found N events matching "query":` header with flat event list
- [ ] JSON output: `{ success: true, data: { query, events, count } }`
- [ ] All unit tests pass
- [ ] `bun run lint` passes
