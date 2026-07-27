# Task: 終日イベントの free/busy を可視化し、--busy による非表示を通知

## Purpose

Google カレンダーは終日イベントを既定で `transparency: transparent`（予定なし）にするため、`gcal list --busy` が実際に埋まっている終日予定を全部落とす (#55)。#53 と同じ「埋まっている日が空きに見える」誤判定がフィルタ経路で起きる。

Google の free/busy 定義自体は曲げず、**(A) 終日イベントにもタグを表示** し、**(B) `--busy` が隠した終日イベントを件名付きで stderr に通知** することで、誤判定を防ぐ。

## Context

- Issue: #55（#53 の関連）
- Related files:
  - `src/lib/output.ts` — `formatEventListText()`, `formatSearchResultText()`
  - `src/lib/filter.ts` — `filterByTransparency()`, `applyFilters()`
  - `src/commands/list.ts` — `handleList()`
  - `src/commands/search.ts` — `handleSearch()`
- Related specs: `spec/output.md`, `spec/commands.md`
- Dependencies: 039-multi-day-event-display（同じ描画コードを触るため、そのブランチに積む）

## Design Decisions

### (A) 終日イベントへのタグ表示

`formatEventListText()` / search 行は現在 `event.all_day` のとき `transparencyTag()` を呼ばない。これを撤廃し、終日・時刻指定を問わず `[busy]` / `[free]` を出す。

```
2026-09-05 (Sat)
  [All Day 1/2]   日本看護研究学会第52回学術集会 (ncukondo@gmail.com) [free]
  [All Day]       【宿泊】ホテルココ・グラン高崎（朝食付） (ncukondo@gmail.com) [free]
```

`--quiet` は機械処理向けの形式なので変更しない（元々どのイベントにもタグを出していない）。
`gcal show` は既に `Availability: free/busy` を出しているため変更なし。

### (B) 隠した終日イベントの通知

`--busy` のときだけ通知する。`--free` が opaque な終日イベントを落とすケースは、
「予定なし」を明示的に探しているので誤判定の危険がなく、通知しない。

対象は **transparency フィルタが落とした終日イベント**のみ。時刻指定イベントが `--busy` で落ちるのは
ユーザーの明示的な意図どおりなので通知しない（通知すると `--busy` のたびに大量のノイズになる）。
status フィルタで落ちるイベント（cancelled / tentative）も対象外。

`src/lib/filter.ts` に純粋関数を追加する:

```ts
export function findHiddenAllDayEvents(
  events: CalendarEvent[],
  options: FilterOptions,
): CalendarEvent[];
```

出力（stderr、最大5件まで列挙し残りは件数のみ）:

```
Note: 3 all-day events are hidden by --busy (Google Calendar marks all-day events as free by default):
  2026-09-05  日本看護研究学会第52回学術集会@フォルダー作成済
  2026-09-05  【宿泊】ホテルココ・グラン高崎（朝食付）
  2026-09-05  Stay at ホテルココ・グラン高崎
```

6件以上のときは末尾に `  ... and N more` を付ける（無言で切り捨てない）。

### `--quiet` との関係

各コマンドの既存の慣習に合わせる。`list` は `--quiet` でも stderr の警告を出す
（`--from not specified` の警告と同じ扱い）。`search` は `handleSearch()` が `quiet` のとき
`writeErr` を握り潰す実装（`search.ts:39`）なので、そちらに従い通知しない。

### Out of Scope

`gcal add` の終日イベントが `transparency: opaque` 固定で Google UI（`transparent`）と逆になる件
（`src/commands/add.ts:80`）。**メンテナ判断により現状維持**（opaque デフォルトのままとする）。

## Implementation Steps

- [x] `src/lib/filter.test.ts`: `findHiddenAllDayEvents()` の失敗テストを書く（--busy で終日 transparent のみ返す / 時刻指定は返さない / --free と未指定では空 / cancelled・tentative は除外）
- [x] `src/lib/filter.ts`: `findHiddenAllDayEvents()` を実装
- [x] `src/lib/output.test.ts`: 終日イベントにタグが出ることの失敗テストを追加、既存の「タグを出さない」テストを反転
- [x] `src/lib/output.ts`: `formatEventListText()` / `formatSearchResultText()` の all_day 分岐を撤廃
- [x] `src/commands/list.test.ts` / `src/commands/list.ts`: `--busy` 時の stderr 通知（件数・件名・5件超の省略）
- [x] `src/commands/search.test.ts` / `src/commands/search.ts`: 同上（`--quiet` 時は出さない）
- [x] `spec/output.md`: 終日イベントのタグ表示を反映
- [x] `spec/commands.md`: `--busy` の注意書きを追加
- [x] `tests/e2e/multi-day-events.test.ts` or 新規: 終日イベントが `--busy` で隠れたとき stderr に件名が出ること
- [x] `bun run test` pass
- [x] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/all-day-free-busy.test.ts` として実装（全体 37/37 pass）。

- [x] 終日イベント（transparent）を作成し、`gcal list --busy` で stderr に件数と件名が出ること
- [x] `gcal list` の通常出力で終日イベントに `[free]` が付くこと
- [x] `--free` / フィルタなしでは通知が出ないこと
- [x] `-f json` の stdout が parse 可能なまま通知が stderr に出ること

## Acceptance Criteria

- [x] 終日イベント行に `[busy]` / `[free]` が表示される
- [x] `--busy` で終日イベントが隠れたとき、件数と件名が stderr に出る
- [x] 6件以上のときは省略件数が明示される
- [x] 時刻指定イベントが `--busy` で落ちても通知されない
- [x] `--free` では通知されない
- [x] `search --quiet` では通知されない
- [x] JSON 出力は変更されない
- [x] 既存テストが pass する

## Notes

- `spec/commands.md` の「Quiet mode: Stderr messages suppressed」は `list` の実装と食い違っていた
  （`list --quiet` は `--from not specified` 警告を stderr に出す）。実装に合わせて spec を修正した。
  `search --quiet` は `search.ts:39` で stderr を握り潰す実装のままとし、両者の差を spec に明記した。
