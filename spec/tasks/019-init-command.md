# Task: Init Command (`gcal init`)

## Purpose

Generate a config file from the CLI by fetching calendars from Google Calendar API.
By default, only the primary calendar is enabled. This eliminates the need to manually edit TOML.

## Context

- Related files: src/commands/init.ts (new), src/commands/init.test.ts (new), src/lib/config.ts (modify), src/commands/index.ts (modify)
- Dependencies: 007-auth-command, 009a-api-read, 003-config
- Related specs: spec/commands.md, spec/config.md, spec/output.md

## Implementation Steps

- [ ] Add `generateConfigToml()` and `getDefaultConfigPath()` to config.ts (test first)
- [ ] Create `createInitCommand()` test and implementation
- [ ] Implement `handleInit()` happy path (test first) — auto-start OAuth if unauthenticated
- [ ] Add `--all` option: enable all calendars (test first)
- [ ] Add `--force` option: overwrite existing config file (test first)
- [ ] Add `--local` option: write to `./gcal-cli.toml` (test first)
- [ ] Add `--timezone` option: override timezone (test first)
- [ ] Handle edge cases: existing file without --force, no primary calendar, 0 calendars, API error (test first)
- [ ] Register command in index.ts
- [ ] Verify lint + test:unit pass

## E2E Test

- [ ] `gcal init` creates config.toml with primary calendar enabled
- [ ] `gcal init --all` creates config.toml with all calendars enabled
- [ ] `gcal init --local` creates ./gcal-cli.toml
- [ ] `gcal init` when unauthenticated triggers OAuth flow then proceeds

## Acceptance Criteria

- [ ] Unauthenticated state auto-starts OAuth flow, then continues init
- [ ] Default: only primary calendar has `enabled: true`
- [ ] `--all`: all calendars have `enabled: true`
- [ ] `--local`: outputs to `./gcal-cli.toml`
- [ ] `--force`: overwrites existing config file
- [ ] Generated TOML round-trips through `parseConfig()` correctly
- [ ] text / json / quiet output formats supported
- [ ] Appropriate exit codes on error (existing file=1, no calendars=1, API error=1)
