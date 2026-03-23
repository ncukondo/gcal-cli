# Task: `gcal tasks list` コマンド

## Purpose

タスク一覧を表示するコマンドを実装する。フィルタリングオプションで完了済み・期限でのフィルタが可能。

## Context

- Related files: `src/commands/list.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 031-tasks-lists-command

## Changes

### `gcal tasks list`

```bash
gcal tasks list                           # 未完了タスクのみ（デフォルト）
gcal tasks list --all                     # 完了済み含む全タスク
gcal tasks list --completed               # 完了済みのみ
gcal tasks list --list "Work"             # 特定リストのタスク
gcal tasks list --due-before 2026-03-30   # 期限フィルタ
gcal tasks list -f json
gcal tasks list -q
```

### Text Output

```
My Tasks:
  □ Buy groceries (due: 03/25)
  □ Write report (due: 03/26)
    Notes: Q1 summary for marketing team
  □ Call dentist
```

- `□` = needsAction, `☑` = completed
- due がある場合は `(due: MM/DD)` を表示
- notes がある場合は次の行にインデントして表示（最初の1行のみ）
- completed の場合は `(completed: MM/DD)` を表示

### Quiet Output

```
□ Buy groceries (due: 03/25)
☑ Fix login bug (completed: 03/22)
```

### JSON Output

```json
{
  "success": true,
  "data": {
    "tasks": [...],
    "count": 3,
    "list_id": "@default",
    "list_title": "My Tasks"
  }
}
```

## Implementation Steps

- [ ] `src/commands/tasks/list.ts`: handleTaskList ハンドラ実装
- [ ] `src/commands/tasks/list.ts`: フィルタリングオプション処理
- [ ] `src/commands/tasks/index.ts`: list サブコマンド登録
- [ ] タスクリスト解決ロジック実装（--list オプション → config → @default）
- [ ] `src/commands/tasks/list.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks list` で未完了タスクが表示される
- [ ] `--all` で完了済みも表示される
- [ ] `--completed` で完了済みのみ表示される
- [ ] `--list` でリスト指定ができる
- [ ] `--due-before` / `--due-after` で期限フィルタが動作する
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] テストが pass する
