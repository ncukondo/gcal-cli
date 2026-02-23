# Task: Timezone Resolution Module

## Purpose

Implement timezone resolution with the priority chain: CLI option > config file > system default. Provide utility functions for datetime conversion used by commands and output formatting.

## Context

- Related files: `src/lib/timezone.ts` (new), `src/lib/timezone.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/config.md` (Timezone Resolution), `spec/commands.md` (`--timezone` option)

## Implementation Steps

- [x] Write test: `resolveTimezone` returns CLI timezone when provided
- [x] Write test: `resolveTimezone` falls back to config timezone when CLI is undefined
- [x] Write test: `resolveTimezone` falls back to system timezone when both CLI and config are undefined
- [x] Write test: `resolveTimezone` throws on invalid timezone string
- [x] Implement `resolveTimezone(cliTz?: string, configTz?: string): string`
- [x] Write test: `formatDateTimeInZone` converts a Date to ISO 8601 string with offset in given timezone
- [x] Write test: `parseDateTimeInZone` parses date/datetime string in the given timezone
- [x] Implement `formatDateTimeInZone` and `parseDateTimeInZone` using `date-fns-tz`
- [x] Refactor: extract constants, ensure clean API surface
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] Not applicable (pure library module, tested via unit tests)

## Acceptance Criteria

- [x] `resolveTimezone` correctly applies priority: CLI > config > system
- [x] Invalid timezone names produce a clear error
- [x] `formatDateTimeInZone` outputs ISO 8601 with timezone offset (e.g., `2026-01-24T10:00:00+09:00`)
- [x] `parseDateTimeInZone` handles both date-only (`2026-01-24`) and datetime (`2026-01-24T10:00`) inputs
- [x] All unit tests pass
- [x] `bun run lint` passes

## Completion

- **PR**: #2
- **Merged**: ✓
