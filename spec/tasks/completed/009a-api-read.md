# Task: Google Calendar API Wrapper — Read Operations

## Purpose

Implement the read-only portion of the Google Calendar API wrapper: listing calendars, listing events, getting a single event. Includes response normalization helpers and pagination support.

## Context

- Related files: `src/lib/api.ts` (new), `src/lib/api.test.ts` (new)
- Dependencies: 001-types, 006-auth-module
- Related specs: `spec/architecture.md` (Module: `src/lib/api.ts`)

## Implementation Steps

- [x] Implement `normalizeEvent` helper: Google API event -> internal `CalendarEvent` type
- [x] Implement `normalizeCalendar` helper: Google API calendar -> internal `Calendar` type
- [x] Write test: `normalizeEvent` handles all-day events (date field)
- [x] Write test: `normalizeEvent` handles timed events (dateTime field with offset)
- [x] Write test: `normalizeCalendar` maps Google API fields to internal `Calendar` type
- [x] Write test: `listCalendars` returns normalized `Calendar[]` from Google API response
- [x] Write test: `listCalendars` handles pagination (nextPageToken)
- [x] Implement `listCalendars`
- [x] Write test: `listEvents` returns normalized `CalendarEvent[]` from Google API response
- [x] Write test: `listEvents` handles all-day events (date vs dateTime fields)
- [x] Write test: `listEvents` handles timed events with timezone offset
- [x] Write test: `listEvents` supports `timeMin`/`timeMax` parameters
- [x] Write test: `listEvents` supports `q` (search query) parameter
- [x] Write test: `listEvents` handles pagination
- [x] Implement `listEvents`
- [x] Write test: `getEvent` returns a single normalized event by ID
- [x] Write test: `getEvent` throws `NOT_FOUND` for non-existent event
- [x] Implement `getEvent`
- [x] Write test: API errors mapped to `API_ERROR` / `AUTH_REQUIRED` error codes
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (requires real API credentials; tested in 018-e2e-tests)

## Acceptance Criteria

- [x] `normalizeEvent` and `normalizeCalendar` correctly convert Google API responses
- [x] All-day and timed events are handled correctly
- [x] `listCalendars`, `listEvents`, `getEvent` are implemented
- [x] Pagination is handled transparently
- [x] API errors mapped to appropriate error codes (`NOT_FOUND`, `API_ERROR`, `AUTH_REQUIRED`)
- [x] All unit tests pass (Google API calls mocked)
- [x] `bun run lint` passes
