# Task: gcal add UX改善 — 全日イベント自動判定・end省略・duration対応

## Purpose

`gcal add` コマンドのUXを改善する。`--all-day` フラグを廃止し `--start` のフォーマットで全日/時間指定を自動判定する。`--end` を省略可能にし、`--duration` オプションを追加する。全日イベントの `--end` を inclusive にし、API の exclusive 形式への変換を内部で行う。

## Context

- Related files: `src/commands/add.ts`, `src/lib/api.ts`, `src/types/index.ts`
- Related tests: `tests/unit/add.test.ts`, `tests/integration/add-pipeline.test.ts`, `tests/e2e/add.test.ts`
- Related specs: `spec/commands.md` (add section)
- Dependencies: none

## Breaking Changes

- `--all-day` フラグを削除（`--start` のフォーマットで自動判定）
- `--end` を任意に変更（デフォルト: 全日=同日、時間指定=+1h）
- 全日イベントの `--end` を inclusive に変更（内部で +1日して API に渡す）

## Implementation Steps

### 1. Duration パーサー追加

- [ ] `src/lib/duration.ts` を作成
- [ ] `parseDuration(input: string)` を実装: `30m`, `1h`, `2d`, `1h30m` などをパース
- [ ] 返り値: `{ minutes?: number, hours?: number, days?: number }` またはミリ秒数
- [ ] テスト: 各パターンのパース、不正入力のエラー

### 2. 日付フォーマット判定ユーティリティ

- [ ] `isDateOnly(input: string): boolean` を実装（`YYYY-MM-DD` にマッチするか）
- [ ] テスト

### 3. add コマンド定義の変更

- [ ] `--all-day` オプションを削除
- [ ] `--end` を任意に変更（`requiredOption` → `option`）
- [ ] `--title`, `--start` を `requiredOption` に変更
- [ ] `--duration <duration>` オプションを追加
- [ ] `--end` と `--duration` の conflicts 設定
- [ ] `afterHelp` で Examples セクションを追加
- [ ] option の description を充実させる（複数行説明）

### 4. ハンドラロジックの変更

- [ ] `AddOptions` から `allDay` を削除、`duration` を追加、`end` を optional に変更
- [ ] `--start` フォーマット判定で全日/時間指定を自動決定
- [ ] `--end` 省略時のデフォルト算出:
  - 全日: start と同日
  - 時間指定: start + 1時間
- [ ] `--duration` 指定時の end 算出:
  - 全日: start + N日
  - 時間指定: start + duration
- [ ] 全日イベントの `--end` を inclusive → exclusive に変換（+1日）
- [ ] `--start` と `--end` の型不一致バリデーション（日付と日時の混在はエラー）
- [ ] `--end` と `--duration` の同時指定バリデーション

### 5. API 層の確認

- [ ] `buildTimeFields` は既存のまま使えるか確認（allDay フラグの渡し方）
- [ ] `CreateEventInput.allDay` は内部で自動設定するため、外部から渡す必要がなくなる可能性を検討

### 6. テスト更新

- [ ] 既存の add テスト（unit, integration）を新仕様に合わせて更新
- [ ] 新規テストケース:
  - 日付のみ start → 全日イベント（allDay 自動判定）
  - end 省略 → 全日1日 / 時間指定+1h
  - duration 指定 → 正しい end 算出
  - inclusive end → exclusive 変換（+1日）
  - start/end 型不一致 → エラー
  - end + duration 同時指定 → エラー
  - afterHelp の Examples が help 出力に含まれる

### 7. lint / format

- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] `gcal add -t "Test" -s "2026-03-01"` で全日1日イベントが作成される
- [ ] `gcal add -t "Test" -s "2026-03-01" -e "2026-03-03"` で3日間の全日イベントが作成される
- [ ] `gcal add -t "Test" -s "2026-03-01T10:00"` で1時間の時間指定イベントが作成される
- [ ] `gcal add -t "Test" -s "2026-03-01T10:00" --duration 30m` で30分イベントが作成される
- [ ] `gcal add --help` で Examples セクションが表示される

## Acceptance Criteria

- [ ] `--all-day` フラグが削除されている
- [ ] `--start` のフォーマットで全日/時間指定が自動判定される
- [ ] `--end` 省略時に適切なデフォルトが適用される
- [ ] `--duration` で end の代わりに期間を指定できる
- [ ] 全日イベントの `--end` が inclusive として扱われる
- [ ] `--help` に Examples セクションが表示される
- [ ] option の description が振る舞いを説明している
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
