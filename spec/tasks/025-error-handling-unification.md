# Task: エラー処理パターンを throw 方式に統一

Closes #34

## Purpose

コマンドハンドラのエラー処理パターンを統一する。現在「内部 catch」と「外部 catch」の2パターンが混在しており、エラー出力先やフォーマットが不統一になるリスクがある。

## Context

- Related files: `src/commands/show.ts`, `src/commands/delete.ts`, `src/commands/calendars.ts`, `src/commands/index.ts`, `src/cli.ts`
- Related tests: `tests/unit/show.test.ts`, `tests/unit/delete.test.ts`, `tests/unit/calendars.test.ts`
- Related specs: `spec/output.md`
- Dependencies: 023-option-conflict-fixes

## Changes

### 現状の2パターン

**パターンA（内部 catch）**: show, delete, calendars
```typescript
try {
  // ...
} catch (error) {
  if (error instanceof ApiError) {
    write(formatJsonError(error.code, error.message)); // stdout に出力
    return { exitCode: errorCodeToExitCode(error.code) };
  }
  throw error;
}
```

**パターンB（外部 catch）**: add, update, list, search
```typescript
// handler は throw するだけ
// index.ts の catch で handleError() → stderr に出力
```

### 統一後

- 全ハンドラがエラーを throw する（パターンBに統一）
- `index.ts` の `handleError()` が format に応じた出力と exit code を一括処理
- エラーは常に **stderr** に出力される（現在パターンAは stdout に出力しており不適切）
- ハンドラは成功パスの責任のみ持つ

## Implementation Steps

- [ ] `src/commands/show.ts`: 内部 `try/catch` を削除、`ApiError` はそのまま throw
- [ ] `src/commands/delete.ts`: 内部 `try/catch` を削除、`ApiError` はそのまま throw
- [ ] `src/commands/calendars.ts`: 内部 `try/catch` を削除、`ApiError` はそのまま throw
- [ ] `src/commands/index.ts`: show, delete, calendars のハンドラに `try/catch` が無い場合は追加（他コマンドと同じ形式）
- [ ] テスト更新: ハンドラが throw することを検証するテストに変更（return exitCode ではなく throw を検証）
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## E2E Test

- [ ] 存在しない event ID で `gcal show nonexistent` がエラーを stderr に出力する
- [ ] 存在しない event ID で `gcal delete nonexistent` がエラーを stderr に出力する
- [ ] `gcal show nonexistent -f json` の JSON エラーが stderr に出力される

## Acceptance Criteria

- [ ] show, delete, calendars のハンドラ内に `try/catch` が存在しない
- [ ] 全コマンドのエラーが `handleError()` 経由で stderr に出力される
- [ ] エラー時の JSON 出力が全コマンドで同一フォーマット
- [ ] 全テストが pass する
- [ ] lint/format チェックが pass する
