# Task: Enhance Output Formatting

## Purpose

Expand the output module to support date-grouped text output, JSON response envelope, error code formatting, and all command-specific output formats defined in the spec.

## Context

- Related files: `src/lib/output.ts`, `src/lib/output.test.ts`
- Dependencies: 001-types
- Related specs: `spec/output.md`

Current `output.ts` has basic `formatSuccess` and `formatError` but lacks structured JSON envelope, date grouping, and command-specific formatters.

## Implementation Steps

- [x] Write test: `formatJsonSuccess` wraps data in `{ success: true, data: ... }` envelope
- [x] Write test: `formatJsonError` wraps error in `{ success: false, error: { code, message } }` envelope
- [x] Implement JSON envelope formatters (replace existing basic JSON formatting)
- [x] Write test: `formatEventListText` groups events by date with day-of-week header
- [x] Write test: `formatEventListText` formats all-day events as `[All Day]`
- [x] Write test: `formatEventListText` formats timed events as `HH:MM-HH:MM`
- [x] Write test: `formatEventListText` shows calendar name and transparency tag
- [x] Implement `formatEventListText`
- [x] Write test: `formatSearchResultText` shows match count and flat event list
- [x] Implement `formatSearchResultText`
- [x] Write test: `formatCalendarListText` shows enabled/disabled status with checkbox
- [x] Implement `formatCalendarListText`
- [x] Write test: `formatEventDetailText` shows full event details for `gcal show`
- [x] Implement `formatEventDetailText`
- [x] Write test: error code string mapping (e.g., `AUTH_REQUIRED`, `NOT_FOUND`)
- [x] Implement `errorCodeToExitCode` mapping function
- [x] Refactor: unify the output API surface
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] Not applicable (pure formatting functions, tested via unit tests)

## Acceptance Criteria

- [x] JSON output uses `{ success: true/false, data/error: ... }` envelope
- [x] Error responses include string error codes (`AUTH_REQUIRED`, `NOT_FOUND`, etc.)
- [x] Text event list groups events by date with `YYYY-MM-DD (Day)` headers
- [x] All-day events display as `[All Day]`, timed events as `HH:MM-HH:MM`
- [x] Calendar list shows `[x]`/`[ ]` enabled/disabled checkboxes
- [x] Search results show match count header
- [x] All unit tests pass
- [x] `bun run lint` passes

## Completion

- **PR**: #5
- **Merged**: ✓
