# Task: 繰り返し予定の本体更新で例外（個別変更した回）を黙って上書きしない

## Purpose

`gcal update <series-master-id>` が `events.patch` で本体を更新すると、Google は
書き込んだフィールドを個別変更済みの回にも上書きする。2026-10-08 にシリーズ
`3hm9ko86vitkp5d7424sebsfj3` の 8/13・9/10 の回の説明が消えた (#70)。

## Context

- Related files: `src/commands/update.ts`, `src/lib/recurring-exceptions.ts`, `src/lib/api.ts`
- Related specs: `spec/commands.md`（`gcal update` の Recurring series 節）

## Implementation Steps

- [x] `events.instances` を API 抽象に追加し、`listInstances` / `patchInstance` を実装
- [x] 変更フィールドについて本体と異なる値を持つ回を検出（時刻変更時は全フィールド）
- [x] 該当があればフラグ無しで中止、`--preserve-exceptions` / `--overwrite-exceptions`
- [x] `--dry-run` で該当する回を表示
- [x] help と spec を更新

## E2E Test

- [x] テスト用シリーズで Google の挙動を実測（フィールド上書き、時刻変更で例外リセット）し、作成後削除

## Acceptance Criteria

- [x] 非繰り返し / 例外なし / 例外あり（中止・保持・上書き）の単体テスト
