# Task: List Command (`gcal list`)

## Purpose

Implement the `gcal list` command to list events within a date range, with filtering, timezone support, and date-grouped output.

## Context

- Related files: `src/commands/list.ts` (new), `src/commands/list.test.ts` (new)
- Dependencies: 008-cli-entry, 009a-api-read, 002-timezone, 003-config, 004-filter, 005-output
- Related specs: `spec/commands.md` (`gcal list`), `spec/output.md` (Event list output)

## Implementation Steps

- [ ] Write test: `--today` sets date range to current day in resolved timezone
- [ ] Write test: `--days <n>` sets date range to next n days (default 7)
- [ ] Write test: `--from` and `--to` set explicit date range
- [ ] Write test: events fetched from all enabled calendars
- [ ] Write test: `-c` flag overrides config calendars
- [ ] Implement date range resolution logic
- [ ] Write test: events are filtered by transparency (`--busy`, `--free`)
- [ ] Write test: events are filtered by status (`--confirmed`, `--include-tentative`)
- [ ] Implement filter application
- [ ] Write test: text output groups events by date with day-of-week header
- [ ] Write test: JSON output returns events array with count in envelope
- [ ] Implement list command handler
- [ ] Write test: `--quiet` flag outputs minimal event info
- [ ] Write test: `--timezone` flag overrides event display timezone
- [ ] Register command with CLI
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal list --today` returns today's events
- [ ] `gcal list --days 7` returns events for next 7 days
- [ ] `gcal list -f json --today` returns valid JSON output

## Acceptance Criteria

- [ ] Date range options: `--today`, `--days`, `--from`/`--to` work correctly
- [ ] Events fetched from enabled calendars (or `-c` override)
- [ ] Filtering: `--busy`, `--free`, `--confirmed`, `--include-tentative`
- [ ] Text output: date-grouped with all-day and timed event formatting
- [ ] JSON output: `{ success: true, data: { events: [...], count: N } }`
- [ ] Timezone applied to output display
- [ ] All unit tests pass
- [ ] `bun run lint` passes
