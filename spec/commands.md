# Command Specifications

## Global Options

```
--format, -f <format>     Output format: text (default) | json
--calendar, -c <id>       Target calendar ID (can be specified multiple times)
--timezone, --tz <zone>   Timezone (e.g., Asia/Tokyo). Overrides config
--quiet, -q               Minimal output (only essential data)
--help, -h                Show help
```

## Commands

### `gcal calendars`

List available calendars (filtered by config).

```bash
gcal calendars
gcal calendars -f json
```

### `gcal list`

List events within a date range. Includes both timed and all-day events.

```bash
gcal list [options]

Options:
  --from <date>     Start date (ISO 8601 or YYYY-MM-DD)
  --to <date>       End date (ISO 8601 or YYYY-MM-DD)
  --today           Shorthand for today's events
  --days <n>        Events for next n days (default: 7)

Filtering:
  --busy            Show only busy (opaque) events
  --free            Show only free (transparent) events
  --confirmed       Show only confirmed events
  --include-tentative   Include tentative events (excluded by default)
```

Examples:
```bash
gcal list --today
gcal list --from 2026-01-23 --to 2026-01-30
gcal list --days 14
gcal list -c calendar1 -c calendar2 --today
gcal list -f json --today
gcal list --tz America/New_York --today
gcal list --today --busy
gcal list --days 7 --confirmed
```

### `gcal search`

Search events by keyword.

```bash
gcal search <query> [options]

Options:
  --from <date>     Start date for search range
  --to <date>       End date for search range
  --days <n>        Search within next n days (default: 30). Negative values search past days.

Filtering:
  --busy            Show only busy (opaque) events
  --free            Show only free (transparent) events
  --confirmed       Show only confirmed events
  --include-tentative   Include tentative events (excluded by default)
```

Examples:
```bash
gcal search "meeting"
gcal search "review" --days 60
gcal search "project" --from 2026-01-01 --to 2026-03-31
gcal search "meeting" -f json
gcal search "meeting" --confirmed --busy
gcal search "meeting" --days -30
```

Stderr output:
```
Searching: 2026-01-25 to 2026-02-24
Tip: Use --days <n> or --from/--to to change the search range.
```

### `gcal add`

Create a new event.

```bash
gcal add [options]

Options:
  --title, -t <title>           Event title (required)
  --start, -s <datetime>        Start datetime (required, ISO 8601)
  --end, -e <datetime>          End datetime (required, ISO 8601)
  --all-day                     Create all-day event (use date only)
  --description, -d <text>      Event description
  --calendar, -c <id>           Target calendar (uses first enabled if omitted)
  --busy                        Mark as busy (default)
  --free                        Mark as free (transparent)
```

Datetime is interpreted in the configured timezone (or --tz override).

Examples:
```bash
gcal add -t "Meeting" -s "2026-01-24T10:00" -e "2026-01-24T11:00"
gcal add -t "Vacation" -s "2026-01-24" -e "2026-01-26" --all-day
gcal add -t "Focus Time" -s "2026-01-24T09:00" -e "2026-01-24T12:00" --free
gcal add -t "Call" -s "2026-01-24T09:00" -e "2026-01-24T10:00" --tz America/New_York
```

### `gcal show`

Show event details.

```bash
gcal show <event-id>
```

### `gcal update`

Update an existing event.

```bash
gcal update <event-id> [options]

Options:
  --title, -t <title>           New title
  --start, -s <datetime>        New start datetime
  --end, -e <datetime>          New end datetime
  --description, -d <text>      New description
  --busy                        Mark as busy
  --free                        Mark as free
```

Examples:
```bash
gcal update abc123 -t "Updated Meeting"
gcal update abc123 -s "2026-01-24T11:00" -e "2026-01-24T12:00"
gcal update abc123 --free
```

### `gcal delete`

Delete an event.

```bash
gcal delete <event-id>
gcal delete <event-id> --quiet
```

### `gcal auth`

Manage OAuth authentication.

```bash
gcal auth              # Start OAuth flow
gcal auth --status     # Check authentication status
gcal auth --logout     # Remove stored credentials
```

### `gcal init`

Initialize config file with calendars from Google Calendar.

```bash
gcal init [options]

Options:
  --force              Overwrite existing config file
  --all                Enable all calendars (default: primary only)
  --local              Create ./gcal-cli.toml in current directory
  --timezone <zone>    Set timezone (default: system timezone)
```

If not authenticated, automatically starts the OAuth flow before proceeding.

Default output: `~/.config/gcal-cli/config.toml`
With `--local`: `./gcal-cli.toml`

Examples:
```bash
gcal init                          # Primary calendar only → ~/.config/gcal-cli/config.toml
gcal init --all                    # All calendars enabled
gcal init --local                  # Create ./gcal-cli.toml
gcal init --force --timezone Asia/Tokyo
gcal init -f json
```
