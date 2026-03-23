# Google Tasks Specification

## Overview

Google Tasks の確認・編集機能を gcal-cli に追加する。既存の Google Calendar 機能と同じ認証基盤・設定システム・出力フォーマットを共有し、`gcal tasks` サブコマンドとして統合する。

## Google Tasks API

- API: Google Tasks API v1
- Base URL: `https://www.googleapis.com/tasks/v1`
- Required Scope: `https://www.googleapis.com/auth/tasks`
- Google Cloud Console で Tasks API を有効にする必要がある

### API リソース

#### TaskList

```json
{
  "id": "string",
  "title": "string",
  "updated": "RFC 3339 datetime"
}
```

#### Task

```json
{
  "id": "string",
  "title": "string",
  "notes": "string",
  "status": "needsAction | completed",
  "due": "RFC 3339 date (time portion is always 00:00:00Z)",
  "completed": "RFC 3339 datetime",
  "deleted": "boolean",
  "hidden": "boolean",
  "parent": "string (parent task id)",
  "position": "string",
  "updated": "RFC 3339 datetime"
}
```

**注意事項:**
- Google Tasks API は日付のみ（時刻なし）。`due` は `YYYY-MM-DDT00:00:00.000Z` 形式
- 繰り返しタスクは API でサポートされない
- サブタスク（`parent` フィールド）をサポート
- `status` は `needsAction` または `completed` のみ

## Commands

### `gcal tasks lists`

タスクリスト一覧を表示する。

```bash
gcal tasks lists
gcal tasks lists -f json
```

### `gcal tasks list`

タスク一覧を表示する。

```bash
gcal tasks list [options]

Options:
  --list, -l <name|id>    タスクリスト名または ID（省略時: デフォルトリスト）
  --all                   完了済みも含めて表示
  --completed             完了済みのみ表示
  --due-before <date>     指定日以前に期限のタスク (YYYY-MM-DD)
  --due-after <date>      指定日以降に期限のタスク (YYYY-MM-DD)
```

デフォルトでは未完了タスク (`needsAction`) のみ表示する。

### `gcal tasks show <task-id>`

タスクの詳細を表示する。

```bash
gcal tasks show <task-id> [options]

Options:
  --list, -l <name|id>    タスクリスト名または ID
```

### `gcal tasks add`

タスクを作成する。

```bash
gcal tasks add [options]

Options:
  --title, -t <title>     タスク名（必須）
  --notes, -n <text>      メモ
  --due <date>            期限 (YYYY-MM-DD)
  --list, -l <name|id>    タスクリスト名または ID
  --parent <task-id>      親タスク ID（サブタスクとして作成）
```

### `gcal tasks update <task-id>`

タスクを更新する。

```bash
gcal tasks update <task-id> [options]

Options:
  --title, -t <title>     新しいタスク名
  --notes, -n <text>      新しいメモ
  --due <date>            新しい期限 (YYYY-MM-DD)
  --list, -l <name|id>    タスクリスト名または ID
```

### `gcal tasks done <task-id>`

タスクを完了にする。

```bash
gcal tasks done <task-id> [options]

Options:
  --list, -l <name|id>    タスクリスト名または ID
```

### `gcal tasks undone <task-id>`

タスクを未完了に戻す。

```bash
gcal tasks undone <task-id> [options]

Options:
  --list, -l <name|id>    タスクリスト名または ID
```

### `gcal tasks delete <task-id>`

タスクを削除する。

```bash
gcal tasks delete <task-id> [options]

Options:
  --list, -l <name|id>    タスクリスト名または ID
```

## Output Formats

### Text Output

#### `gcal tasks lists`

```
Task Lists:
  [x] My Tasks (@default)
  [x] Work (abc123)
  [ ] Shopping (def456) (disabled)
```

#### `gcal tasks list`

```
My Tasks:
  □ Buy groceries (due: 03/25)
  □ Write report (due: 03/26)
    Notes: Q1 summary for marketing team
  □ Call dentist
```

With `--all`:
```
My Tasks:
  □ Buy groceries (due: 03/25)
  ☑ Fix login bug (completed: 03/22)
  □ Write report (due: 03/26)
```

#### `gcal tasks show`

```
Title:     Buy groceries
Status:    needsAction
Due:       2026-03-25
Notes:     Milk, eggs, bread
List:      My Tasks
Updated:   2026-03-20T10:00:00Z
```

#### `gcal tasks add` / `gcal tasks update`

```
Task created: Buy groceries (abc123)
```

```
Task updated: Buy groceries (abc123)
```

#### `gcal tasks done` / `gcal tasks undone`

```
Task completed: Buy groceries (abc123)
```

```
Task reopened: Buy groceries (abc123)
```

### Quiet Output

| Command | Quiet Output | Example |
|---------|-------------|---------|
| tasks lists | リスト ID per line | `@default` |
| tasks list | `[□/☑] Title (due: MM/DD)` per line | `□ Buy groceries (due: 03/25)` |
| tasks show | `Title\tStatus\tDue` (TSV, 1 line) | `Buy groceries\tneedsAction\t2026-03-25` |
| tasks add | Task ID only | `abc123` |
| tasks update | Task ID only | `abc123` |
| tasks done | Task ID only | `abc123` |
| tasks undone | Task ID only | `abc123` |
| tasks delete | (no output) | |

### JSON Output

#### `gcal tasks lists -f json`

```json
{
  "success": true,
  "data": {
    "task_lists": [
      {
        "id": "@default",
        "title": "My Tasks",
        "enabled": true,
        "updated": "2026-03-20T10:00:00Z"
      }
    ],
    "count": 1
  }
}
```

#### `gcal tasks list -f json`

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "abc123",
        "title": "Buy groceries",
        "notes": "Milk, eggs, bread",
        "status": "needsAction",
        "due": "2026-03-25",
        "completed": null,
        "list_id": "@default",
        "list_title": "My Tasks",
        "parent": null,
        "updated": "2026-03-20T10:00:00Z"
      }
    ],
    "count": 1
  }
}
```

#### `gcal tasks add -f json`

```json
{
  "success": true,
  "data": {
    "task": { ... },
    "message": "Task created"
  }
}
```

#### `gcal tasks done -f json`

```json
{
  "success": true,
  "data": {
    "task": { ... },
    "message": "Task completed"
  }
}
```

## Type Definitions

```typescript
export type TaskStatus = "needsAction" | "completed";

export interface TaskList {
  id: string;
  title: string;
  updated: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  due: string | null;       // YYYY-MM-DD
  completed: string | null; // ISO 8601 datetime
  list_id: string;
  list_title: string;
  parent: string | null;
  updated: string;
}

export interface TaskListConfig {
  id: string;
  name: string;
  enabled: boolean;
}
```

## Config Extension

```toml
timezone = "Asia/Tokyo"
default_format = "text"

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true

[[task_lists]]
id = "@default"
name = "My Tasks"
enabled = true
```

`--list` オプション省略時は `enabled = true` のタスクリストを使用する。
config に `task_lists` がない場合はデフォルトリスト (`@default`) を使用する。

## Auth Changes

既存の OAuth スコープに Tasks スコープを追加:

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/tasks
```

スコープ追加後、既存ユーザーは再認証が必要。`gcal auth` 実行時に自動的に新しいスコープで認証される。

## Architecture

### New Modules

```
src/
├── lib/
│   └── tasks-api.ts         # Google Tasks API wrapper
├── commands/
│   └── tasks/
│       ├── index.ts          # tasks サブコマンド登録
│       ├── lists.ts          # gcal tasks lists
│       ├── list.ts           # gcal tasks list
│       ├── show.ts           # gcal tasks show
│       ├── add.ts            # gcal tasks add
│       ├── update.ts         # gcal tasks update
│       ├── done.ts           # gcal tasks done
│       ├── undone.ts         # gcal tasks undone
│       └── delete.ts         # gcal tasks delete
```

### API Wrapper Pattern

`lib/tasks-api.ts` は既存の `lib/api.ts` と同じパターンで実装:

```typescript
export interface GoogleTasksApi {
  listTaskLists(): Promise<TaskList[]>;
  listTasks(taskListId: string, options?: ListTasksOptions): Promise<Task[]>;
  getTask(taskListId: string, taskId: string): Promise<Task>;
  createTask(taskListId: string, task: CreateTaskInput): Promise<Task>;
  updateTask(taskListId: string, taskId: string, task: UpdateTaskInput): Promise<Task>;
  deleteTask(taskListId: string, taskId: string): Promise<void>;
  completeTask(taskListId: string, taskId: string): Promise<Task>;
  uncompleteTask(taskListId: string, taskId: string): Promise<Task>;
}
```

## Task List Resolution

`--list` オプションの解決順序:

1. `--list` に ID が指定された場合 → そのまま使用
2. `--list` に名前が指定された場合 → config の `task_lists` から ID を逆引き
3. `--list` 省略時 → config の `enabled = true` の最初のタスクリスト
4. config に `task_lists` がない場合 → `@default` を使用
