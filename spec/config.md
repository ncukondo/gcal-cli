# Configuration Specification

## Config File Location

```
~/.config/gcal-cli/config.toml
```

Alternative locations (checked in order):
1. `$GCAL_CLI_CONFIG` environment variable
2. `./gcal-cli.toml` (current directory)
3. `~/.config/gcal-cli/config.toml`

## Config File Format

```toml
# Timezone for display and input interpretation
# Falls back to system timezone if not specified
timezone = "Asia/Tokyo"

# Default output format: "text" (default) or "json"
default_format = "text"

# Calendar configurations
# Only calendars with enabled = true are used by default
# Command-line -c option overrides this setting

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true

[[calendars]]
id = "family@group.calendar.google.com"
name = "Family"
enabled = true

[[calendars]]
id = "work@group.calendar.google.com"
name = "Work Main"
enabled = false
```

## Timezone Resolution

Priority order:
1. `--timezone` / `--tz` command-line option
2. `timezone` in config.toml
3. System default timezone

## Calendar Selection Logic

1. If `-c` option is provided: use specified calendars only (overrides config)
2. Otherwise: use calendars with `enabled = true` in config
3. If no config exists: auto-discover calendars containing "main" in name

## Calendar Discovery

`gcal init` generates the initial config file:
1. Fetch all calendars from Google Calendar API
2. Enable only the primary calendar by default (use `--all` to enable all)
3. Write config.toml to default or `--local` location

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GCAL_CLI_CONFIG` | Custom config file path |
| `GCAL_CLI_FORMAT` | Default output format |
| `GCAL_CLI_TIMEZONE` | Default timezone |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |

## Credentials Storage

OAuth tokens are stored at:
```
~/.config/gcal-cli/credentials.json
```

This file contains refresh tokens and should be kept secure.
