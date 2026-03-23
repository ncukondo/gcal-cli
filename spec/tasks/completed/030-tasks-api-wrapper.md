# Task: Google Tasks API ラッパー

## Purpose

Google Tasks API を呼び出すラッパーモジュールを作成する。既存の `lib/api.ts` と同じパターン（インターフェース + 実装関数）で実装する。

## Context

- Related files: `src/lib/api.ts`（パターン参考）
- Related specs: `spec/google-tasks.md`
- Dependencies: 028-task-types, 029-auth-tasks-scope

## Changes

### `src/lib/tasks-api.ts` 新規作成

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

export interface ListTasksOptions {
  showCompleted?: boolean;
  showHidden?: boolean;
  dueMin?: string;  // RFC 3339
  dueMax?: string;  // RFC 3339
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  due?: string;
  parent?: string;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  due?: string;
}
```

### 正規化関数

Google API レスポンスを内部型に変換:

```typescript
export function normalizeTask(
  raw: tasks_v1.Schema$Task,
  listId: string,
  listTitle: string
): Task;

export function normalizeTaskList(
  raw: tasks_v1.Schema$TaskList
): TaskList;
```

### エラーマッピング

既存の `ApiError` クラスを再利用:
- HTTP 401/403 → AUTH_REQUIRED
- HTTP 404 → NOT_FOUND
- Other → API_ERROR

## Implementation Steps

- [ ] `src/lib/tasks-api.ts`: `GoogleTasksApi` インターフェース定義
- [ ] `src/lib/tasks-api.ts`: `createGoogleTasksApi()` 関数（googleapis ラッパー）
- [ ] `src/lib/tasks-api.ts`: `normalizeTask()`, `normalizeTaskList()` 正規化関数
- [ ] `src/lib/tasks-api.ts`: ページネーション対応（既存パターン踏襲）
- [ ] `src/lib/tasks-api.ts`: エラーハンドリング（`ApiError` 再利用）
- [ ] `src/lib/tasks-api.test.ts`: 正規化関数のユニットテスト
- [ ] `src/lib/tasks-api.test.ts`: API ラッパーのモックテスト
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `GoogleTasksApi` インターフェースが定義されている
- [ ] `createGoogleTasksApi()` で googleapis クライアントをラップできる
- [ ] 正規化関数が Google API レスポンスを内部型に変換する
- [ ] ページネーションが正しく動作する
- [ ] エラーマッピングが既存パターンと一致する
- [ ] テストが pass する
