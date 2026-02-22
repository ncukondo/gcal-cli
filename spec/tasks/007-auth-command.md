# Task: Auth Command (`gcal auth`)

## Purpose

Implement the `gcal auth` CLI command with subflags: default (start OAuth), `--status` (check auth state), and `--logout` (remove credentials).

## Context

- Related files: `src/commands/auth.ts` (new), `src/commands/auth.test.ts` (new)
- Dependencies: 006-auth-module, 005-output
- Related specs: `spec/auth.md` (Auth Commands), `spec/commands.md` (`gcal auth`)

## Implementation Steps

- [ ] Write test: `gcal auth` invokes OAuth flow when not authenticated
- [ ] Write test: `gcal auth` shows status when already authenticated
- [ ] Implement default `auth` command handler
- [ ] Write test: `gcal auth --status` outputs text format with email and token expiry
- [ ] Write test: `gcal auth --status -f json` outputs JSON with `authenticated`, `email`, `expires_at`
- [ ] Write test: `gcal auth --status` outputs error when not authenticated
- [ ] Implement `--status` handler
- [ ] Write test: `gcal auth --logout` removes credentials and outputs confirmation
- [ ] Write test: `gcal auth --logout` handles case when not authenticated
- [ ] Implement `--logout` handler
- [ ] Register `auth` command in commander (do not register in main CLI yet — that is task 008)
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] `gcal auth --status` returns current authentication state
- [ ] `gcal auth --logout` removes stored credentials

## Acceptance Criteria

- [ ] `gcal auth` starts OAuth flow and stores tokens on success
- [ ] `gcal auth --status` shows email and token expiry (text and JSON)
- [ ] `gcal auth --logout` revokes tokens and deletes credentials file
- [ ] Appropriate exit codes: 0 on success, 2 on auth errors
- [ ] Output respects `--format` flag
- [ ] All unit tests pass
- [ ] `bun run lint` passes
