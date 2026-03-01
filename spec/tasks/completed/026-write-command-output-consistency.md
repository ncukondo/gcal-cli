# Task: 書き込み系コマンドの出力と dry-run を統一

Closes #35

## Purpose

add / update / delete の成功時出力フォーマットを統一し、add に `--dry-run` を追加する。AI エージェントが全書き込みコマンドを同じパターンで処理できるようにする。

## Context

- Related files: `src/commands/add.ts`, `src/commands/update.ts`, `src/commands/delete.ts`
- Related tests: `tests/unit/add.test.ts`, `tests/unit/update.test.ts`, `tests/unit/delete.test.ts`
- Related specs: `spec/commands.md`, `spec/output.md`
- Dependencies: 023-option-conflict-fixes

## Changes

### 1. update の成功メッセージ追加

- text 出力: `"Event updated"` + 空行 + イベント詳細（add と同じパターン）
- JSON: `{ event, message: "Event updated" }` に `message` フィールド追加

### 2. add に `--dry-run` サポート追加

- `createAddCommand()` に `--dry-run` オプション追加
- dry-run text 出力:
  ```
  DRY RUN: Would create event:
    title: "Meeting"
    start: "2026-03-01T10:00:00+09:00"
    end: "2026-03-01T11:00:00+09:00"
  ```
- dry-run JSON 出力:
  ```json
  { "dry_run": true, "action": "add", "event": { "title": "...", "start": "...", "end": "...", ... } }
  ```

### 3. 統一後のフォーマット一覧

| コマンド | text | JSON data |
|---|---|---|
| add | `"Event created"` + 詳細 | `{ event, message: "Event created" }` |
| update | `"Event updated"` + 詳細 | `{ event, message: "Event updated" }` |
| delete | `"Event deleted"` | `{ deleted_id, message: "Event deleted" }` |

## Implementation Steps

- [ ] `src/commands/update.ts`: text 出力に `"Event updated\n\n"` プレフィックス追加
- [ ] `src/commands/update.ts`: JSON に `message: "Event updated"` 追加
- [ ] `src/commands/add.ts`: `createAddCommand()` に `--dry-run` オプション追加
- [ ] `src/commands/add.ts`: `handleAdd` に dry-run ロジック追加
- [ ] テスト追加: update のメッセージ、add の dry-run
- [ ] `spec/commands.md` 更新: add に `--dry-run` を追記
- [ ] `spec/output.md` 更新: update の JSON に message を反映、add dry-run 出力例を追記
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal add --dry-run -t "Test" -s "2026-03-01T10:00"` がイベントを作成せずプレビューを表示する
- [ ] `gcal add --dry-run -t "Test" -s "2026-03-01T10:00" -f json` が dry-run JSON を返す
- [ ] `gcal update <id> -t "New"` の出力に `"Event updated"` メッセージが含まれる
- [ ] `gcal update <id> -t "New" -f json` の JSON に `message` フィールドがある

## Acceptance Criteria

- [ ] update の text 出力が `"Event updated"` で始まる
- [ ] update の JSON に `message: "Event updated"` が含まれる
- [ ] add に `--dry-run` オプションがある
- [ ] add の dry-run がイベントを作成しない
- [ ] add の dry-run が text / JSON 両方で適切に出力される
- [ ] `spec/commands.md` と `spec/output.md` が更新されている
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
