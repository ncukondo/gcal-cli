# Task: `gcal tasks update` コマンド

## Purpose

タスクを更新するコマンドを実装する。

## Context

- Related files: `src/commands/update.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 034-tasks-add-command

## Changes

### `gcal tasks update <task-id>`

```bash
gcal tasks update abc123 -t "Updated title"
gcal tasks update abc123 --due 2026-03-30
gcal tasks update abc123 --notes "New notes"
gcal tasks update abc123 --list "Work" -f json
```

### Options

```
--title, -t <title>     新しいタスク名
--notes, -n <text>      新しいメモ
--due <date>            新しい期限 (YYYY-MM-DD)
--list, -l <name|id>    タスクリスト名または ID
```

### Text Output

```
Task updated: Updated title (abc123)
```

### Quiet / JSON

add コマンドと同じパターン。

### バリデーション

- 更新オプションが1つも指定されていない場合 → INVALID_ARGS エラー
- `--due` は YYYY-MM-DD 形式

## Implementation Steps

- [ ] `src/commands/tasks/update.ts`: handleTaskUpdate ハンドラ実装
- [ ] `src/commands/tasks/index.ts`: update サブコマンド登録
- [ ] `src/commands/tasks/update.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks update <id>` でタスクが更新される
- [ ] 部分更新が動作する（title のみ、due のみ等）
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] テストが pass する
