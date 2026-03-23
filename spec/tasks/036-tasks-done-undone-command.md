# Task: `gcal tasks done` / `gcal tasks undone` コマンド

## Purpose

タスクの完了・未完了を切り替えるコマンドを実装する。

## Context

- Related specs: `spec/google-tasks.md`
- Dependencies: 035-tasks-update-command

## Changes

### `gcal tasks done <task-id>`

タスクを完了にする。

```bash
gcal tasks done abc123
gcal tasks done abc123 --list "Work"
gcal tasks done abc123 -f json
gcal tasks done abc123 -q
```

### `gcal tasks undone <task-id>`

タスクを未完了に戻す。

```bash
gcal tasks undone abc123
gcal tasks undone abc123 --list "Work"
```

### Text Output

```
Task completed: Buy groceries (abc123)
```

```
Task reopened: Buy groceries (abc123)
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
    "message": "Task completed"
  }
}
```

```json
{
  "success": true,
  "data": {
    "task": { ... },
    "message": "Task reopened"
  }
}
```

### 実装メモ

- done: `status` を `"completed"` に更新
- undone: `status` を `"needsAction"` に更新、`completed` を null に

## Implementation Steps

- [ ] `src/commands/tasks/done.ts`: handleTaskDone ハンドラ実装
- [ ] `src/commands/tasks/undone.ts`: handleTaskUndone ハンドラ実装
- [ ] `src/commands/tasks/index.ts`: done/undone サブコマンド登録
- [ ] `src/commands/tasks/done.test.ts`: ユニットテスト
- [ ] `src/commands/tasks/undone.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks done <id>` でタスクが完了になる
- [ ] `gcal tasks undone <id>` でタスクが未完了に戻る
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] テストが pass する
