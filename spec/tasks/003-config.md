# Task: TOML Config Management

## Purpose

Implement config file parsing, discovery (multi-location), and calendar selection logic. This module manages user preferences and calendar targeting.

## Context

- Related files: `src/lib/config.ts` (new), `src/lib/config.test.ts` (new)
- Dependencies: 001-types
- Related specs: `spec/config.md`

## Implementation Steps

- [ ] Write test: `findConfigPath` returns `$GCAL_CLI_CONFIG` path when env var is set
- [ ] Write test: `findConfigPath` returns `./gcal-cli.toml` when present in cwd
- [ ] Write test: `findConfigPath` returns `~/.config/gcal-cli/config.toml` as fallback
- [ ] Write test: `findConfigPath` returns `null` when no config exists
- [ ] Implement `findConfigPath` function
- [ ] Write test: `parseConfig` correctly parses a valid TOML config string into `AppConfig`
- [ ] Write test: `parseConfig` handles missing optional fields with defaults
- [ ] Write test: `parseConfig` throws on invalid TOML syntax
- [ ] Implement `parseConfig` using `smol-toml`
- [ ] Write test: `loadConfig` reads and parses config from disk (mock filesystem)
- [ ] Implement `loadConfig`
- [ ] Write test: `getEnabledCalendars` returns only calendars with `enabled = true`
- [ ] Write test: `selectCalendars` returns CLI-specified calendars when `-c` provided (overrides config)
- [ ] Write test: `selectCalendars` returns enabled calendars from config when no CLI override
- [ ] Implement `getEnabledCalendars` and `selectCalendars`
- [ ] Refactor: clean up, ensure types are consistent
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (filesystem interactions mocked in unit tests)

## Acceptance Criteria

- [ ] Config file discovery checks 3 locations in correct order: env var > cwd > default
- [ ] TOML parsing produces correct `AppConfig` structure
- [ ] Missing config file handled gracefully (returns default config)
- [ ] Calendar selection logic: CLI `-c` overrides config-enabled calendars
- [ ] Environment variables (`GCAL_CLI_FORMAT`, `GCAL_CLI_TIMEZONE`) are respected
- [ ] All unit tests pass
- [ ] `bun run lint` passes
