# Task: TOML Config Management

## Purpose

Implement config file parsing, discovery (multi-location), and calendar selection logic. This module manages user preferences and calendar targeting.

## Context

- Related files: `src/lib/config.ts` (new), `src/lib/config.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/config.md`

## Implementation Steps

- [x] Write test: `findConfigPath` returns `$GCAL_CLI_CONFIG` path when env var is set
- [x] Write test: `findConfigPath` returns `./gcal-cli.toml` when present in cwd
- [x] Write test: `findConfigPath` returns `~/.config/gcal-cli/config.toml` as fallback
- [x] Write test: `findConfigPath` returns `null` when no config exists
- [x] Implement `findConfigPath` function
- [x] Write test: `parseConfig` correctly parses a valid TOML config string into `AppConfig`
- [x] Write test: `parseConfig` handles missing optional fields with defaults
- [x] Write test: `parseConfig` throws on invalid TOML syntax
- [x] Implement `parseConfig` using `smol-toml`
- [x] Write test: `loadConfig` reads and parses config from disk (mock filesystem)
- [x] Implement `loadConfig`
- [x] Write test: `getEnabledCalendars` returns only calendars with `enabled = true`
- [x] Write test: `selectCalendars` returns CLI-specified calendars when `-c` provided (overrides config)
- [x] Write test: `selectCalendars` returns enabled calendars from config when no CLI override
- [x] Implement `getEnabledCalendars` and `selectCalendars`
- [x] Refactor: clean up, ensure types are consistent
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] Not applicable (filesystem interactions mocked in unit tests)

## Acceptance Criteria

- [x] Config file discovery checks 3 locations in correct order: env var > cwd > default
- [x] TOML parsing produces correct `AppConfig` structure
- [x] Missing config file handled gracefully (returns default config)
- [x] Calendar selection logic: CLI `-c` overrides config-enabled calendars
- [x] Environment variables (`GCAL_CLI_FORMAT`, `GCAL_CLI_TIMEZONE`) are respected
- [x] All unit tests pass
- [x] `bun run lint` passes

## Completion

- **PR**: #3
- **Merged**: ✓
