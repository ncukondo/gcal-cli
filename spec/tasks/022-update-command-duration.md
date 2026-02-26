# Task: gcal update に --duration サポートと --start/--end 単独指定を追加

## Purpose

`gcal update` コマンドの時間変更UXを `gcal add` と整合させる。現在 `update` では `--start` と `--end` の両方を必ず指定する必要があり、`--duration` もサポートしていない。`add` コマンドと同様のオプション体系にし、help の情報量も揃える。

## Context

- Related files: `src/commands/update.ts`, `src/lib/api.ts`, `src/lib/duration.ts`, `src/lib/date-utils.ts`
- Related tests: `tests/unit/update.test.ts`, `tests/integration/update-pipeline.test.ts`, `tests/e2e/update.test.ts`
- Related specs: `spec/commands.md` (update section)
- Dependencies: none (duration.ts, date-utils.ts は task 021 で作成済み)
- Related tasks: 021-add-command-ux

## Changes

### 1. `--duration` オプション追加

- `--duration <duration>` を追加（e.g. `30m`, `1h`, `2d`, `1h30m`）
- `--end` と `--duration` は相互排他（conflicts 設定）
- `add` と同じ `parseDuration()` を使用

### 2. `--start` 単独指定の許可

- 現在: `--start` 指定時は `--end` も必須 → エラー
- 変更後: `--start` のみ指定可能。既存イベントの duration を維持して end を自動算出
  - 既存イベントを GET して現在の start/end から duration を算出
  - 新しい start + 算出した duration → 新しい end
- `--end` 単独指定も許可（同様に start は既存を維持）

### 3. 全日イベント対応・型変換

- `--start` のフォーマットで全日/時間指定を自動判定（`add` と同じ `isDateOnly()` ロジック）
- 全日イベントの `--end` は inclusive（内部で +1日して API に渡す）
- `--duration` の全日イベントでは日単位のみ許可（sub-day はエラー）
- **型変換が発生する場合は stderr で警告**:
  - `⚠ Event type changed from timed to all-day`
  - `⚠ Event type changed from all-day to timed`

### 4. help の充実

- option description を `add` と同等の情報量にする
- `addHelpText("after", ...)` で Examples セクションを追加

## Implementation Steps

### 1. ハンドラの依存関係追加

- [ ] `handleUpdate` に既存イベント取得用の `getEvent` 依存を追加（`--start` 単独 or `--end` 単独時に既存イベント情報が必要）
- [ ] `UpdateHandlerOptions` に `duration` フィールドを追加
- [ ] `UpdateHandlerOptions` に `writeStderr` を追加（型変換警告用）

### 2. 時間更新ロジックの変更

- [ ] `--start` + `--end` 両方指定: 型一致バリデーション、全日判定、inclusive end 変換
- [ ] `--start` + `--duration` 指定: start + duration → end を算出
- [ ] `--start` のみ指定: 既存イベントから duration を算出 → 新 start + duration → 新 end
- [ ] `--end` のみ指定: 既存 start を維持し end のみ更新
- [ ] `--duration` のみ指定: 既存 start を維持し start + duration → 新 end
- [ ] 全日イベント判定（`isDateOnly`）と inclusive end 変換
- [ ] start/end の型不一致バリデーション（日付と日時の混在はエラー）
- [ ] 型変換検出: 既存イベントの allDay と新しい allDay を比較し、変わった場合 stderr に警告

### 3. コマンド定義の変更

- [ ] `--duration <duration>` オプション追加
- [ ] `--end` と `--duration` の conflicts 設定
- [ ] `--start` description: `add` と同等の説明（日付のみ=全日、日時=時間指定、省略時の挙動）
- [ ] `--end` description: 省略時の挙動、全日 inclusive の説明
- [ ] `--duration` description: 使い方と相互排他の説明
- [ ] `addHelpText("after", ...)` で Examples セクション追加

### 4. テスト

- [ ] 既存テストの更新（start+end 必須の前提を修正）
- [ ] 新規テストケース:
  - `--start` のみ指定 → 既存 duration 維持
  - `--end` のみ指定 → 既存 start 維持
  - `--duration` のみ指定 → 既存 start + duration
  - `--start` + `--duration` → end 算出
  - `--end` + `--duration` → エラー（conflicts）
  - 全日イベントの `--start` (日付のみ) → allDay 判定
  - 全日 `--end` inclusive → exclusive 変換
  - 全日 `--duration` sub-day → エラー
  - start/end 型不一致 → エラー
  - 型変換時の stderr 警告メッセージ

### 5. dry-run 対応

- [ ] dry-run 出力に duration 関連の変更を反映

### 6. lint / format

- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal update <id> -s "2026-03-01T11:00"` で start 変更 + 既存 duration 維持
- [ ] `gcal update <id> -e "2026-03-01T12:00"` で end のみ変更
- [ ] `gcal update <id> -s "2026-03-01T10:00" --duration 30m` で start + duration
- [ ] `gcal update <id> --duration 2h` で既存 start + 新 duration
- [ ] `gcal update <id> -s "2026-03-01" -e "2026-03-03"` で全日イベント更新
- [ ] 型変換時に stderr に警告が出力される
- [ ] `gcal update --help` で Examples セクションが表示される

## Acceptance Criteria

- [ ] `--duration` オプションが `update` で使用可能
- [ ] `--end` と `--duration` が相互排他
- [ ] `--start` 単独指定で既存 duration を維持して end を自動算出
- [ ] `--end` 単独指定で start を維持して end のみ更新
- [ ] `--duration` 単独指定で既存 start + duration → end
- [ ] 全日イベントの自動判定と inclusive end 変換が動作する
- [ ] 型変換時に stderr で警告が表示される
- [ ] `--help` に Examples セクションが表示される
- [ ] option description が振る舞いを十分に説明している
- [ ] `add` コマンドと同等の日時処理ロジックが適用される
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
