# Task: Google Tasks 型定義

## Purpose

Google Tasks 機能に必要な TypeScript 型定義を追加する。

## Context

- Related files: `src/types/index.ts`
- Related specs: `spec/google-tasks.md`
- Dependencies: なし

## Changes

### `src/types/index.ts` に追加

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
  due: string | null;
  completed: string | null;
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

### `AppConfig` 拡張

```typescript
export interface AppConfig {
  timezone?: string;
  default_format: OutputFormat;
  calendars: CalendarConfig[];
  task_lists: TaskListConfig[];  // 追加
}
```

## Implementation Steps

- [ ] `src/types/index.ts`: `TaskStatus`, `TaskList`, `Task`, `TaskListConfig` 型を追加
- [ ] `src/types/index.ts`: `AppConfig` に `task_lists` フィールドを追加
- [ ] `src/lib/config.ts`: `task_lists` のパース対応（省略時は空配列）
- [ ] 既存テストが壊れないことを確認
- [ ] `bun run test` pass
- [ ] `bun run lint` pass

## Acceptance Criteria

- [ ] Task 関連の型が `src/types/index.ts` にエクスポートされている
- [ ] `AppConfig` に `task_lists` が追加されている
- [ ] config に `task_lists` がない場合も既存機能が正常動作する
- [ ] 全テストが pass する
