# Task: `tasks list` を期日順に並べる

GitHub issue: #65

## Purpose

`gcal tasks list` は Google Tasks API が返した順（UI の表示順。新しく追加したものが上）のまま
出力しており、期日順になっていない。

Calendar リストは現在 118 件・233 行あり、たとえば明日 due の 4 件はテキスト出力の
6・96・136・152 行目に散っている。エージェントが `gcal tasks list -l Calendar | head -60` で
一覧を確認すると 4 件中 1 件しか見えず、本日・明日のタスクが漏れる。過去のセッション
（2026-08-13 / 08-18 / 08-25 / 09-08）でいずれもこの手順から始めて見逃しが起きていた。

`gcal list`（予定一覧）が時刻順に出ているのと揃える。

### 原因

`src/commands/tasks/list.ts` の `filterTasks` はステータスと `--due-before` / `--due-after` で
絞るだけで、並べ替えを行っていない。

## Context

- Related files:
  - `src/commands/tasks/list.ts` — `filterTasks()`、`handleTaskList()`
  - `src/commands/tasks/list.test.ts` — 既存テスト（`makeRawTask` / `makeClient` ヘルパー）
  - `src/lib/tasks-api.ts` — `listTasks()`（`due` を `YYYY-MM-DD` に正規化している）
  - `src/types/index.ts` — `Task`
- Related specs: `spec/google-tasks.md`（出力例）、`spec/commands.md`（`tasks list`）
- Dependencies: なし（048 とは独立。050 がこのタスクに依存する）

## Design Decisions

### 既定で期日の昇順、期日なしは末尾、同一期日は API 順を維持

- `due` は `listTasks()` で `YYYY-MM-DD` に正規化済みなので、**文字列比較**で足りる
  （`Date` に変換しない）。
- 期日なし（`due === null`）のタスクは末尾にまとめる。末尾の中でも API の返却順を維持する。
- 同じ期日の中では API の返却順を維持する（**安定ソート**）。`Array.prototype.sort` は
  ES2019 以降安定なので、比較関数で同値を 0 と返せばよい。
- 期日超過のものが先頭に来るので、`head` で先頭だけ見ても「今日までにやること」が落ちない。

### 並べ替えはフィルタの後、出力の前に 1 箇所で行う

`filterTasks()` の後に `sortTasksByDue(tasks: Task[]): Task[]` を挟む（純粋関数として
export し、ユニットテストの対象にする）。テキスト・`--quiet`・JSON（`data.tasks`）の
すべてが同じ配列を使うので、順序は自動的に一致する。

### `--completed` / `--all` でも同じ規則

完了タスクも同じ規則（`due` 昇順、なしは末尾）で並べる。完了日 `completed` では並べない。

### 並べ替えオプションは追加しない

`--sort` のようなオプションは追加しない。API 順が欲しいケースは今のところ無く、
必要になったら別 issue で扱う。

### Out of Scope

- 親子（サブタスク）の階層表示。現状の出力は階層を表現していないので、フラットに並べる
- 期日ショートカット（`--today` / `--overdue`）→ 050

## Changes

### Text / Quiet / JSON Output

内容・形式は変えない。順序のみ変わる。`spec/google-tasks.md` の出力例は既に期日順に
なっているので、「期日の昇順で表示する。期日なしは末尾」の一文を追加する。

## Implementation Steps

- [x] `src/commands/tasks/list.test.ts`: `sortTasksByDue` のユニットテスト
      （昇順 / 期日なしが末尾 / 同一期日で API 順維持 / 空配列）
- [x] `src/commands/tasks/list.ts`: `sortTasksByDue` を実装・export
- [x] `src/commands/tasks/list.test.ts`: `handleTaskList` のテキスト・`--quiet`・JSON で
      順序が期日順になること（API 順を意図的にバラした入力で）
- [x] `src/commands/tasks/list.test.ts`: `--all` / `--completed` でも同じ規則で並ぶこと
- [x] `src/commands/tasks/list.ts`: `handleTaskList` に組み込む
- [x] `spec/google-tasks.md` / `spec/commands.md`: 並び順を明記
- [x] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

**追加しない。** 実リストの内容に依存するので安定に検証できない。ユニットテストで担保する。

## Acceptance Criteria

- [x] `gcal tasks list` の出力が期日の昇順になっている
- [x] 期日なしのタスクが末尾にまとまっている
- [x] 同じ期日のタスクは API の返却順を維持している
- [x] テキスト・`--quiet`・JSON（`data.tasks`）で順序が一致している
- [x] `--all` / `--completed` でも同じ規則で並ぶ
- [x] 既存テストが pass する（既存テストが API 順に依存していた場合は、期待値を期日順に直す）
