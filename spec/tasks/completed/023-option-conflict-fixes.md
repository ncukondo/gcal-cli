# Task: オプション conflict 修正とコマンド間の軽微な不整合修正

Closes #32

## Purpose

list / search コマンドに存在するオプション conflict 漏れ・実装の不整合を修正する。後続のリファクタ（024〜027）の前提となるバグ修正タスク。

## Context

- Related files: `src/commands/list.ts`, `src/commands/search.ts`, `src/commands/show.ts`, `src/commands/index.ts`
- Related tests: `tests/unit/list.test.ts`, `tests/unit/search.test.ts`, `tests/unit/show.test.ts`
- Related specs: `spec/commands.md`
- Dependencies: none

## Changes

### 1. search `--busy`/`--free` に conflicts 設定追加

- list, add, update では `busyOpt.conflicts(["free"])` が設定済み
- search のみ未設定 → 両方指定してもエラーにならない
- `src/commands/search.ts` に conflicts 追加

### 2. list `--days` と `--to` に conflicts 設定追加

- 現状 `--days` は `--today`, `--from` と排他だが `--to` との排他が未設定
- `gcal list --days 7 --to 2026-03-01` で `--days` が黙って無視される
- `--to` と `--days` を相互排他に追加

### 3. list の API 作成パターン修正

- `src/commands/index.ts` の list ハンドラで `as unknown as GoogleCalendarApi` キャストを使用
- 他の全コマンドは `createGoogleCalendarApi()` を使用
- `createGoogleCalendarApi()` に統一

### 4. search `--to` の inclusive 処理を統一

- 現状: `opts.to + "T23:59:59"` で inclusive 化（最後の1秒を取りこぼす）
- list: `addDays(to, 1)` で inclusive 化
- search も `addDays(to, 1)` 方式に統一

### 5. search `--days` の parseInt 修正

- 現状: `Number.parseInt` を直接渡し（Commander のコールバックに index が第2引数として渡されうる）
- list: `(v: string) => Number.parseInt(v, 10)` で radix 指定
- search も radix 指定に統一

### 6. `--include-tentative` description 統一

- list: `"Include tentative events (excluded by default)"`
- search: `"Include tentative events"` （デフォルト動作説明なし）
- search を list と同じ description に統一

### 7. show コマンドの引数取得方法統一

- 現状: `showCmd.action(async () => ...)` で `showCmd.args[0]!` を参照
- 他コマンド: `cmd.action(async (eventId: string) => ...)` でパラメータ受け取り
- show を action パラメータ方式に統一

## Implementation Steps

- [ ] `src/commands/search.ts`: `--busy`/`--free` に `.conflicts()` 追加
- [ ] `src/commands/list.ts`: `--days` と `--to` の `.conflicts()` 追加
- [ ] `src/commands/index.ts`: list ハンドラの API 作成を `createGoogleCalendarApi()` に変更
- [ ] `src/commands/search.ts`: `--to` 処理を `addDays(parseDateTimeInZone(opts.to, timezone), 1)` に変更
- [ ] `src/commands/search.ts`: `--days` パーサを `(v: string) => Number.parseInt(v, 10)` に変更
- [ ] `src/commands/search.ts`: `--include-tentative` description を list と統一
- [ ] `src/commands/index.ts`: show の action をパラメータ受け取りに変更
- [ ] 既存テストの更新（conflict 追加に伴うテスト追加）
- [ ] `spec/commands.md` の list セクションに `--days` と `--to` の排他を反映
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal search "test" --busy --free` がエラーになる
- [ ] `gcal list --days 7 --to 2026-03-01` がエラーになる

## Acceptance Criteria

- [ ] search で `--busy` と `--free` の同時指定がエラーになる
- [ ] list で `--days` と `--to` の同時指定がエラーになる
- [ ] list の API 作成に `as unknown as` キャストが残っていない
- [ ] search の `--to` が +1 day 方式で inclusive 化されている
- [ ] search の `--days` パーサが radix 10 を指定している
- [ ] list と search の `--include-tentative` description が一致している
- [ ] show の引数取得が action パラメータ方式である
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
