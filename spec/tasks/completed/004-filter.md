# Task: Event Filtering Module

## Purpose

Implement event filtering by transparency (busy/free) and status (confirmed/tentative). These filters are used by `list`, `search`, and other event-listing commands.

## Context

- Related files: `src/lib/filter.ts` (new), `src/lib/filter.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/commands.md` (Filtering options on `list` and `search`)

## Implementation Steps

- [x] Write test: `filterByTransparency` with `--busy` returns only opaque events
- [x] Write test: `filterByTransparency` with `--free` returns only transparent events
- [x] Write test: `filterByTransparency` with no flag returns all events
- [x] Implement `filterByTransparency`
- [x] Write test: `filterByStatus` with `--confirmed` returns only confirmed events
- [x] Write test: `filterByStatus` default (no `--include-tentative`) excludes tentative events
- [x] Write test: `filterByStatus` with `--include-tentative` includes tentative events
- [x] Write test: cancelled events are always excluded
- [x] Implement `filterByStatus`
- [x] Write test: `applyFilters` combines transparency and status filters correctly
- [x] Implement `applyFilters` as a composable pipeline
- [x] Refactor: ensure filter functions are pure and composable
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] Not applicable (pure functions, tested via unit tests)

## Acceptance Criteria

- [x] `--busy` filters to opaque events only
- [x] `--free` filters to transparent events only
- [x] `--confirmed` filters to confirmed events only
- [x] `--include-tentative` includes tentative events (excluded by default)
- [x] Cancelled events are always excluded
- [x] Filters compose correctly (e.g., `--busy --confirmed`)
- [x] All unit tests pass
- [x] `bun run lint` passes

## Completion

- **PR**: #4
- **Merged**: ✓
