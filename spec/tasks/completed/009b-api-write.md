# Task: Google Calendar API Wrapper — Write Operations

## Purpose

Implement the write portion of the Google Calendar API wrapper: creating, updating, and deleting events. Builds on the normalization helpers and API client from 009a.

## Context

- Related files: `src/lib/api.ts` (modify), `src/lib/api.test.ts` (modify)
- Dependencies: 009a-api-read
- Related specs: `spec/architecture.md` (Module: `src/lib/api.ts`)

## Implementation Steps

- [ ] Write test: `createEvent` sends correct payload for timed event and returns normalized event
- [ ] Write test: `createEvent` handles all-day event creation (date vs dateTime)
- [ ] Write test: `createEvent` sets transparency (opaque/transparent)
- [ ] Implement `createEvent`
- [ ] Write test: `updateEvent` sends partial update and returns normalized updated event
- [ ] Write test: `updateEvent` handles time field updates with timezone
- [ ] Implement `updateEvent`
- [ ] Write test: `deleteEvent` sends delete request and returns success
- [ ] Write test: `deleteEvent` throws `NOT_FOUND` for non-existent event
- [ ] Implement `deleteEvent`
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (requires real API credentials; tested in 018-e2e-tests)

## Acceptance Criteria

- [ ] `createEvent` supports timed and all-day events with correct payload
- [ ] `updateEvent` sends only changed fields (partial update)
- [ ] `deleteEvent` handles success and NOT_FOUND cases
- [ ] All write operations return normalized internal types
- [ ] API errors mapped to appropriate error codes
- [ ] All unit tests pass (Google API calls mocked)
- [ ] `bun run lint` passes
