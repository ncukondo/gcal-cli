# Task: Search range stderr feedback & negative --days

## Purpose

searchコマンドの検索期間をstderrで表示し、負の `--days` で過去検索をサポートする。ユーザーがどの期間を検索したのか把握できるようにし、期間変更のヒントも提供する。

## Context

- Related files: `src/commands/search.ts`, `src/commands/index.ts`
- Dependencies: none
- Related specs: `spec/commands.md` (search section)

## Implementation Steps

- [ ] `SearchHandlerOptions` に `writeErr?: (msg: string) => void` を追加
- [ ] `handleSearch` で `const writeErr = opts.writeErr ?? (() => {})` を設定
- [ ] `--days` に負の値を指定した場合の日付計算ロジック追加（`--days -30` → 30日前〜現在）
- [ ] 検索期間メッセージを stderr に出力: `Searching: 2026-01-25 to 2026-02-24`
- [ ] ヒントメッセージを stderr に出力: `Tip: Use --days <n> or --from/--to to change the search range.`
- [ ] `src/commands/index.ts` で search の `handleSearch` 呼び出しに `writeErr` を追加
- [ ] テスト: デフォルト30日の期間メッセージ
- [ ] テスト: `--days 60` の期間メッセージ
- [ ] テスト: `--days -30` で過去方向の期間メッセージ
- [ ] テスト: `--from`/`--to` の期間メッセージ
- [ ] テスト: ヒントメッセージが常に出力される
- [ ] lint/format check

## E2E Test

- [ ] `gcal search "test"` で stderr に検索期間とヒントが表示される
- [ ] `gcal search "test" --days -30` で過去30日間の検索期間が表示される

## Acceptance Criteria

- [ ] 検索実行時に stderr へ `Searching: <from> to <to>` 形式で期間が表示される
- [ ] `--days` に負の値を指定すると過去方向の検索が行われる
- [ ] 検索結果件数に関わらず stderr へヒントメッセージが表示される
- [ ] stdout の出力（イベント一覧・JSON）に影響がない
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
