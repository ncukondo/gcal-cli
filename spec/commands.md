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

`--busy` caveat: Google Calendar marks all-day events as free by default, so
`--busy` hides most of them and a fully booked day can look empty. Any all-day
event it hides is reported on stderr with its date and title. See
[output.md](./output.md#--busy-and-all-day-events).

Quiet mode (`-q`): Compact one-line format: `MM/DD HH:MM-HH:MM Title`. Warnings
still go to stderr, so stdout stays clean for piping.

Partial failures: every enabled calendar is queried at once. A calendar that
fails is warned about on stderr and listed in `data.failed_calendars` (always
present, `[]` when nothing failed), and the events fetched from the other
calendars are still returned. If **every** calendar fails the first error is
raised instead, so a fetch that returned nothing never reports success -- this
is what the usual single-calendar setup hits. See
[output.md](./output.md#partial-fetch-failures).

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

`--busy` hides all-day events for the same reason as `list`, and reports them on
stderr in the same format.

Quiet mode (`-q`): Same compact format as `list` (`MM/DD HH:MM-HH:MM Title`).
Unlike `list`, `search` suppresses its stderr messages under `--quiet`,
including the `--busy` notice. The one exception is the failed-calendar warning
below, which is a failure notice rather than data.

Partial failures: identical to `list` -- failed calendars are reported on stderr
and in `data.failed_calendars`, and a fetch where every calendar failed raises
the first error.

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
  --attendee, -a <email>        Invite an attendee (repeatable)
  --notify <all|external|none>  Invitation email scope (default: none)
  --meet                        Create a Google Meet conference and attach it
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
gcal add -t "1on1" -s "2026-01-24T10:00" -a alice@example.com          # Invite, no mail sent
gcal add -t "Review" -s "2026-01-24T14:00" -a a@x.com -a b@x.com --notify all
gcal add -t "Design review" -s "2026-01-24T10:00" --meet                # With a Meet link
```

Attendees:
- `--attendee` は複数回指定できる。同一アドレスは大文字小文字を無視して重複排除される。
- `@` を含まない値はAPIを呼ばずに `INVALID_ARGS` で拒否する。
- 招待できるのは自分が主催者のイベントのみ。他人のイベントに出席者を足すと API が 403 を返す。
- 出席者を設定すると Google が主催者を自動的に追加するため、レスポンスの件数が指定数より 1 多くなることがある。
- `responseStatus` を指定して作成しても、受信側の設定によっては `needsAction` にリセットされる（API の仕様）。

Google Meet (`--meet`):
- 全日イベントにも付けられる。API も Google カレンダーの Web UI も許可しているため、CLI 側で
  独自に禁止はしない。
- 会議の生成は非同期。CLI は最大 3 回（500ms → 1s → 2s）ポーリングし、それでも確定しなければ
  `meet_link` を `null` のまま**成功として返し**、stderr に以下を出す。イベント自体は作成済みなので失敗扱いにしない。
  ```
  Note: Google Meet link is still being generated. Run `gcal show <id>` in a few seconds to get it.
  ```
- 会議方式は指定せずカレンダー既定に任せる。既定が Meet 以外（クラシック Hangouts や
  サードパーティ会議アドオン）のカレンダーでは Meet 以外の会議が付く。その場合 `meet_link` は
  `null` のままにし（Meet ではないものを Meet のリンクとして返さないため）、実際に付いた会議は
  JSON の `conference` で返した上で stderr に以下を出す。
  ```
  Note: this calendar attached a conference of type "addOn", not Google Meet. Conference URL: https://...
  ```
- 上記 2 つの stderr 注記は `--quiet` では出さない。
- 会議の作成そのものに失敗した場合（`createRequest.status` が `failure`）は `API_ERROR`。
  **イベントは既に作成済みなので、エラーメッセージにそのイベント ID を含める。**
- 会議を作れないカレンダーでは API が 400 を返す。`--meet` 指定時の 400 には
  「`--meet` を外して再実行する」選択肢を添える。400 の原因は会議とは限らない（時刻範囲の不正など）ため、
  原因を断定する書き方はしない。
- 会議 ID は呼び出しごとに新規生成する。使い回すと同じ会議 URL が複数イベントで共有されてしまうため。

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
  --attendee, -a <email>        Replace the guest list (repeatable)
  --clear-attendees             Remove all attendees
  --add-attendee <email>        Add a guest, keeping the current list (repeatable)
  --remove-attendee <email>     Remove a guest, keeping the rest (repeatable)
  --notify <all|external|none>  Update email scope (default: none)
  --meet                        Create a Google Meet conference and attach it
  --remove-meet                 Remove the conference from the event
  --preserve-exceptions         Recurring series: keep occurrences' own values (restored after the update)
  --overwrite-exceptions        Recurring series: let the update replace occurrences' own values
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
gcal update abc123 -a alice@example.com                                    # Replace guest list
gcal update abc123 --clear-attendees                                       # Remove all guests
gcal update abc123 --add-attendee bob@example.com                          # Add one guest
gcal update abc123 --remove-attendee carol@example.com                     # Drop one guest
gcal update abc123 --meet                                                  # Attach a Meet link
gcal update abc123 --remove-meet                                           # Drop the Meet link
gcal update series1 -d "New agenda" --preserve-exceptions                  # Series: keep per-occurrence descriptions
```

Attendees:

出席者の更新には 2 つのモードがある。

**全置換モード** (`--attendee` / `--clear-attendees`):
- Google Calendar API は `patch` でも `attendees` 配列を**全置換**する。
  `gcal update <id> -a alice@example.com` を実行すると、出席者は alice **のみ**になる。
- 招待者一覧をまるごと入れ替えたいときに使う。
- `--attendee` と `--clear-attendees` は同時に指定できない（意図の異なる 2 モードのため）。

**差分モード** (`--add-attendee` / `--remove-attendee`):
- CLI が「現在の出席者を取得 → マージ → 全置換」を代行するので、既存の出席者は保たれる。
- どちらも指定しなかった場合も、繰り返し予定の判定のためのイベント取得（1 回）は行う。
- 指定した場合でもイベントの取得は **1 回だけ**。主催者の保護・未参加アドレスの注記・
  dry-run の表示・実際に書き込むマージのすべてが同じスナップショットから決まる。
- 削除 → 追加の順にマージする。メールアドレスの比較は**大文字小文字を区別しない**。
- マージは取得した**生のレスポンス**に対して行い、残す出席者は
  オブジェクトごと書き戻す。そのため `responseStatus` / `displayName` / `optional` に加えて、
  CLI が表示しない `comment`（「10 分遅れます」等）や `additionalGuests`（同伴人数）、
  さらに**メールアドレスを持たない出席者（会議室・備品）**も保たれる。
- 既に招待済みのアドレスを `--add-attendee` しても no-op（RSVP は失われない）。
- **追加も削除も実際に起きなかった場合、出席者リストは送信しない。** 同じ内容でも
  書き直せば Google は「変更あり」と扱い、`--notify` が `none` 以外なら
  全員に更新通知メールが飛んでしまうため。
- 現在の出席者に居ないアドレスを `--remove-attendee` してもエラーにはせず、
  stderr に注記を出して続行する（冪等な操作にするため）。

  ```
  Note: dave@example.com is not an attendee of this event; nothing to remove.
  ```
- 主催者（`organizer: true`）を `--remove-attendee` すると `INVALID_ARGS` で弾く。
  送信しても API 側で復活するか 400 になるため、CLI で明示的に止める。
- 同一アドレスを `--add-attendee` と `--remove-attendee` の両方に指定すると `INVALID_ARGS`。
- 2 つのモードは併用できない。`--add-attendee` / `--remove-attendee` は
  `--attendee` / `--clear-attendees` と conflict する。
- **read-modify-write は atomic ではない。** 取得と更新の間に他のクライアントが
  出席者を変更した場合、その変更は失われる（後勝ち）。ETag による楽観ロックは行わない。
  取得は 1 回なので、時刻の部分更新（`--start` 単独など）と差分を併用しても
  送信内容が食い違うことはない。
- dry-run はマージ結果と差分を表示する。イベントの取得は行うが `patch` は送らない。
  表示は**メールアドレスの一覧**なので、アドレスを持たない出席者（会議室・備品）は
  プレビューに現れない。実際の書き込みではそれらも保たれるため、プレビューは
  実際より少なく見える方向にしかずれない。追加したアドレスは入力したままの
  大文字小文字で表示する。

  ```
  DRY RUN: Would update event "abc123":
    attendees: alice@example.com, bob@example.com   (+bob@example.com, -carol@example.com)
  ```

  JSON では `changes.attendees` にマージ結果、`changes.attendees_added` /
  `changes.attendees_removed` に実際の差分が入る。

`--notify`:
- `--notify` 単独では「更新」とみなさない。`--notify` だけを指定すると
  `at least one update option must be provided` エラーになる。

Google Meet:
- `--meet` / `--remove-meet` はそれぞれ単独で「更新」として成立する。
- 2 つは同時に指定できない。
- **どちらも指定しない `update` は既存の会議を保持する。** conferenceData を伴うリクエストは
  この 2 つのフラグを指定したときだけ送るため、タイトル変更などが会議を巻き添えで消すことはない。
- `--meet` の pending / 非 Meet / `failure` / 400 の挙動はすべて `gcal add` と同じ。
- dry-run は `meet: true` または `remove_meet: true` を出す。

Recurring series (#70):

繰り返し予定の本体（master）を `patch` すると、Google は書き込んだフィールドを
**個別に変更済みの回（例外）にも上書きする**。例外の他のフィールドは残る。
本体の**時刻を変える**と（`--start` / `--end` / `--duration`）、Google はシリーズを
作り直し、**例外はすべてリセット**される（回の ID も変わり、旧 ID の回は cancelled になる）。
いずれも 2026-10-08 にテスト用シリーズで実測した挙動。

- 対象が本体（`recurrence` を持つ）のとき、CLI は `events.instances` で全回を取得し、
  **変更するフィールドについて本体と異なる値を持つ回**を検出する。
  比較するのは title / description（null と空文字は同一視）/ free-busy /
  出席者（アドレスの集合、大文字小文字と RSVP は無視）/ 会議 URL。
  時刻を変える場合はこれら全部に加えて location と、移動・長さ変更された回を対象にする。
  cancelled の回は対象外。
- 該当する回があると、どちらかのフラグが無い限り **`INVALID_ARGS` で中止し、
  何も書き込まない**。メッセージに回の ID・開始時刻・異なるフィールドを列挙する。
- `--preserve-exceptions`: 本体を更新した後、該当する回それぞれに元の値を `patch` で書き戻す
  （`sendUpdates: "none"` 固定。元に戻すだけなので通知しない）。書き戻せるのは
  title / description / free-busy / 出席者（生のオブジェクトをそのまま書き戻すので RSVP も残る）。
  時刻変更や会議 URL の違いは書き戻せないため、その場合は `INVALID_ARGS` で中止する。
  書き戻しに失敗した回は、書き戻すはずだった値とともに stderr と JSON（`exceptions.failed`）に
  出し、終了コードは 1。本体の更新は済んでいる。
- `--overwrite-exceptions`: そのまま本体を更新し、上書きした回を stderr に列挙する。
- 2 つのフラグは同時に指定できない。対象が本体でない場合・該当する回が無い場合は何もしない。
- JSON 出力では `data.exceptions = { action: "preserved" | "overwritten", instances: [...], failed: [...] }`
  （該当する回があったときだけ）。`instances[]` は `{ id, start, original_start, fields }`。
- `--dry-run` はフラグ無しでも中止せず、該当する回を一覧する。JSON では
  `data.exceptions.action` が `"preserve"` / `"overwrite"` / `"abort"`（フラグ無し）になる。

  ```
  DRY RUN: Would update event "series1":
    description: "New agenda"
    modified occurrences (2) would be overwritten; the update will abort unless --preserve-exceptions or --overwrite-exceptions is given:
      series1_20260813T110000Z  2026-08-13T20:00:00+09:00  (description)
      series1_20260910T110000Z  2026-09-10T20:00:00+09:00  (description)
  ```
- このため `update` は常にイベントを 1 回取得する（本体かどうかはイベント自身にしか分からない）。
  本体の場合はさらに `events.instances` を呼ぶ。

Quiet mode (`-q`): Event ID only.

### `gcal delete`

Delete an event.

```bash
gcal delete <event-id> [options]

Options:
  --calendar, -c <id>           Calendar ID to query (single)
  --notify <all|external|none>  Cancellation email scope (default: none)
  --dry-run                     Preview without executing
```

```bash
gcal delete abc123 --notify all   # Send cancellation mail to guests
```

### `gcal tasks lists`

List task lists from Google Tasks.

```bash
gcal tasks lists
gcal tasks lists -f json
gcal tasks lists -q          # ID only
```

### `gcal tasks list`

List tasks in a task list. Shows only incomplete tasks by default.

Tasks are sorted by due date ascending; tasks without a due date come last.
Within the same due date (and among tasks without one) the API order is kept.
The same order applies to text, `-q` and JSON output, and under `--all` / `--completed`.

```bash
gcal tasks list [options]

Options:
  --list, -l <name|id>    Task list name or ID (default: first enabled or @default)
  --all                   Include completed tasks
  --completed             Show completed tasks only
  --due-before <date>     Tasks due on or before date (YYYY-MM-DD)
  --due-after <date>      Tasks due on or after date (YYYY-MM-DD)
  --today                 Tasks due today
  --overdue               Tasks due today or earlier (overdue + today)
  --days <n>              Tasks due within the next n days, today included (n >= 1)

  Constraints:
    --today, --overdue, --days are mutually exclusive
    --today, --overdue, --days cannot be combined with --due-before / --due-after
    --days must be a positive integer; --days 1 is the same as --today
```

The shortcuts are sugar for `--due-after` / `--due-before`. With today as `T`:

| Option        | Equivalent                                  |
|---------------|---------------------------------------------|
| `--today`     | `--due-after T --due-before T`              |
| `--overdue`   | `--due-before T`                            |
| `--days <n>`  | `--due-after T --due-before (T + n - 1)`    |

"Today" is decided in the same timezone as `gcal list --today`
(`--tz`, then `timezone` in config). Tasks without a due date never match a
due filter. The shortcuts are independent of the status filter: `--overdue`
alone shows incomplete tasks only, `--overdue --all` includes completed ones.

Examples:
```bash
gcal tasks list
gcal tasks list --all
gcal tasks list --completed
gcal tasks list --list "Work"
gcal tasks list --due-before 2026-03-30
gcal tasks list --today
gcal tasks list --overdue
gcal tasks list --days 3
gcal tasks list -l Calendar --overdue -f json
gcal tasks list -f json
gcal tasks list -q
```

Quiet mode (`-q`): `[□/☑] Title (due: MM/DD)` per line.

### `gcal tasks show`

Show task details.

```bash
gcal tasks show <task-id> [options]

Options:
  --list, -l <name|id>    Task list name or ID
```

Quiet mode (`-q`): `Title\tStatus\tDue` (TSV, 1 line).

### `gcal tasks add`

Create a new task.

```bash
gcal tasks add [options]

Options:
  --title, -t <title>     Task title (required)
  --notes, -n <text>      Notes
  --due <date>            Due date (YYYY-MM-DD)
  --list, -l <name|id>    Task list name or ID
  --parent <task-id>      Parent task ID (create as subtask)
```

Examples:
```bash
gcal tasks add -t "Buy groceries"
gcal tasks add -t "Write report" --due 2026-03-26 --notes "Q1 summary"
gcal tasks add -t "Subtask" --parent abc123
gcal tasks add -t "Work item" --list "Work"
```

Quiet mode (`-q`): Task ID only.

### `gcal tasks update`

Update an existing task.

```bash
gcal tasks update <task-id> [options]

Options:
  --title, -t <title>     New title
  --notes, -n <text>      New notes
  --due <date>            New due date (YYYY-MM-DD)
  --list, -l <name|id>    Task list name or ID
```

Quiet mode (`-q`): Task ID only.

### `gcal tasks done`

Mark a task as completed.

```bash
gcal tasks done <task-id> [options]

Options:
  --list, -l <name|id>    Task list name or ID
```

Quiet mode (`-q`): Task ID only.

### `gcal tasks undone`

Mark a task as incomplete.

```bash
gcal tasks undone <task-id> [options]

Options:
  --list, -l <name|id>    Task list name or ID
```

Quiet mode (`-q`): Task ID only.

### `gcal tasks delete`

Delete a task.

```bash
gcal tasks delete <task-id> [options]

Options:
  --list, -l <name|id>    Task list name or ID
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
