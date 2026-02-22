# Task: Google Calendar API Wrapper — Read Operations

## Purpose

Implement the read-only portion of the Google Calendar API wrapper: listing calendars, listing events, getting a single event. Includes response normalization helpers and pagination support.

## Context

- Related files: `src/lib/api.ts` (new), `src/lib/api.test.ts` (new)
- Dependencies: 001-types, 006-auth-module
- Related specs: `spec/architecture.md` (Module: `src/lib/api.ts`)

## Implementation Steps

- [ ] Implement `normalizeEvent` helper: Google API event -> internal `CalendarEvent` type
- [ ] Implement `normalizeCalendar` helper: Google API calendar -> internal `Calendar` type
- [ ] Write test: `normalizeEvent` handles all-day events (date field)
- [ ] Write test: `normalizeEvent` handles timed events (dateTime field with offset)
- [ ] Write test: `normalizeCalendar` maps Google API fields to internal `Calendar` type
- [ ] Write test: `listCalendars` returns normalized `Calendar[]` from Google API response
- [ ] Write test: `listCalendars` handles pagination (nextPageToken)
- [ ] Implement `listCalendars`
- [ ] Write test: `listEvents` returns normalized `CalendarEvent[]` from Google API response
- [ ] Write test: `listEvents` handles all-day events (date vs dateTime fields)
- [ ] Write test: `listEvents` handles timed events with timezone offset
- [ ] Write test: `listEvents` supports `timeMin`/`timeMax` parameters
- [ ] Write test: `listEvents` supports `q` (search query) parameter
- [ ] Write test: `listEvents` handles pagination
- [ ] Implement `listEvents`
- [ ] Write test: `getEvent` returns a single normalized event by ID
- [ ] Write test: `getEvent` throws `NOT_FOUND` for non-existent event
- [ ] Implement `getEvent`
- [ ] Write test: API errors mapped to `API_ERROR` / `AUTH_REQUIRED` error codes
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (requires real API credentials; tested in 018-e2e-tests)

## Acceptance Criteria

- [ ] `normalizeEvent` and `normalizeCalendar` correctly convert Google API responses
- [ ] All-day and timed events are handled correctly
- [ ] `listCalendars`, `listEvents`, `getEvent` are implemented
- [ ] Pagination is handled transparently
- [ ] API errors mapped to appropriate error codes (`NOT_FOUND`, `API_ERROR`, `AUTH_REQUIRED`)
- [ ] All unit tests pass (Google API calls mocked)
- [ ] `bun run lint` passes
