# Task: `gcal tasks delete` コマンド

## Purpose

タスクを削除するコマンドを実装する。

## Context

- Related files: `src/commands/delete.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 036-tasks-done-undone-command

## Changes

### `gcal tasks delete <task-id>`

```bash
gcal tasks delete abc123
gcal tasks delete abc123 --list "Work"
gcal tasks delete abc123 -f json
```

### Text Output

```
Task deleted (abc123)
```

### Quiet Output

（出力なし）

### JSON Output

```json
{
  "success": true,
  "data": {
    "deleted_id": "abc123",
    "message": "Task deleted"
  }
}
```

### エラーケース

- task-id が見つからない → NOT_FOUND エラー

## Implementation Steps

- [ ] `src/commands/tasks/delete.ts`: handleTaskDelete ハンドラ実装
- [ ] `src/commands/tasks/index.ts`: delete サブコマンド登録
- [ ] `src/commands/tasks/delete.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks delete <id>` でタスクが削除される
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] 存在しない ID で NOT_FOUND エラーが返る
- [ ] テストが pass する
