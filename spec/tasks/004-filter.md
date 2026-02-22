# Task: Event Filtering Module

## Purpose

Implement event filtering by transparency (busy/free) and status (confirmed/tentative). These filters are used by `list`, `search`, and other event-listing commands.

## Context

- Related files: `src/lib/filter.ts` (new), `src/lib/filter.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/commands.md` (Filtering options on `list` and `search`)

## Implementation Steps

- [ ] Write test: `filterByTransparency` with `--busy` returns only opaque events
- [ ] Write test: `filterByTransparency` with `--free` returns only transparent events
- [ ] Write test: `filterByTransparency` with no flag returns all events
- [ ] Implement `filterByTransparency`
- [ ] Write test: `filterByStatus` with `--confirmed` returns only confirmed events
- [ ] Write test: `filterByStatus` default (no `--include-tentative`) excludes tentative events
- [ ] Write test: `filterByStatus` with `--include-tentative` includes tentative events
- [ ] Write test: cancelled events are always excluded
- [ ] Implement `filterByStatus`
- [ ] Write test: `applyFilters` combines transparency and status filters correctly
- [ ] Implement `applyFilters` as a composable pipeline
- [ ] Refactor: ensure filter functions are pure and composable
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (pure functions, tested via unit tests)

## Acceptance Criteria

- [ ] `--busy` filters to opaque events only
- [ ] `--free` filters to transparent events only
- [ ] `--confirmed` filters to confirmed events only
- [ ] `--include-tentative` includes tentative events (excluded by default)
- [ ] Cancelled events are always excluded
- [ ] Filters compose correctly (e.g., `--busy --confirmed`)
- [ ] All unit tests pass
- [ ] `bun run lint` passes
