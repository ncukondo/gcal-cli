# Task: OAuth Authentication Module

## Purpose

Implement the OAuth 2.0 flow for Google Calendar API: token storage, retrieval, refresh, and revocation. This module handles all credential management without any CLI command concerns.

## Context

- Related files: `src/lib/auth.ts` (new), `src/lib/auth.test.ts` (new)
- Dependencies: 003-config (for credentials file path and client secret discovery)
- Related specs: `spec/auth.md`

## Implementation Steps

- [ ] Write test: `getClientCredentials` reads from `client_secret.json` file
- [ ] Write test: `getClientCredentials` falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars
- [ ] Write test: `getClientCredentials` throws `AUTH_REQUIRED` when neither source exists
- [ ] Implement `getClientCredentials`
- [ ] Write test: `loadTokens` reads tokens from `~/.config/gcal-cli/credentials.json`
- [ ] Write test: `loadTokens` returns null when no credentials file exists
- [ ] Write test: `saveTokens` writes token data to credentials file
- [ ] Implement `loadTokens` and `saveTokens`
- [ ] Write test: `isTokenExpired` returns true when `expiry_date` is in the past
- [ ] Write test: `isTokenExpired` returns false when `expiry_date` is in the future
- [ ] Implement `isTokenExpired`
- [ ] Write test: `refreshAccessToken` calls Google token endpoint and updates stored tokens
- [ ] Write test: `refreshAccessToken` throws `AUTH_EXPIRED` when refresh fails
- [ ] Implement `refreshAccessToken` using `googleapis`
- [ ] Write test: `getAuthenticatedClient` returns OAuth2 client with valid token
- [ ] Write test: `getAuthenticatedClient` auto-refreshes expired token
- [ ] Implement `getAuthenticatedClient`
- [ ] Write test: `startOAuthFlow` starts local server and generates auth URL
- [ ] Implement `startOAuthFlow` (local HTTP server, browser open, code exchange)
- [ ] Write test: `revokeTokens` calls revocation endpoint and deletes credentials file
- [ ] Implement `revokeTokens`
- [ ] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [ ] Not applicable (requires real Google credentials; tested in 018-e2e-tests)

## Acceptance Criteria

- [ ] Client credentials loaded from file or environment variables
- [ ] OAuth flow: local server, browser redirect, code exchange, token storage
- [ ] Tokens stored at `~/.config/gcal-cli/credentials.json`
- [ ] Automatic token refresh when access token is expired
- [ ] `AUTH_REQUIRED` error when no credentials configured
- [ ] `AUTH_EXPIRED` error when refresh token is invalid
- [ ] Token revocation deletes stored credentials
- [ ] All unit tests pass (Google API calls mocked)
- [ ] `bun run lint` passes
