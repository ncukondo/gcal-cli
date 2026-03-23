# Task: OAuth スコープに Tasks を追加

## Purpose

Google Tasks API を使用するために、OAuth スコープに `tasks` を追加する。

## Context

- Related files: `src/lib/auth.ts`
- Related specs: `spec/google-tasks.md`, `spec/auth.md`
- Dependencies: 028-task-types

## Changes

### スコープ追加

`src/lib/auth.ts` の `OAUTH_SCOPES` に追加:

```typescript
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/tasks",  // 追加
];
```

### spec/auth.md 更新

Required Scopes セクションに `tasks` を追加。

## Implementation Steps

- [ ] `src/lib/auth.ts`: `OAUTH_SCOPES` に tasks スコープ追加
- [ ] `spec/auth.md`: Required Scopes 更新
- [ ] 既存テストが壊れないことを確認
- [ ] `bun run test` pass
- [ ] `bun run lint` pass

## Notes

- スコープ追加後、既存ユーザーは `gcal auth` で再認証が必要
- 再認証しなくても既存の Calendar 機能は引き続き動作する（Tasks のみエラー）

## Acceptance Criteria

- [ ] `OAUTH_SCOPES` に tasks スコープが含まれている
- [ ] `spec/auth.md` が更新されている
- [ ] 既存テストが pass する
