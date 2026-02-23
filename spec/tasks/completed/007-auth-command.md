# Task: Auth Command (`gcal auth`)

## Purpose

Implement the `gcal auth` CLI command with subflags: default (start OAuth), `--status` (check auth state), and `--logout` (remove credentials).

## Context

- Related files: `src/commands/auth.ts` (new), `src/commands/auth.test.ts` (new)
- Dependencies: 006-auth-module, 005-output
- Related specs: `spec/auth.md` (Auth Commands), `spec/commands.md` (`gcal auth`)

## Implementation Steps

- [x] Write test: `gcal auth` invokes OAuth flow when not authenticated
- [x] Write test: `gcal auth` shows status when already authenticated
- [x] Implement default `auth` command handler
- [x] Write test: `gcal auth --status` outputs text format with email and token expiry
- [x] Write test: `gcal auth --status -f json` outputs JSON with `authenticated`, `email`, `expires_at`
- [x] Write test: `gcal auth --status` outputs error when not authenticated
- [x] Implement `--status` handler
- [x] Write test: `gcal auth --logout` removes credentials and outputs confirmation
- [x] Write test: `gcal auth --logout` handles case when not authenticated
- [x] Implement `--logout` handler
- [x] Register `auth` command in commander (do not register in main CLI yet — that is task 008)
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] `gcal auth --status` returns current authentication state
- [x] `gcal auth --logout` removes stored credentials

## Acceptance Criteria

- [x] `gcal auth` starts OAuth flow and stores tokens on success
- [x] `gcal auth --status` shows email and token expiry (text and JSON)
- [x] `gcal auth --logout` revokes tokens and deletes credentials file
- [x] Appropriate exit codes: 0 on success, 2 on auth errors
- [x] Output respects `--format` flag
- [x] All unit tests pass
- [x] `bun run lint` passes
