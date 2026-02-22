# Task: Timezone Resolution Module

## Purpose

Implement timezone resolution with the priority chain: CLI option > config file > system default. Provide utility functions for datetime conversion used by commands and output formatting.

## Context

- Related files: `src/lib/timezone.ts` (new), `src/lib/timezone.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/config.md` (Timezone Resolution), `spec/commands.md` (`--timezone` option)

## Implementation Steps

- [ ] Write test: `resolveTimezone` returns CLI timezone when provided
- [ ] Write test: `resolveTimezone` falls back to config timezone when CLI is undefined
- [ ] Write test: `resolveTimezone` falls back to system timezone when both CLI and config are undefined
- [ ] Write test: `resolveTimezone` throws on invalid timezone string
- [ ] Implement `resolveTimezone(cliTz?: string, configTz?: string): string`
- [ ] Write test: `formatDateTimeInZone` converts a Date to ISO 8601 string with offset in given timezone
- [ ] Write test: `parseDateTimeInZone` parses date/datetime string in the given timezone
- [ ] Implement `formatDateTimeInZone` and `parseDateTimeInZone` using `date-fns-tz`
- [ ] Refactor: extract constants, ensure clean API surface
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (pure library module, tested via unit tests)

## Acceptance Criteria

- [ ] `resolveTimezone` correctly applies priority: CLI > config > system
- [ ] Invalid timezone names produce a clear error
- [ ] `formatDateTimeInZone` outputs ISO 8601 with timezone offset (e.g., `2026-01-24T10:00:00+09:00`)
- [ ] `parseDateTimeInZone` handles both date-only (`2026-01-24`) and datetime (`2026-01-24T10:00`) inputs
- [ ] All unit tests pass
- [ ] `bun run lint` passes
