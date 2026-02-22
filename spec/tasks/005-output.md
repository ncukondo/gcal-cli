# Task: Enhance Output Formatting

## Purpose

Expand the output module to support date-grouped text output, JSON response envelope, error code formatting, and all command-specific output formats defined in the spec.

## Context

- Related files: `src/lib/output.ts`, `src/lib/output.test.ts`
- Dependencies: 001-types
- Related specs: `spec/output.md`

Current `output.ts` has basic `formatSuccess` and `formatError` but lacks structured JSON envelope, date grouping, and command-specific formatters.

## Implementation Steps

- [ ] Write test: `formatJsonSuccess` wraps data in `{ success: true, data: ... }` envelope
- [ ] Write test: `formatJsonError` wraps error in `{ success: false, error: { code, message } }` envelope
- [ ] Implement JSON envelope formatters (replace existing basic JSON formatting)
- [ ] Write test: `formatEventListText` groups events by date with day-of-week header
- [ ] Write test: `formatEventListText` formats all-day events as `[All Day]`
- [ ] Write test: `formatEventListText` formats timed events as `HH:MM-HH:MM`
- [ ] Write test: `formatEventListText` shows calendar name and transparency tag
- [ ] Implement `formatEventListText`
- [ ] Write test: `formatSearchResultText` shows match count and flat event list
- [ ] Implement `formatSearchResultText`
- [ ] Write test: `formatCalendarListText` shows enabled/disabled status with checkbox
- [ ] Implement `formatCalendarListText`
- [ ] Write test: `formatEventDetailText` shows full event details for `gcal show`
- [ ] Implement `formatEventDetailText`
- [ ] Write test: error code string mapping (e.g., `AUTH_REQUIRED`, `NOT_FOUND`)
- [ ] Implement `errorCodeToExitCode` mapping function
- [ ] Refactor: unify the output API surface
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (pure formatting functions, tested via unit tests)

## Acceptance Criteria

- [ ] JSON output uses `{ success: true/false, data/error: ... }` envelope
- [ ] Error responses include string error codes (`AUTH_REQUIRED`, `NOT_FOUND`, etc.)
- [ ] Text event list groups events by date with `YYYY-MM-DD (Day)` headers
- [ ] All-day events display as `[All Day]`, timed events as `HH:MM-HH:MM`
- [ ] Calendar list shows `[x]`/`[ ]` enabled/disabled checkboxes
- [ ] Search results show match count header
- [ ] All unit tests pass
- [ ] `bun run lint` passes
