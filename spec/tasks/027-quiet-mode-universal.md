# Task: --quiet を全コマンドで動作するように拡張

Closes #36

## Purpose

グローバルオプション `--quiet` を全コマンドで動作させる。スクリプト連携やパイプでの利用を想定し、各コマンドが最小限の機械処理しやすい出力を返すようにする。

## Context

- Related files: `src/commands/search.ts`, `src/commands/show.ts`, `src/commands/add.ts`, `src/commands/update.ts`, `src/commands/index.ts`
- Related tests: 全コマンドテスト
- Related specs: `spec/commands.md`, `spec/output.md`
- Dependencies: 023-option-conflict-fixes, 026-write-command-output-consistency

## Changes

### 現状の quiet 対応状況

| コマンド | 対応 | 備考 |
|---|---|---|
| list | Yes | コンパクト表示 |
| calendars | Yes | ID のみ |
| delete | Yes | 出力抑制 |
| init | Yes | パスのみ |
| search | **No** | `globalOpts.quiet` 未使用 |
| show | **No** | `globalOpts.quiet` 未使用 |
| add | **No** | `globalOpts.quiet` 未使用 |
| update | **No** | `globalOpts.quiet` 未使用 |

### 追加する quiet 動作

| コマンド | quiet 出力 | 用途 |
|---|---|---|
| search | list と同じ `MM/DD HH:MM-HH:MM Title` 形式 | 結果をパイプで処理 |
| show | `Title\tStart\tEnd` (TSV 1行) | スクリプトで値を取得 |
| add | 作成された event ID のみ | `gcal add -q ... \| xargs gcal show` |
| update | 更新された event ID のみ | パイプ連携 |

## Implementation Steps

### 1. search の quiet 対応

- [ ] `src/commands/index.ts`: search ハンドラに `quiet: globalOpts.quiet` を渡す
- [ ] `src/commands/search.ts`: `SearchHandlerOptions` に `quiet` 追加
- [ ] `src/commands/search.ts`: quiet 時は list と同じコンパクト形式で出力（`formatQuietText` 相当）

### 2. show の quiet 対応

- [ ] `src/commands/index.ts`: show ハンドラに `quiet: globalOpts.quiet` を渡す
- [ ] `src/commands/show.ts`: `ShowHandlerOptions` に `quiet` 追加
- [ ] `src/commands/show.ts`: quiet 時は `Title\tStart\tEnd` の TSV 1行

### 3. add の quiet 対応

- [ ] `src/commands/add.ts`: `AddOptions` に `quiet` 追加
- [ ] `src/commands/add.ts`: quiet 時は event ID のみ出力
- [ ] `src/commands/index.ts`: add ハンドラに `quiet: globalOpts.quiet` を渡す

### 4. update の quiet 対応

- [ ] `src/commands/index.ts`: update ハンドラに `quiet: globalOpts.quiet` を渡す
- [ ] `src/commands/update.ts`: `UpdateHandlerOptions` に `quiet` 追加
- [ ] `src/commands/update.ts`: quiet 時は event ID のみ出力

### 5. テスト・ドキュメント

- [ ] 各コマンドの quiet テスト追加
- [ ] `spec/commands.md` 更新: 各コマンドに quiet 動作を記載
- [ ] `spec/output.md` 更新: quiet 出力の一覧を追加
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal search -q "meeting"` がコンパクト形式で出力される
- [ ] `gcal show -q <event-id>` が TSV 1行で出力される
- [ ] `gcal add -q -t "Test" -s "2026-03-01T10:00"` が event ID のみ出力される
- [ ] `gcal update -q <event-id> -t "New"` が event ID のみ出力される

## Acceptance Criteria

- [ ] search, show, add, update で `--quiet` が動作する
- [ ] quiet 出力がスクリプト処理に適した形式である
- [ ] `gcal add -q ... | xargs gcal show` のパイプ連携が動作する
- [ ] JSON モード (`-f json`) では quiet の影響を受けない
- [ ] `spec/commands.md` と `spec/output.md` が更新されている
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
