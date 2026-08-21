# Output Format Specification

## Text Output (Default)

Human-readable format for terminal use.

### `gcal list` Text Output

```
2026-01-24 (Fri)
  [All Day]     Company Holiday (Main Calendar) [busy]
  10:00-11:00   Team Meeting (Main Calendar) [busy]
  14:00-15:00   Focus Time (Work Calendar) [free]

2026-01-25 (Sat)
  [All Day]     Vacation (Main Calendar) [busy]
```

#### Multi-day Events

An event is listed under **every day it occupies**, not just its start date.
All-day events spanning multiple days carry a `n/m` day counter; single-day
all-day events keep the plain `[All Day]` label.

```
2026-12-05 (Sat)
  [All Day 1/2]   Aコース (Main Calendar) [free]
  10:00-11:00     Team Meeting (Main Calendar) [busy]

2026-12-06 (Sun)
  [All Day 2/2]   Aコース (Main Calendar) [free]
```

Notes:

- The Google Calendar API reports the all-day `end` as **exclusive**:
  `2026-12-05`–`2026-12-07` is a two-day event (12/05 and 12/06).
- The day counter reflects the event's full span even when the requested range
  shows only part of it (`gcal list --from 2026-12-06 --to 2026-12-06` prints
  `[All Day 2/2]`). Days outside the requested range are not rendered.
- Timed events crossing midnight are shown on each day with that day's occupied
  range (`23:00-24:00`, then `00:00-01:00`). An event ending exactly at `00:00`
  does not appear on the following day.
- The time column widens to fit the longest label in the output, so a listing
  without multi-day events keeps the 11-character `HH:MM-HH:MM` width.

#### Availability Tags

Every event row ends with `[busy]` or `[free]`, all-day events included.

Google Calendar marks all-day events as **free** by default, so most of them
show `[free]` even when the day is fully committed. The tag is what makes that
visible — without it, `--busy` appears to drop events for no reason.

#### `--busy` and All-day Events

`--busy` keeps only `opaque` events, which removes most all-day events. Because
that can make a fully booked day look empty, the hidden events are reported on
**stderr** (stdout stays clean for piping):

```
Note: 3 all-day events are hidden by --busy (Google Calendar marks all-day events as free by default):
  2026-09-05  日本看護研究学会第52回学術集会
  2026-09-05  【宿泊】ホテルココ・グラン高崎（朝食付）
  2026-09-05  Stay at ホテルココ・グラン高崎
```

Rules:

- Only `--busy` triggers the notice. `--free` explicitly asks for open time, and
  timed events dropped by `--busy` match what was requested, so neither is
  reported.
- At most 5 titles are listed; the rest are summarised as `... and N more`.
- `gcal list` emits the notice in every mode including `--quiet` and `-f json`.
  `gcal search` suppresses all stderr output under `--quiet`, so the notice is
  omitted there.

### `gcal search` Text Output

```
Found 3 events matching "meeting":

2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]
2026-01-28 09:00-10:00  Project Meeting (Main Calendar) [busy]
2026-02-01 14:00-15:00  Review Meeting (Work Calendar) [busy]
```

Search lists one row per event rather than per day, so a multi-day span is
annotated inline:

```
Found 2 events matching "A":

2026-12-05 [All Day 12/05-12/06]  Aコース (Main Calendar) [free]
2026-12-05 23:00-12/06 01:00      Night Shift (Main Calendar) [busy]
```

### `gcal show` Text Output

出席者がいるときだけ Attendees ブロックを表示する。`Link:` の直前に置く。
Meet リンクがあるときだけ `Meet:` 行を出し、`Link:` の直前に置く。

```
Team Meeting

Date:         2026-01-24
Time:         10:00 - 11:00
Calendar:     Main Calendar
Status:       confirmed
Availability: busy
Attendees:    3
  [accepted] alice@example.com (Alice) (organizer)
  [needsAction] bob@example.com
  [declined] carol@example.com (optional)

Meet: https://meet.google.com/abc-defg-hij
Link: https://calendar.google.com/event?eid=...
```

各行の末尾に付く注記は `(表示名)` `(organizer)` `(optional)` の順で、該当するものだけを出す。
`gcal list` / `gcal search` の行フォーマットは出席者でも Meet リンクでも変わらない。

### `gcal calendars` Text Output

```
Calendars:
  [x] primary           Main Calendar
  [x] family@group...   Family
  [ ] work@group...     Work Main (disabled)
```

## Quiet Output (`--quiet`, `-q`)

Minimal output for scripting and piping. JSON mode (`-f json`) is unaffected by `--quiet`.

| Command | Quiet Output | Example |
|---------|-------------|---------|
| list | `MM/DD HH:MM-HH:MM Title` per line | `01/24 10:00-11:00 Team Meeting` |
| search | Same as list quiet | `01/24 10:00-11:00 Team Meeting` |
| show | `Title\tStart\tEnd` (TSV, 1 line) | `Team Meeting\t2026-01-24T10:00:00+09:00\t2026-01-24T11:00:00+09:00` |
| add | Event ID only | `abc123` |
| update | Event ID only | `abc123` |
| delete | (no output) | |
| calendars | Calendar ID per line | `primary` |
| init | Config file path only | `~/.config/gcal-cli/config.toml` |

`gcal list --quiet` expands multi-day events to one line per occupied day, in
the same way as the text output:

```
12/05 All day      Aコース
12/06 All day      Aコース
12/06 09:00-10:00  Team Meeting
```

### `gcal search` Quiet Output

Search is event-oriented, so each match stays on a single line even when it
spans several days.

```
01/24 10:00-11:00  Team Meeting
01/28 09:00-10:00  Project Meeting
02/01 14:00-15:00  Review Meeting
```

### `gcal show` Quiet Output

```
Team Meeting	2026-01-24T10:00:00+09:00	2026-01-24T11:00:00+09:00
```

### `gcal add` Quiet Output

```
abc123
```

### `gcal update` Quiet Output

```
abc123
```

## JSON Output

Use `-f json` for machine-readable output.

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### `gcal init` Text Output

```
Config file created: ~/.config/gcal-cli/config.toml

Enabled calendars:
  - Main Calendar (user@gmail.com)

Timezone: Asia/Tokyo
```

### `gcal init` Quiet Output

```
~/.config/gcal-cli/config.toml
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Not authenticated |
| `AUTH_EXPIRED` | Token expired, re-auth needed |
| `NOT_FOUND` | Event or calendar not found |
| `INVALID_ARGS` | Invalid command arguments |
| `API_ERROR` | Google API error |
| `CONFIG_ERROR` | Configuration file error |

## Data Structures

### Event

All datetime fields include timezone offset (ISO 8601).

```json
{
  "id": "string",
  "title": "string",
  "start": "ISO8601 datetime with offset",
  "end": "ISO8601 datetime with offset",
  "all_day": "boolean",
  "status": "confirmed | tentative | cancelled",
  "transparency": "opaque | transparent",
  "description": "string | null",
  "calendar_id": "string",
  "calendar_name": "string",
  "html_link": "string",
  "attendees": "EventAttendee[]",
  "meet_link": "string | null",
  "conference": "EventConference | null",
  "created": "ISO8601 datetime",
  "updated": "ISO8601 datetime"
}
```

### EventAttendee

`attendees` は出席者がいない場合も `null` ではなく空配列 `[]` を返す。
メールアドレスを持たない参加者（会議室・リソース）は現在対象外で、リストに含まれない。

```json
{
  "email": "string",
  "display_name": "string | null",
  "response_status": "needsAction | declined | tentative | accepted",
  "optional": "boolean",
  "organizer": "boolean",
  "self": "boolean"
}
```

### meet_link と EventConference

`conference` はイベントに紐付いている会議そのものを表す。会議が無ければ `null`。

```json
{
  "type": "string | null",
  "uri": "string | null"
}
```

`type` は Google が実際に割り当てた会議方式（`hangoutsMeet` / `eventHangout` /
`eventNamedHangout` / サードパーティ会議アドオンは `addOn`）。レスポンスに
`conferenceSolution` が無い場合は `null`。`uri` は `entryPoints` の `video` の URI で、
電話などの video 以外の entry point は対象外。

`meet_link` は **Google Meet のときだけ**非 null になる。判定は次の順:

1. `hangoutLink` があればそれ（Meet のときだけ設定されるフィールドのため、これで確定）
2. `conference.type` が `hangoutsMeet` なら `conference.uri`
3. `conference.type` が Meet 以外と分かっているなら `null`（Meet でないものを Meet として返さない）
4. `conference.type` が `null`（不明）なら `conference.uri`

したがって Zoom などが付いたイベントは `meet_link: null` / `conference: {"type": "addOn", ...}` になる。

`--meet` で作成した直後は会議の生成が終わっておらず `meet_link` も `conference` も
`null` になることがある。その場合は数秒後に `gcal show` で取得できる
（`spec/commands.md` の `gcal add` を参照）。

### Calendar

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "primary": "boolean",
  "enabled": "boolean"
}
```

## Command Output Examples

### `gcal list -f json`

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "abc123",
        "title": "Company Holiday",
        "start": "2026-01-24",
        "end": "2026-01-25",
        "all_day": true,
        "status": "confirmed",
        "transparency": "opaque",
        "description": null,
        "calendar_id": "primary",
        "calendar_name": "Main Calendar"
      },
      {
        "id": "def456",
        "title": "Team Meeting",
        "start": "2026-01-24T10:00:00+09:00",
        "end": "2026-01-24T11:00:00+09:00",
        "all_day": false,
        "status": "confirmed",
        "transparency": "opaque",
        "description": null,
        "calendar_id": "primary",
        "calendar_name": "Main Calendar"
      }
    ],
    "count": 2
  }
}
```

### `gcal search "meeting" -f json`

```json
{
  "success": true,
  "data": {
    "query": "meeting",
    "events": [ ... ],
    "count": 3
  }
}
```

### `gcal add -f json`

```json
{
  "success": true,
  "data": {
    "event": { ... },
    "message": "Event created"
  }
}
```

### `gcal add --dry-run`

Text output:
```
DRY RUN: Would create event:
  title: "Meeting"
  start: "2026-03-01T10:00:00+09:00"
  end: "2026-03-01T11:00:00+09:00"
```

JSON output (`-f json`):
```json
{
  "success": true,
  "data": {
    "dry_run": true,
    "action": "add",
    "event": {
      "title": "Meeting",
      "start": "2026-03-01T10:00:00+09:00",
      "end": "2026-03-01T11:00:00+09:00"
    }
  }
}
```

### `gcal update -f json`

```json
{
  "success": true,
  "data": {
    "event": { ... },
    "message": "Event updated"
  }
}
```

### `gcal delete -f json`

```json
{
  "success": true,
  "data": {
    "deleted_id": "abc123",
    "message": "Event deleted"
  }
}
```

### `gcal init -f json`

```json
{
  "success": true,
  "data": {
    "path": "~/.config/gcal-cli/config.toml",
    "timezone": "Asia/Tokyo",
    "calendars": [
      { "id": "user@gmail.com", "name": "Main Calendar", "enabled": true },
      { "id": "family@group.calendar.google.com", "name": "Family", "enabled": false }
    ],
    "enabled_count": 1,
    "total_count": 2
  }
}
```
