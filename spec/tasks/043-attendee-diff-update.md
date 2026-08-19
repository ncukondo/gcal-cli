# Task: 出席者の差分更新 (`--add-attendee` / `--remove-attendee`)

## Purpose

041 で導入した `gcal update --attendee` は **Google Calendar API の仕様上、出席者リストの全置換**になる。
既存の出席者を保ったまま 1 人だけ追加/削除したいケースでは、呼び出し側が
「現在の出席者を取得 → マージ → 全置換」を自前で組み立てる必要があり、AI エージェントが誤って
既存の招待者を消してしまう事故が起きやすい。

CLI 側で read-modify-write を吸収し、`--add-attendee` / `--remove-attendee` を提供する。

## Context

- Related files:
  - `src/commands/update.ts` — `handleUpdate()`, `createUpdateCommand()`
  - `src/lib/api.ts` — `getEvent()`, `updateEvent()`, `UpdateEventInput`
  - `src/commands/index.ts` — `update` サブコマンドの依存注入
- Related specs: `spec/commands.md`
- Dependencies: **041-attendees**（`attendees` の型と全置換パスが前提）

## Design Decisions

### read-modify-write は commands 層で行う

`api.ts` の `updateEvent()` は「渡された内容を送る」薄いラッパのまま保つ。
差分の解決は `handleUpdate()` 側で行い、`AddHandlerDeps` と同じ DI スタイルで
`getEvent` をハンドラの依存に追加する（ユニットテストでモックできるようにする）。

```ts
export interface UpdateHandlerDeps {
  getEvent: (calendarId: string, calendarName: string, eventId: string) => Promise<CalendarEvent>;
  updateEvent: (...) => Promise<CalendarEvent>;
  loadConfig: () => AppConfig;
  write: (msg: string) => void;
  writeErr: (msg: string) => void;
}
```

`--add-attendee` / `--remove-attendee` が**指定されたときだけ** `getEvent` を呼ぶ
（指定なしのときに余計な API 呼び出しを増やさない）。

### マージ規則

1. `getEvent()` で現在の `attendees` を取得
2. `--remove-attendee` のアドレスを除去（**大文字小文字を区別しない**比較）
3. `--add-attendee` のアドレスを追加（既に居れば no-op、`responseStatus` は保持する）
4. 結果を `updateEvent()` に `attendees` として渡す（= 全置換だが内容はマージ済み）

同一アドレスが `--add-attendee` と `--remove-attendee` の両方に指定された場合は `INVALID_ARGS`。

### 主催者の保護

Google はイベント主催者を自動的に attendees に含める。`--remove-attendee` で
`organizer: true` の出席者を消そうとした場合は `INVALID_ARGS` で弾く
（送信しても API 側で復活するか 400 になるため、CLI で明示的に止める方が分かりやすい）。

### 存在しないアドレスの削除

`--remove-attendee` に現在の出席者に居ないアドレスを渡した場合は**エラーにせず**、
stderr に注記を出して続行する（冪等な操作にしたいため）。

```
Note: dave@example.com is not an attendee of this event; nothing to remove.
```

### 排他制御

`--attendee`（全置換）/ `--clear-attendees` と `--add-attendee` / `--remove-attendee` は conflict にする。
意図の異なる 2 つのモードを同時に使わせない。

### 競合（race condition）の扱い

read-modify-write は atomic ではない。取得と更新の間に他クライアントが出席者を変更すると
その変更が失われる。本タスクでは **ETag による楽観ロックは実装せず**、
`spec/commands.md` に「短時間に並行更新した場合は後勝ちになる」旨を注記するに留める。
（必要になれば `If-Match` ヘッダ対応を別タスクに切る。）

### Dry-run

`--dry-run` ではマージ結果を表示する。`getEvent` は呼ぶ（マージ結果を見せるため）が、
`updateEvent` は呼ばない。

```
DRY RUN: Would update event abc123:
  attendees: alice@example.com, bob@example.com   (+bob@example.com, -carol@example.com)
```

## Changes

### `gcal update`

```bash
gcal update abc123 --add-attendee bob@example.com
gcal update abc123 --remove-attendee carol@example.com --notify all
gcal update abc123 --add-attendee bob@example.com --remove-attendee carol@example.com
```

```
--add-attendee <email>      出席者を追加する（既存を保持、複数指定可）
--remove-attendee <email>   出席者を削除する（既存を保持、複数指定可）
```

`--notify` は 041 で追加済みのものをそのまま使う。

## Implementation Steps

- [ ] `src/commands/update.test.ts`: マージ規則の失敗テストを書く
      （追加 / 削除 / 追加+削除の同時指定 / 大文字小文字違い / 既に居るアドレスの追加が no-op / 未参加アドレスの削除で stderr 注記）
- [ ] `src/commands/update.ts`: `UpdateHandlerDeps` に `getEvent` を追加
- [ ] `src/commands/update.ts`: `--add-attendee` / `--remove-attendee` 指定時のみ `getEvent` を呼ぶマージ処理
- [ ] `src/commands/update.ts`: `--attendee` / `--clear-attendees` との conflict 設定
- [ ] `src/commands/update.ts`: 同一アドレスの add/remove 同時指定を `INVALID_ARGS`
- [ ] `src/commands/update.ts`: `organizer: true` の削除を `INVALID_ARGS`
- [ ] `src/commands/update.ts`: dry-run のマージ結果表示
- [ ] `src/commands/index.ts`: `update` サブコマンドに `getEvent` を注入
- [ ] `spec/commands.md`: オプション追加、全置換モードとの使い分け、後勝ちの注記
- [ ] `tests/integration/update-pipeline.test.ts`: get → merge → patch の一連が繋がること
- [ ] `bun run test` pass
- [ ] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/attendees.test.ts`（041 で作成）に追記する。`--notify` は指定しない。

- [ ] 出席者 2 名のイベントを作り、`--add-attendee` で 3 名になること（既存 2 名が保持されること）
- [ ] `--remove-attendee` で 1 名減り、他が保持されること
- [ ] 未参加アドレスの `--remove-attendee` が exit code 0 で stderr に注記を出すこと
- [ ] `--attendee` と `--add-attendee` の同時指定が exit code 3 であること
- [ ] 作成したイベントを cleanup で削除する

## Acceptance Criteria

- [ ] `--add-attendee` が既存の出席者を保持したまま追加する
- [ ] `--remove-attendee` が既存の出席者を保持したまま削除する
- [ ] メールアドレスの比較が大文字小文字を区別しない
- [ ] 既に居るアドレスの追加が no-op（`responseStatus` が保持される）
- [ ] 未参加アドレスの削除がエラーにならず stderr に注記が出る
- [ ] 主催者の削除が `INVALID_ARGS` で弾かれる
- [ ] `--attendee` / `--clear-attendees` との併用が弾かれる
- [ ] `--add-attendee` / `--remove-attendee` 未指定のとき `getEvent` が呼ばれない
- [ ] dry-run でマージ結果が表示され、更新は実行されない
- [ ] 既存テストが pass する
