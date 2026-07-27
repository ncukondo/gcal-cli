# Task: 複数日にまたがるイベントを全ての日付グループに表示

## Purpose

複数日にまたがるイベントが `gcal list` のテキスト出力で**開始日のグループにしか表示されない**問題を修正する (#53)。

2日目以降の日付だけを `--from` / `--to` で指定しても何も出力されず、その日が空いているように見えるため、空き日程調査で誤判定が起きる。`-f json` は正しくイベントを返すので、テキスト整形層のみの問題。

## Context

- Issue: #53
- Related files:
  - `src/lib/output.ts` — `getDateKey()` (14-19行), `formatEventListText()` (39-71行), `formatTimeRange()` (26-33行), `formatQuietText()` (97-113行), `formatSearchEventLine()` (73-81行)
  - `src/lib/date-utils.ts` — `addDaysToDateString()` を再利用
  - `src/commands/list.ts` — `handleList()` から表示範囲を渡す (167-175行)
  - `src/commands/search.ts` — `formatQuietText` / `formatSearchResultText` の呼び出し元 (104-106行)
- Related specs: `spec/output.md`
- Dependencies: なし

## Root Cause

`getDateKey()` がイベントの `start` だけを返し、その値でグループ化しているため、イベントが占有する期間 (`start` 〜 `end`) が考慮されていない。

## Design Decisions

### 展開ロジックの分離

新モジュール `src/lib/event-days.ts` に純粋関数として切り出し、単体テストしやすくする。

```ts
export interface DayRange {
  from: string; // YYYY-MM-DD (inclusive)
  to: string;   // YYYY-MM-DD (inclusive)
}

export interface EventDay {
  date: string;        // YYYY-MM-DD
  event: CalendarEvent;
  dayIndex: number;    // 1-based
  dayCount: number;    // イベント全体の占有日数
  startTime: string;   // "HH:MM" — その日の占有開始 (all_day は "")
  endTime: string;     // "HH:MM" — その日の占有終了 (all_day は "")
}

export function expandEventsByDay(events: CalendarEvent[], range?: DayRange): EventDay[];
```

- `range` を渡すとその範囲外の日付を切り捨てる (clip)。省略時は全期間を展開。
- 出力は `date` 昇順 → 同一日内は元の並び順を維持。

### 終日イベント

- Google Calendar API の仕様で `end` は **exclusive**（`2026-12-05`〜`2026-12-07` は 12/5・12/6 の2日間）。`dayCount = end - start` 日。
- ラベルは `dayCount === 1` なら従来どおり `[All Day]`、2日以上なら `[All Day 1/2]` `[All Day 2/2]`。

### 時刻指定イベントの日またぎ

- 各日の**実際の占有時間帯**を表示する。初日 `23:00-24:00` / 翌日 `00:00-01:00` / 中日 `00:00-24:00`。
- 終了が丁度 00:00 の場合（例 22:00〜翌 00:00）、翌日のグループは**作らない**。
- 日数カウンタ (`n/m`) は付けない — 切り詰められた時間帯自体が継続を示すため。

### 列幅

`formatTimeRange()` の結果は現在 `padEnd(11)`（`10:00-11:00` = 11文字, `[All Day]` = 9文字）。`[All Day 1/2]` は13文字で溢れるため、**出力内の最長ラベルに合わせた動的幅（最小11）** に変更する。複数日イベントを含まない出力は従来と同じ幅を保つ。

### `--quiet` と `search`

- `formatQuietText(events, range?)` — `range` を渡すと日別展開＋clip（`gcal list --quiet` 用）、省略時は1行1イベント（`gcal search --quiet` 用、従来どおり）。
- `search` はイベント中心の一覧なので日別展開はしない。代わりに `formatSearchEventLine()` の終日ラベルに期間を併記する（例 `[All Day 12/05-12/06]`）。

### 表示範囲の受け渡し

`handleList()` の `dateRange` (`timeMin` / `timeMax`) から `DayRange` を導出する。`timeMax` は exclusive なので、時刻部が `00:00` なら1日引いた日付を `to` とする。

### 既知の制限

イベント文字列は表示タイムゾーンで整形済みのため日付・時刻の分割は文字列演算で行う。イベント期間中に UTC オフセットが変わる（DST 移行）ケースは考慮しない。

## Implementation Steps

- [x] `src/lib/event-days.test.ts`: `expandEventsByDay()` の失敗テストを書く（終日単日 / 終日複数日 / clip / 日またぎ時刻 / 終了 00:00 / 3日以上）
- [x] `src/lib/event-days.ts`: `expandEventsByDay()` を実装
- [x] `src/lib/output.test.ts`: `formatEventListText()` の複数日展開・`[All Day n/m]`・動的列幅の失敗テストを追加
- [x] `src/lib/output.ts`: `formatEventListText(events, range?)` を `expandEventsByDay()` ベースに書き換え、グループキーを日付昇順で明示的にソート（ソートは `expandEventsByDay()` 側に集約）
- [x] `src/lib/output.ts`: `formatTimeRange()` を `EventDay` 対応にし、`[All Day n/m]` を出力
- [x] `src/lib/output.test.ts` / `src/lib/output.ts`: `formatQuietText(events, range?)` の日別展開を追加
- [x] `src/lib/output.test.ts` / `src/lib/output.ts`: search 行の終日ラベルに期間を併記（`formatEventSpanLabel()`）
- [x] `src/commands/list.ts`: `dateRange` から `DayRange` を導出して `formatEventListText` / `formatQuietText` に渡す（`toDayRange()`）
- [x] `src/commands/list.test.ts`: 2日目単独指定で複数日イベントが表示されることを確認するテストを追加
- [x] `spec/output.md`: 複数日イベントの表示例と列幅の説明を追加
- [x] `bun run test` pass (unit 677 / integration 72)
- [x] `bun run lint` pass
- [x] `bun run format:check` pass
- [x] `bun run typecheck` pass

## E2E Test

`tests/e2e/multi-day-events.test.ts` として実装（実行結果: 31/31 pass）。

`test:e2e` スクリプトは `Bun.spawn` を使う `tests/e2e/helpers.ts` を Node 上の vitest で実行していたため
`ReferenceError: Bun is not defined` で全滅していた（本タスク以前からの不具合）。`bun run --bun vitest` に修正。

- [x] 複数日の終日イベントを作成し、`gcal list --from <2日目> --to <2日目>` でそのイベントが表示されること
- [x] `gcal list --from <初日> --to <最終日>` で全ての日付グループに `[All Day n/m]` 付きで表示されること
- [x] `gcal list --quiet` で占有日ごとに1行出力されること
- [x] `gcal list -f json` の出力が変わっていないこと（1件のみ・元の start/end を保持）
- [x] 日をまたぐ時刻指定イベントが両日に各日の実占有時間帯で表示されること

## Acceptance Criteria

- [x] 複数日にまたがる終日イベントが、占有する全ての日付グループに表示される
- [x] 終日ラベルに `[All Day 1/2]` の形式で日目が併記される（単日イベントは `[All Day]` のまま）
- [x] 終日イベントの `end` exclusive が正しく扱われる（`12-05`〜`12-07` は2日間）
- [x] 表示範囲外の日付グループが生成されない
- [x] 日をまたぐ時刻指定イベントが両日に、各日の実占有時間帯で表示される
- [x] 終了が丁度 00:00 の時刻指定イベントで翌日のグループが生成されない
- [x] `--quiet` 出力でも複数日イベントが全ての日に表示される
- [x] `search` の終日イベント行に期間が併記される
- [x] JSON 出力は変更されない
- [x] 既存テストが pass する

## Out of Scope

- 終日イベントに `[busy]` / `[free]` タグを付ける（#53 の補足で言及。`transparency: transparent` の終日イベントが見落とされやすい問題だが、既存の出力仕様変更を伴うため別タスクとする）
