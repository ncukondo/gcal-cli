# Task: `gcal tasks show` コマンド

## Purpose

タスクの詳細を表示するコマンドを実装する。

## Context

- Related files: `src/commands/show.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 032-tasks-list-command

## Changes

### `gcal tasks show <task-id>`

```bash
gcal tasks show abc123
gcal tasks show abc123 --list "Work"
gcal tasks show abc123 -f json
gcal tasks show abc123 -q
```

### Text Output

```
Title:     Buy groceries
Status:    needsAction
Due:       2026-03-25
Notes:     Milk, eggs, bread
List:      My Tasks
Updated:   2026-03-20T10:00:00Z
```

### Quiet Output

```
Buy groceries	needsAction	2026-03-25
```

TSV 1行: `Title\tStatus\tDue`

### JSON Output

```json
{
  "success": true,
  "data": {
    "task": { ... }
  }
}
```

### エラーケース

- task-id が見つからない → NOT_FOUND エラー

## Implementation Steps

- [ ] `src/commands/tasks/show.ts`: handleTaskShow ハンドラ実装
- [ ] `src/commands/tasks/index.ts`: show サブコマンド登録
- [ ] タスクリスト解決ロジック（list コマンドと共通化）
- [ ] `src/commands/tasks/show.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks show <id>` でタスク詳細が表示される
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] 存在しない ID で NOT_FOUND エラーが返る
- [ ] テストが pass する
