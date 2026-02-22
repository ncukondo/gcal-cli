# Task: Integration Tests

## Purpose

Write integration tests that verify cross-module interactions: config + API, filter + output, timezone + list, etc. These tests use test fixtures and mocks but verify that modules work together correctly.

## Context

- Related files: `tests/integration/` (new directory)
- Dependencies: 010-016 (all commands implemented)
- Related specs: `spec/testing.md` (Integration Tests)

## Implementation Steps

- [ ] Write test: config loading + calendar selection + API call integration
- [ ] Write test: list command end-to-end with mocked API (config → API → filter → output)
- [ ] Write test: search command end-to-end with mocked API
- [ ] Write test: add command with timezone resolution and API call
- [ ] Write test: update command with partial fields and API call
- [ ] Write test: delete command with API call and output formatting
- [ ] Write test: auth flow + API client creation integration
- [ ] Write test: error propagation from API through command to output
- [ ] Write test: JSON output envelope consistency across all commands
- [ ] Write test: text output formatting consistency across list/search
- [ ] Write test: calendar override (`-c`) flows through to API calls
- [ ] Write test: timezone override (`--tz`) flows through to datetime display
- [ ] Verify `bun run test:integration` passes
- [ ] Verify `bun run lint` passes

## E2E Test

- [ ] Not applicable (these are the integration tests themselves)

## Acceptance Criteria

- [ ] Integration tests cover config → command → API → output pipeline
- [ ] Tests verify module boundaries and data flow
- [ ] All tests use mocked Google API (no real API calls)
- [ ] Tests in `tests/integration/` directory
- [ ] `bun run test:integration` passes
- [ ] `bun run lint` passes
