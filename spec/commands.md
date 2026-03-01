# Command Specifications

## Global Options

```
--format, -f <format>     Output format: text (default) | json
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
  --calendar, -c <id>  Target calendar ID (repeatable, multiple calendars)
  --from <date>     Start date (ISO 8601 or YYYY-MM-DD)
  --to <date>       End date (ISO 8601 or YYYY-MM-DD)
  --today           Shorthand for today's events
  --days <n>        Events for next n days (default: 7)

  Mutual exclusivity:
    --today, --days, --from are mutually exclusive
    --days and --to are mutually exclusive
    --busy and --free are mutually exclusive

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

Quiet mode (`-q`): Same compact format as `list` (`MM/DD HH:MM-HH:MM Title`). Stderr messages suppressed.

### `gcal search`

Search events by keyword.

```bash
gcal search <query> [options]

Options:
  --calendar, -c <id>  Target calendar ID (repeatable, multiple calendars)
  --from <date>     Start date for search range
  --to <date>       End date for search range
  --days <n>        Search within next n days (default: 30). Negative values search past days.

  Mutual exclusivity:
    --days and --from are mutually exclusive
    --days and --to are mutually exclusive
    --busy and --free are mutually exclusive

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

Quiet mode (`-q`): Same compact format as `list` (`MM/DD HH:MM-HH:MM Title`). Stderr messages suppressed.

### `gcal add`

Create a new event.

```bash
gcal add [options]

Options:
  --title, -t <title>           Event title (required)
  --start, -s <datetime>        Start date or datetime (required, ISO 8601).
                                Date-only (YYYY-MM-DD) creates all-day event.
                                Datetime creates timed event.
  --end, -e <datetime>          End date or datetime.
                                Optional. Default: same day (all-day) or +1h (timed).
                                All-day end is inclusive (last day of event).
  --duration <duration>         Duration instead of --end (e.g. 30m, 1h, 2d).
                                Mutually exclusive with --end.
  --description, -d <text>      Event description
  --calendar, -c <id>           Target calendar (uses first enabled if omitted)
  --busy                        Mark as busy (default)
  --free                        Mark as free (transparent)
  --dry-run                     Preview without executing
```

Datetime is interpreted in the configured timezone (or --tz override).

Event type detection:
- `--start` が日付のみ (`YYYY-MM-DD`) → 全日イベント
- `--start` が日時 (`YYYY-MM-DDTHH:MM`) → 時間指定イベント
- `--start` と `--end` の型は一致する必要がある（日付と日時の混在はエラー）

End date behavior (all-day):
- `--end` は inclusive（最終日を指定する）。CLI内部でGoogle Calendar APIのexclusive形式（+1日）に変換する。
- 省略時は `--start` と同日の1日イベント。

End time behavior (timed):
- 省略時は `--start` + 1時間。

Examples:
```bash
gcal add -t "祝日" -s "2026-01-24"                                      # All-day, 1 day
gcal add -t "Vacation" -s "2026-01-24" -e "2026-01-26"                  # All-day, 3 days (inclusive)
gcal add -t "合宿" -s "2026-01-24" --duration 2d                        # All-day, 2 days
gcal add -t "Meeting" -s "2026-01-24T10:00"                             # Timed, 1h default
gcal add -t "Meeting" -s "2026-01-24T10:00" -e "2026-01-24T11:30"      # Timed, explicit end
gcal add -t "Standup" -s "2026-01-24T10:00" --duration 30m             # Timed, 30 min
gcal add -t "Focus" -s "2026-01-24T09:00" --duration 2h --free         # Timed, free
gcal add -t "Call" -s "2026-01-24T09:00" --tz America/New_York         # Timed, with timezone
```

Quiet mode (`-q`): Event ID only.

### `gcal show`

Show event details.

```bash
gcal show <event-id> [options]

Options:
  --calendar, -c <id>  Calendar ID to query (single)
```

Quiet mode (`-q`): Single TSV line `Title\tStart\tEnd`.

### `gcal update`

Update an existing event.

```bash
gcal update <event-id> [options]

Options:
  --title, -t <title>           New title
  --start, -s <datetime>        New start date or datetime.
                                Date-only (YYYY-MM-DD) → all-day event.
                                Datetime (YYYY-MM-DDTHH:MM) → timed event.
                                Can be specified alone (preserves existing duration).
  --end, -e <datetime>          New end date or datetime.
                                Can be specified alone (preserves existing start).
                                All-day end is inclusive (last day of event).
  --duration <duration>         Duration instead of --end (e.g. 30m, 1h, 2d, 1h30m).
                                Mutually exclusive with --end.
                                Can be specified alone (preserves existing start).
  --description, -d <text>      New description
  --busy                        Mark as busy
  --free                        Mark as free
  --dry-run                     Preview without executing
```

Datetime is interpreted in the configured timezone (or --tz override).

Event type detection (same as `gcal add`):
- `--start` が日付のみ (`YYYY-MM-DD`) → 全日イベント
- `--start` が日時 (`YYYY-MM-DDTHH:MM`) → 時間指定イベント
- `--start` と `--end` の型は一致する必要がある（日付と日時の混在はエラー）

Type conversion warning:
- 既存イベントの型と異なる型に変換される場合、stderr に警告を表示する
  - `⚠ Event type changed from timed to all-day`
  - `⚠ Event type changed from all-day to timed`

Partial time update:
- `--start` のみ: 既存イベントの duration を維持して end を自動算出
- `--end` のみ: 既存の start を維持して end のみ更新
- `--duration` のみ: 既存の start を維持して start + duration → 新 end
- `--start` + `--end`: 両方を明示的に更新
- `--start` + `--duration`: start + duration → end を算出

End date behavior (all-day):
- `--end` は inclusive（最終日を指定する）。CLI内部でGoogle Calendar APIのexclusive形式（+1日）に変換する。

Examples:
```bash
gcal update abc123 -t "Updated Meeting"                                    # Title only
gcal update abc123 -s "2026-01-24T11:00"                                   # Start only, keep duration
gcal update abc123 -e "2026-01-24T12:00"                                   # End only, keep start
gcal update abc123 --duration 2h                                           # Duration only, keep start
gcal update abc123 -s "2026-01-24T11:00" -e "2026-01-24T12:30"            # Start + end
gcal update abc123 -s "2026-01-24T10:00" --duration 30m                   # Start + duration
gcal update abc123 -s "2026-03-01" -e "2026-03-03"                        # All-day, 3 days (inclusive)
gcal update abc123 -s "2026-03-01" --duration 2d                          # All-day, 2 days
gcal update abc123 --free                                                  # Transparency only
gcal update abc123 --dry-run -t "Preview"                                  # Dry run
```

Quiet mode (`-q`): Event ID only.

### `gcal delete`

Delete an event.

```bash
gcal delete <event-id> [options]

Options:
  --calendar, -c <id>  Calendar ID to query (single)
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
