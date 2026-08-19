# Task: イベントへの出席者招待 (attendees)

## Purpose

`gcal add` / `gcal update` で出席者を指定し、Google Calendar の招待を送れるようにする。
AI エージェントから「打ち合わせを作って相手を招待する」までを 1 コマンドで完結させるのが狙い。

Google Calendar API の `attendees` フィールドと `sendUpdates` クエリパラメータで実現でき、
**現行の OAuth スコープ `calendar.events` で書き込み可能なため再認証は不要**（`spec/auth.md` の変更なし）。

## Context

- Related files:
  - `src/lib/api.ts` — `GoogleCalendarApi`, `GoogleEventWriteBody`, `GoogleEvent`, `normalizeEvent()`, `CreateEventInput`, `UpdateEventInput`
  - `src/commands/shared.ts` — `createGoogleCalendarApi()`, `collect()`（repeatable オプション用に既存）
  - `src/commands/add.ts` / `src/commands/update.ts` / `src/commands/delete.ts`
  - `src/lib/output.ts` — `formatEventDetailText()`
  - `src/types/index.ts` — `CalendarEvent`
- Related specs: `spec/commands.md`, `spec/output.md`
- Dependencies: なし（042 と独立。ただし両方 `api.ts` の同じ型を触るので順に積む）
- 参照: [events.insert reference](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)

## Design Decisions

### 通知は既定でオフ

`sendUpdates` の API 既定値は「通知なし」。CLI もこれに従い、**明示的に `--notify` を指定したときだけ通知する**。
エージェントが試行錯誤で実行しても実メールが飛ばないことを優先する。

```
--notify <all|external|none>   既定: none
```

`all` → `sendUpdates: "all"`, `external` → `"externalOnly"`, `none` → `"none"`。

### `update` の `--attendee` は全置換

**Google Calendar API は `patch` でも `attendees` 配列を全置換する。**
差分更新（追加・削除）は read-modify-write が必要になるため **043 に切り出す**。
本タスクでは全置換であることをヘルプと `spec/commands.md` に明記し、誤用を防ぐ。

- `gcal update <id> --attendee a@x.com` → 出席者は a@x.com **のみ**になる
- `gcal update <id> --clear-attendees` → 出席者を空にする
- `--attendee` と `--clear-attendees` は conflict

### 型定義

`src/types/index.ts`:

```ts
export type AttendeeResponseStatus = "needsAction" | "declined" | "tentative" | "accepted";

export interface EventAttendee {
  email: string;
  display_name: string | null;
  response_status: AttendeeResponseStatus;
  optional: boolean;
  organizer: boolean;
  self: boolean;
}
```

`CalendarEvent` に `attendees: EventAttendee[]` を追加する。出席者なしのイベントでも
**`null` ではなく空配列 `[]`** を返す（JSON 消費側の分岐を減らす）。フィールド追加のみなので
既存の JSON 出力に対して後方互換。

`response_status` は `api.ts` の既存パターンに合わせて zod の `.catch()` で未知値を
`needsAction` にフォールバックさせる。

### Text 出力（`gcal show`）

`formatEventDetailText()` に、出席者がいるときだけブロックを追加する:

```
Availability:  busy
Attendees:     3
  [accepted]     alice@example.com (Alice)
  [needsAction]  bob@example.com
  [declined]     carol@example.com (optional)

Link: https://...
```

`(organizer)` は主催者行に付ける。`gcal list` の行フォーマットは**変更しない**（1行が長くなりノイズになるため）。

### バリデーション

- `--attendee` の値に `@` が含まれない場合は `INVALID_ARGS`（厳密な RFC 検証はせず、API 側のエラーに委ねる）
- 同一メールアドレスの重複指定は de-dup して 1 件にする
- `--notify` が `all|external|none` 以外なら `INVALID_ARGS`

### 既知の制約（spec に注記する）

- 招待できるのは**自分が主催者のイベント**のみ。他人のイベントに出席者を足すと API が 403 を返す
- 出席者を設定すると Google が主催者を自動的に attendees に加えるため、レスポンスの件数が指定数より 1 多くなることがある
- `responseStatus` を `accepted` 等で作成しても、受信側の設定によっては `needsAction` にリセットされる（API ドキュメント記載の挙動）

### Out of Scope

- 出席者の差分更新（`--add-attendee` / `--remove-attendee`）→ **043**
- 会議室・リソース（`attendees[].resource`）の予約
- `guestsCanInviteOthers` / `guestsCanModify` / `guestsCanSeeOtherGuests`
- `gcal list` 行への出席者表示

## Changes

### `gcal add`

```bash
gcal add -t "1on1" -s "2026-09-01T10:00" --attendee alice@example.com
gcal add -t "Review" -s "2026-09-01T14:00" -a alice@example.com -a bob@example.com --notify all
```

```
--attendee, -a <email>        出席者のメールアドレス（複数指定可）
--notify <all|external|none>  招待メールの送信範囲（既定: none）
```

### `gcal update`

```bash
gcal update abc123 --attendee alice@example.com --notify all   # 全置換
gcal update abc123 --clear-attendees                            # 出席者を空に
```

```
--attendee, -a <email>        出席者を指定した内容で置換する（複数指定可）
--clear-attendees             出席者を全て削除する
--notify <all|external|none>  更新通知の送信範囲（既定: none）
```

### `gcal delete`

```bash
gcal delete abc123 --notify all   # キャンセル通知を送る
```

```
--notify <all|external|none>  キャンセル通知の送信範囲（既定: none）
```

### JSON Output

`Event` に追加:

```json
{
  "attendees": [
    {
      "email": "alice@example.com",
      "display_name": "Alice",
      "response_status": "accepted",
      "optional": false,
      "organizer": false,
      "self": false
    }
  ]
}
```

### Dry-run

`--dry-run` のプレビューに `attendees` と `notify` を含める（指定時のみ）。

## Implementation Steps

- [ ] `src/types/index.ts`: `AttendeeResponseStatus`, `EventAttendee` を追加し `CalendarEvent.attendees` を追加
- [ ] `src/lib/api.test.ts`: `normalizeEvent()` が attendees を正規化する失敗テスト（未設定 → `[]`、未知の responseStatus → `needsAction`）
- [ ] `src/lib/api.ts`: `GoogleEvent.attendees`, `GoogleEventWriteBody.attendees` を追加、`normalizeEvent()` を実装
- [ ] `src/lib/api.ts`: `GoogleCalendarApi` の `events.insert/patch/delete` パラメータに `sendUpdates?: string` を追加
- [ ] `src/lib/api.test.ts` / `api.ts`: `CreateEventInput.attendees` / `sendUpdates`、`UpdateEventInput.attendees` / `sendUpdates` を `createEvent()` / `updateEvent()` / `deleteEvent()` に反映（`attendees: []` を送れば全削除になること）
- [ ] `src/commands/shared.ts`: `createGoogleCalendarApi()` のパススルーに `sendUpdates` を通す
- [ ] `src/commands/add.test.ts` / `add.ts`: `--attendee`（`collect` で repeatable）、`--notify`、バリデーション、de-dup、dry-run 出力
- [ ] `src/commands/update.test.ts` / `update.ts`: `--attendee`（全置換）、`--clear-attendees`（conflict 設定）、`--notify`
- [ ] `src/commands/delete.test.ts` / `delete.ts`: `--notify`
- [ ] `src/lib/output.test.ts` / `output.ts`: `formatEventDetailText()` の Attendees ブロック（0件では出さない）
- [ ] `spec/commands.md`: add / update / delete のオプション表と全置換の注意書き
- [ ] `spec/output.md`: `Event` データ構造に `attendees`、`gcal show` の text 出力例
- [ ] `tests/integration/add-pipeline.test.ts` / `update-pipeline.test.ts`: attendees が API 呼び出しまで届くこと
- [ ] `bun run test` pass
- [ ] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/attendees.test.ts` を新規作成する。**招待メールを実際に飛ばさないため `--notify` は指定しない**
（`sendUpdates: none` で attendees だけ設定する）。招待先には自分自身のアドレスを使う。

- [ ] `gcal add --attendee <self> --notify none` でイベントを作り、`gcal show -f json` の `attendees` に含まれること
- [ ] `gcal update <id> --clear-attendees` で `attendees` が `[]` になること
- [ ] `gcal show` の text 出力に Attendees ブロックが出ること
- [ ] 出席者なしのイベントで `attendees` が `[]` であること（後方互換の確認）
- [ ] 作成したイベントを cleanup で削除する

## Acceptance Criteria

- [ ] `gcal add --attendee` で出席者付きイベントが作成できる
- [ ] `--attendee` が複数回指定でき、重複は de-dup される
- [ ] `--notify` 未指定では通知が飛ばない（`sendUpdates: none` が送られる）
- [ ] `gcal update --attendee` が全置換であることがヘルプと spec に明記されている
- [ ] `gcal update --clear-attendees` で出席者を空にできる
- [ ] `gcal delete --notify all` でキャンセル通知が送られる
- [ ] JSON 出力の `attendees` が常に配列（出席者なしなら `[]`）
- [ ] 不正なメールアドレス / `--notify` 値で `INVALID_ARGS` が返る
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] 既存テストが pass する
