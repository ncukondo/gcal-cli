# Authentication Specification

## OAuth 2.0 Flow

### Required Scopes

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
```

### Authentication Steps

1. User runs `gcal auth`
2. CLI starts local HTTP server on available port
3. Opens browser to Google OAuth consent page
4. User grants permissions
5. Google redirects to local server with auth code
6. CLI exchanges code for access/refresh tokens
7. Tokens stored in `~/.config/gcal-cli/credentials.json`

### Token Refresh

- Access tokens expire after 1 hour
- CLI automatically refreshes using stored refresh token
- If refresh fails, user must re-authenticate

## Credentials File Format

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expiry_date": 1706000000000
}
```

## Google Cloud Setup

Users need to create OAuth credentials in Google Cloud Console:

1. Create project at https://console.cloud.google.com
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials (Desktop app)
4. Copy the **Client ID** and **Client Secret** from the credentials page

### Client Configuration

When running `gcal auth` or `gcal init` without credentials, the CLI will
interactively prompt for Client ID and Client Secret, then save them
automatically to `~/.config/gcal-cli/client_secret.json`.

Alternatively, set environment variables:
```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
```

Note: Interactive prompting only occurs in text format. JSON format
(`--format json`) returns an error instead, preserving automation behavior.

## Auth Commands

### `gcal auth`

Initiates OAuth flow. If already authenticated, shows current status.
If no client credentials are configured, interactively prompts for
Client ID and Client Secret (text format only).

### `gcal auth --status`

Text output:
```
Authenticated as: user@example.com
Token expires: 2026-01-23 12:00:00
```

JSON output:
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "email": "user@example.com",
    "expires_at": "2026-01-23T12:00:00Z"
  }
}
```

### `gcal auth --logout`

Removes stored credentials and revokes tokens.
