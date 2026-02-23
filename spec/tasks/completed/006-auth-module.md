# Task: OAuth Authentication Module

## Purpose

Implement the OAuth 2.0 flow for Google Calendar API: token storage, retrieval, refresh, and revocation. This module handles all credential management without any CLI command concerns.

## Context

- Related files: `src/lib/auth.ts` (new), `src/lib/auth.test.ts` (new)
- Dependencies: 003-config (for credentials file path and client secret discovery)
- Related specs: `spec/auth.md`

## Implementation Steps

- [x] Write test: `getClientCredentials` reads from `client_secret.json` file
- [x] Write test: `getClientCredentials` falls back to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env vars
- [x] Write test: `getClientCredentials` throws `AUTH_REQUIRED` when neither source exists
- [x] Implement `getClientCredentials`
- [x] Write test: `loadTokens` reads tokens from `~/.config/gcal-cli/credentials.json`
- [x] Write test: `loadTokens` returns null when no credentials file exists
- [x] Write test: `saveTokens` writes token data to credentials file
- [x] Implement `loadTokens` and `saveTokens`
- [x] Write test: `isTokenExpired` returns true when `expiry_date` is in the past
- [x] Write test: `isTokenExpired` returns false when `expiry_date` is in the future
- [x] Implement `isTokenExpired`
- [x] Write test: `refreshAccessToken` calls Google token endpoint and updates stored tokens
- [x] Write test: `refreshAccessToken` throws `AUTH_EXPIRED` when refresh fails
- [x] Implement `refreshAccessToken` using `googleapis`
- [x] Write test: `getAuthenticatedClient` returns OAuth2 client with valid token
- [x] Write test: `getAuthenticatedClient` auto-refreshes expired token
- [x] Implement `getAuthenticatedClient`
- [x] Write test: `startOAuthFlow` starts local server and generates auth URL
- [x] Implement `startOAuthFlow` (local HTTP server, browser open, code exchange)
- [x] Write test: `revokeTokens` calls revocation endpoint and deletes credentials file
- [x] Implement `revokeTokens`
- [x] Verify `bun run test:unit` and `bun run lint` pass

## E2E Test

- [x] Not applicable (requires real Google credentials; tested in 018-e2e-tests)

## Acceptance Criteria

- [x] Client credentials loaded from file or environment variables
- [x] OAuth flow: local server, browser redirect, code exchange, token storage
- [x] Tokens stored at `~/.config/gcal-cli/credentials.json`
- [x] Automatic token refresh when access token is expired
- [x] `AUTH_REQUIRED` error when no credentials configured
- [x] `AUTH_EXPIRED` error when refresh token is invalid
- [x] Token revocation deletes stored credentials
- [x] All unit tests pass (Google API calls mocked)
- [x] `bun run lint` passes
