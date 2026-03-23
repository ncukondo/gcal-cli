# Task: `gcal tasks lists` コマンド

## Purpose

タスクリスト一覧を表示するコマンドを実装する。

## Context

- Related files: `src/commands/calendars.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 030-tasks-api-wrapper

## Changes

### コマンド登録

`src/commands/tasks/index.ts` で `tasks` サブコマンドグループを作成し、`lists` サブコマンドを登録する。

### `gcal tasks lists`

```bash
gcal tasks lists           # テキスト出力
gcal tasks lists -f json   # JSON 出力
gcal tasks lists -q        # ID のみ
```

### Text Output

```
Task Lists:
  [x] My Tasks (@default)
  [x] Work (abc123)
  [ ] Shopping (def456) (disabled)
```

config に `task_lists` がある場合は enabled 状態を表示。ない場合は全リストを `[x]` で表示。

### Quiet Output

```
@default
abc123
```

### JSON Output

```json
{
  "success": true,
  "data": {
    "task_lists": [...],
    "count": 2
  }
}
```

## Implementation Steps

- [ ] `src/commands/tasks/index.ts`: tasks サブコマンドグループ作成
- [ ] `src/commands/tasks/lists.ts`: handleTaskLists ハンドラ実装
- [ ] `src/commands/index.ts`: tasks サブコマンドを登録
- [ ] `src/commands/tasks/lists.test.ts`: ユニットテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal tasks lists` でタスクリスト一覧が表示される
- [ ] text / json / quiet 全フォーマットが動作する
- [ ] config の `task_lists` 設定が反映される
- [ ] テストが pass する
