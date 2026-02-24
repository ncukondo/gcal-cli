# Task: E2E Tests

## Purpose

Write end-to-end tests that exercise the full CLI against the real Google Calendar API. These tests verify actual behavior and catch issues that mocked tests miss.

## Context

- Related files: `tests/e2e/` (new directory)
- Dependencies: 017-integration-tests
- Related specs: `spec/testing.md` (E2E Tests, E2E Test Policy)

## Implementation Steps

- [ ] Set up E2E test infrastructure (credentials loading, test calendar setup)
- [ ] Write test: `gcal auth --status` returns authenticated state
- [ ] Write test: `gcal calendars` lists real calendars
- [ ] Write test: `gcal calendars -f json` returns valid JSON
- [ ] Write test: `gcal add` creates a real event, capture event ID
- [ ] Write test: `gcal show <id>` shows the created event
- [ ] Write test: `gcal list --today` includes the created event
- [ ] Write test: `gcal search "<title>"` finds the created event
- [ ] Write test: `gcal update <id> -t "Updated"` modifies the event
- [ ] Write test: `gcal show <id>` reflects the update
- [ ] Write test: `gcal delete <id>` removes the event
- [ ] Write test: `gcal show <id>` returns NOT_FOUND after deletion
- [ ] Write test: `gcal list -f json --today` returns valid JSON output
- [ ] Write test: `gcal list --today --busy` filtering works with real data
- [ ] Write test: timezone override displays correct times
- [ ] Add cleanup logic: delete any test events on test teardown
- [ ] Verify `bun run test:e2e` passes (requires valid credentials)
- [ ] Verify `bun run lint` passes

## E2E Test

- [ ] This task IS the E2E tests

## Acceptance Criteria

- [ ] Full CRUD lifecycle tested: create → read → update → delete
- [ ] All commands tested with both text and JSON output
- [ ] Filtering and timezone options tested with real data
- [ ] Test cleanup: no orphaned test events left in calendar
- [ ] Tests in `tests/e2e/` directory
- [ ] `bun run test:e2e` passes with valid OAuth credentials
- [ ] Tests follow E2E test policy: no mocks, no skipping failures
- [ ] `bun run lint` passes
