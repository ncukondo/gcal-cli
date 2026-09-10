# Task: `tasks list` に `--today` / `--overdue` / `--days` を追加する

GitHub issue: #66

## Purpose

秘書エージェントが毎朝「本日のタスク」を確認するとき、現状は次の 2 つを自分で組み立てる必要がある。

```
gcal tasks list -l Calendar --due-before $(date +%F)                          # 今日 + 期限超過
gcal tasks list -l Calendar --due-after $(date +%F) --due-before $(date +%F)  # 今日だけ
```

`--due-before` / `--due-after` 自体は両端を含む正しい動作をしているが、この形を毎回思い出せず、
`gcal tasks list -l Calendar | head -60` から始めて見逃すことが繰り返されている。
`gcal list --today` があるのに `tasks list` に同等の指定がない、という非対称も原因のひとつ。

049（期日順ソート）と合わせて、エージェント側は `gcal tasks list -l Calendar --overdue` の
1 コマンドで「今日までにやること」を確実に取れるようになる。

## Context

- Related files:
  - `src/commands/tasks/index.ts` — `tasks list` のオプション定義
  - `src/commands/tasks/list.ts` — `handleTaskList()`、`filterTasks()`、`isValidDateString()`
  - `src/commands/index.ts` — `tasksListCmd.action`（オプションをハンドラに渡す）
  - `src/commands/list.ts` — `--today` / `--days` の定義と `conflicts()` の使い方、`todayInZone()`
  - `src/lib/timezone.ts` — `resolveTimezone()`
  - `src/lib/date-utils.ts` — `addDaysToDateString()`
- Related specs: `spec/google-tasks.md`, `spec/commands.md`
- Dependencies: **049**（並べ替えが無いとショートカットの効果が薄い。049 のブランチを
  ベースにする）

## Design Decisions

### 3 つのショートカットを `--due-after` / `--due-before` の糖衣として定義する

「今日」を `T`（`YYYY-MM-DD`）とすると:

| Option        | 意味                                | 等価な指定                                    |
|---------------|-------------------------------------|-----------------------------------------------|
| `--today`     | 今日 due                            | `--due-after T --due-before T`                |
| `--overdue`   | 今日までに due（期限超過 + 今日）   | `--due-before T`                              |
| `--days <n>`  | 今日から n 日以内（今日を含む）     | `--due-after T --due-before (T + n - 1 日)`   |

- 内部的には `dueAfter` / `dueBefore` に変換して既存の `filterTasks()` に渡す。
  フィルタの実装は増やさない。
- ステータスの絞り込み（既定は `needsAction` のみ、`--all` / `--completed`）とは直交する。
  `--overdue` で「未完了のみ」になるのは既定のステータスフィルタの結果であり、
  `--overdue --all` なら完了済みも出る。
- `--days` は `gcal list --days` と同じく正の整数のみ。0 以下は `--days must be a positive integer`
  でエラー（`ExitCode.ARGUMENT`）。`--days 1` は `--today` と同じ。
- 期日なしのタスクはいずれのショートカットでも出ない（既存の `--due-*` と同じ）。

### 「今日」の基準は `gcal list --today` と同じ

`gcal list --today` は `resolveTimezone(globalOpts.timezone, config.timezone)` で決めた
タイムゾーンでの今日（`todayInZone()`）を使っている。`tasks list` も同じにする。
`handleTaskList` に `timezone: string` と、テスト用に差し替えられる `now?: () => Date` を渡す。
`todayInZone()` は `src/commands/list.ts` のローカル関数なので、`src/lib/date-utils.ts`
（または `timezone.ts`）に移して両方から使う。

`due` は Google Tasks API から `T00:00:00.000Z` の日付のみで返り、`YYYY-MM-DD` に
正規化済みなので、`due` 側のタイムゾーン変換は不要。

### 競合はコマンド定義で弾く

`--today` / `--overdue` / `--days` は互いに排他、かつ `--due-before` / `--due-after` とも排他。
`src/commands/list.ts` と同じく commander の `Option.conflicts()` で宣言し、エラーの出方
（メッセージ・終了コード）は既存のオプション競合と同じにする。

`--overdue` と `--days` の組み合わせ（「期限超過 + 今後 n 日」）は要望があれば別 issue で扱う。

### Out of Scope

- `--overdue` と `--days` の併用
- 負の `--days`
- 出力形式の変更（JSON にフィルタ条件を含める等）

## Changes

### `gcal tasks list`

```bash
gcal tasks list --today               # 今日 due
gcal tasks list --overdue             # 今日までに due（期限超過を含む）
gcal tasks list --days 3              # 今日から 3 日以内
gcal tasks list -l Calendar --overdue -f json
```

`spec/commands.md` / `spec/google-tasks.md` の Options に 3 つを追加し、
`--due-before` / `--due-after` との排他を明記する。

## Implementation Steps

- [ ] `src/lib/date-utils.ts`（または `timezone.ts`）: `todayInZone()` を移動・export
      （`src/commands/list.ts` から参照を差し替え、既存テストが通ること）
- [ ] `src/commands/tasks/list.test.ts`: `--today` が今日 due のみ返すこと（`now` を固定）
- [ ] `src/commands/tasks/list.test.ts`: `--overdue` が期限超過 + 今日を返し、明日以降と
      期日なしを含まないこと
- [ ] `src/commands/tasks/list.test.ts`: `--days 3` が今日〜2 日後を含み 3 日後を含まないこと、
      `--days 0` がエラーになること
- [ ] `src/commands/tasks/list.test.ts`: タイムゾーンをまたぐケース（`now` を UTC 23:30 に固定し、
      `Asia/Tokyo` では翌日扱いになること）
- [ ] `src/commands/tasks/list.ts`: `today` / `overdue` / `days` / `timezone` / `now` を
      `HandleTaskListOptions` に追加し、`dueAfter` / `dueBefore` に変換
- [ ] `src/commands/tasks/index.ts`: オプション定義と `conflicts()`
- [ ] `src/commands/index.ts`: `tasksListCmd.action` で `timezone` を解決しハンドラに渡す
- [ ] `spec/commands.md` / `spec/google-tasks.md`: Options と排他を追記
- [ ] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

- [ ] `tests/e2e/`: `gcal tasks list --today -f json` が `success: true` を返し、
      `data.tasks` の各 `due` が今日の日付であること（0 件でもよい）
- [ ] `gcal tasks list --today --due-before 2026-01-01` が競合エラー（0 以外の終了コード）になること

## Acceptance Criteria

- [ ] `--today` / `--overdue` / `--days <n>` が上の表のとおりに絞り込む
- [ ] 「今日」が `gcal list --today` と同じタイムゾーン基準で決まる
- [ ] ショートカット同士、および `--due-before` / `--due-after` との併用が競合エラーになる
- [ ] `--days 0` 以下がエラーになる
- [ ] ステータスフィルタ（既定 / `--all` / `--completed`）と組み合わせられる
- [ ] 出力（テキスト・`--quiet`・JSON）は 049 の期日順のまま
- [ ] `spec/commands.md` / `spec/google-tasks.md` が実装と一致している
- [ ] 既存テストが pass する
