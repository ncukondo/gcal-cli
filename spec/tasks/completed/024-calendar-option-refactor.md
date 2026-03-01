# Task: calendar option (-c) をコマンドレベルに移動

Closes #33

## Purpose

グローバルオプション `-c, --calendar` をコマンドレベルに移動し、全コマンドで `gcal <cmd> -c <id>` が一貫して動作するようにする。

## Context

- Related files: `src/cli.ts`, `src/commands/index.ts`, 全コマンドファイル
- Related tests: 全コマンドテスト
- Related specs: `spec/commands.md`
- Dependencies: 023-option-conflict-fixes

## Changes

### 1. グローバルから `-c` を削除

- `src/cli.ts` の `GlobalOptions` から `calendar` を削除
- `createProgram()` の `.option("-c, --calendar ...")` を削除

### 2. 各コマンドにコマンドレベル `-c` を定義

| コマンド | 定義 | 備考 |
|---|---|---|
| list | `-c, --calendar <id>` repeatable | 複数カレンダーから取得 |
| search | `-c, --calendar <id>` repeatable | 複数カレンダーから取得 |
| show | `-c, --calendar <id>` single | 対象カレンダー1つ（既存） |
| add | `-c, --calendar <id>` single | **新規追加** |
| update | `-c, --calendar <id>` single | 既存 |
| delete | `-c, --calendar <id>` single | 既存 |

### 3. index.ts のカレンダー解決ロジック統一

- 各ハンドラで `cmdOpts.calendar` を直接使用
- `globalOpts.calendar` への fallback を削除
- カレンダー未指定時の解決ロジック（config から取得）は維持

## Implementation Steps

- [ ] `src/cli.ts`: `GlobalOptions` から `calendar` を削除、`createProgram()` から `-c` オプション削除
- [ ] `src/commands/list.ts`: `createListCommand()` に `-c` repeatable を追加
- [ ] `src/commands/search.ts`: `createSearchCommand()` に `-c` repeatable を追加
- [ ] `src/commands/add.ts`: `createAddCommand()` に `-c` single を追加
- [ ] show, update, delete: 既存の `-c` 定義を維持（変更不要）
- [ ] `src/commands/index.ts`: 全ハンドラで `globalOpts.calendar` 参照を `cmdOpts.calendar` に変更
- [ ] テスト更新: グローバル `-c` テストをコマンドレベル `-c` テストに変更
- [ ] `spec/commands.md` 更新: Global Options から `-c` を削除、各コマンドに `-c` を記載
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal list -c primary --today` で動作する
- [ ] `gcal add -c primary -t "Test" -s "2026-03-01"` で動作する（従来エラーだったケース）
- [ ] `gcal search "test" -c primary` で動作する

## Acceptance Criteria

- [ ] `src/cli.ts` の `GlobalOptions` に `calendar` が存在しない
- [ ] 全コマンドで `gcal <cmd> -c <id>` が動作する
- [ ] list, search は `-c` を複数回指定可能
- [ ] add, update, delete, show は `-c` を1つ指定
- [ ] `-c` 未指定時は config のカレンダー設定から解決される
- [ ] `spec/commands.md` が更新されている
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
