# Task: `gcal tasks add` コマンド

## Purpose

タスクを作成するコマンドを実装する。

## Context

- Related files: `src/commands/add.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 032-tasks-list-command

## Changes

### `gcal tasks add`

```bash
gcal tasks add -t "Buy groceries"
gcal tasks add -t "Write report" --due 2026-03-26 --notes "Q1 summary"
gcal tasks add -t "Subtask" --parent abc123
gcal tasks add -t "Work item" --list "Work"
gcal tasks add -t "Meeting prep" -f json
gcal tasks add -t "Quick note" -q
```

### Options

```
--title, -t <title>     タスク名（必須）
--notes, -n <text>      メモ
--due <date>            期限 (YYYY-MM-DD)
--list, -l <name|id>    タスクリスト名または ID
--parent <task-id>      親タスク ID（サブタスクとして作成）
```

### Text Output

```
Task created: Buy groceries (abc123)
```

### Quiet Output

```
abc123
```

### JSON Output

```json
{
  "success": true,
  "data": {
    "task": { ... },
    "message": "Task created"
  }
}
```

### バリデーション

- `--title` は必須（未指定で INVALID_ARGS エラー）
- `--due` は YYYY-MM-DD 形式（不正な形式で INVALID_ARGS エラー）

## Implementation Steps

- [ ] `src/commands/tasks/add.ts`: handleTaskAdd ハンドラ実装
- [ ] `src/commands/tasks/index.ts`: add サブコマンド登録
- [ ] 日付バリデーション（YYYY-MM-DD）
- [ ] `src/commands/tasks/add.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks add -t "..."` でタスクが作成される
- [ ] --due, --notes, --parent, --list オプションが動作する
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] バリデーションエラーで適切なエラーメッセージが返る
- [ ] テストが pass する
