# Task: レート制限・クォータ超過を認証エラーと区別する

## Purpose

044 で 403 のうち権限不足を `FORBIDDEN` に分離したが、**レート制限とクォータ超過は
依然 `AUTH_REQUIRED` / 終了コード 2 に落ちる**。つまり:

```
$ gcal list          # API のレート制限に掛かった
Error: Rate Limit Exceeded          終了コード 2（認証エラー）
```

ユーザーとエージェントは「再認証が必要」と受け取る。しかし再認証しても直らないし、
**再認証は追加の API 呼び出しを伴うので、レート制限下では事態を悪化させる**。
`gcal init` は `isAuthRequiredError()` を見て自動で再認証フローを起動するため、
この経路が自動で踏まれうる。

044 のレビューで「未知の reason を安全側に倒す設計は正しいが、この 2 つは**既知**なので
事情が違う。実運用で最も頻繁に出る 403 はこれ」と指摘されたもの。

正しい振る舞いは「一時的な状態であり、時間を置いて再試行すべき」と伝えること。

## Context

- Related files:
  - `src/lib/api-utils.ts` — `mapApiError()`、`FORBIDDEN_HINTS`、`isGoogleApiError()`
  - `src/lib/api.ts` — `isAuthRequiredError()`
  - `src/lib/tasks-api.ts` — 同じ `mapApiError()` を 8 箇所で使用
  - `src/commands/init.ts` — `isAuthRequiredError()` で自動再認証を起動
  - `src/lib/output.ts` — `ERROR_CODE_EXIT_MAP`
  - `src/types/index.ts` — `ErrorCode`
  - `src/cli.ts` — `getErrorCode()` の `validCodes`
- Related specs: `spec/output.md`（Error Codes 表）、`spec/overview.md`（Exit Codes 表）
- Dependencies: **044-forbidden-vs-auth**（`reason` を読む仕組みを再利用する）
- 参照: [Calendar API エラー](https://developers.google.com/workspace/calendar/api/guides/errors)

## Design Decisions

### 公式ドキュメントで確認済みの分類（2026-08-21 確認）

| HTTP | `reason` | 意味 |
|---|---|---|
| 403 | `rateLimitExceeded` | カレンダー単位／認証ユーザー単位の最大リクエストレートに到達 |
| 403 | `userRateLimitExceeded` | Developer Console 側の上限に到達 |
| 403 | `quotaExceeded` | Calendar の利用上限を超過 |
| 429 | `rateLimitExceeded` | 403 版と機能的に同等（ドキュメントに "functionally similar" と明記） |

ドキュメントはいずれも **exponential backoff** を推奨している。`Retry-After` ヘッダへの
言及は無いので、それを当てにしない。

`dailyLimitExceeded` は今回の確認で出てこなかったため**入れない**。044 と同じ規律で、
根拠を確認できた文字列だけを扱う。

### `RATE_LIMITED` を新設する

`FORBIDDEN` は使わない。レート制限は権限の問題ではなく**一時的な状態**で、
呼び出し側の取るべき行動（待って再試行）がまったく違う。`API_ERROR` に寄せると
その区別が消える。

**429 は `reason` を見ずに HTTP ステータスだけで分類する。** ステータスコードは
文字列より壊れにくく、`reason` が読めない場合でも確実に判定できる。

### 終了コードは 1（GENERAL）

新しい終了コードは作らない。`spec/overview.md` の 0/1/2/3 を変えると全消費者に影響する。
機械可読な区別は JSON の `error.code` が担う（このツールのエージェント向け
インタフェースは `-f json` である）。

### メッセージ

API の原文に、取るべき行動を添える。044 と同じく原因は断定しない。

```
Error: Rate Limit Exceeded This is temporary; wait and retry with exponential backoff.
```

### `isAuthRequiredError()` に含めない

044 の `FORBIDDEN` と同様、`RATE_LIMITED` を含めてはならない。含めると
`gcal init` がレート制限下で自動再認証を試み、状況を悪化させる。

### 自動リトライは本タスクでは実装しない

Google は exponential backoff を推奨しており、`src/lib/api.ts` の
`resolveConference()` に DI した `sleep` でバックオフする既存の型もある。
しかし自動リトライは**全コマンドの所要時間の性質を変える**変更で、
リトライ回数の上限、打ち切り条件、オプトアウト手段（`--no-retry` の要否）、
`--quiet` や JSON 消費者にとっての妥当な挙動を決める必要がある。

**本タスクは分類だけを行う。** これだけで「再認証しろ」という誤った誘導は消え、
呼び出し側が自分でバックオフを判断できるようになる。自動リトライは 046 に切り出す。

### Out of Scope

- 自動リトライ／exponential backoff の実装（→ 046）
- `Retry-After` ヘッダの解釈（ドキュメントに記載が無く、返ることを確認できていない）
- レート制限の事前回避（リクエストの間引き、バッチ化）

## Changes

### JSON Output

`ErrorCode` に追加:

```
RATE_LIMITED   Rate limit or quota exceeded; retry later
```

終了コードは 1。

## Implementation Steps

- [ ] `src/types/index.ts`: `ErrorCode` に `RATE_LIMITED` を追加
- [ ] `src/lib/output.ts`: `ERROR_CODE_EXIT_MAP` に `RATE_LIMITED: ExitCode.GENERAL` を追加
- [ ] `src/cli.ts`: `getErrorCode()` の `validCodes` に `RATE_LIMITED` を追加
- [ ] `src/lib/api-utils.test.ts` / `api-utils.ts`: 403 の 3 つの `reason` を `RATE_LIMITED` に振り分ける
      （044 の `FORBIDDEN_HINTS` と同じく、reason 一覧をヒントの写像から導出して乖離を防ぐ）
- [ ] `src/lib/api-utils.test.ts` / `api-utils.ts`: **429 を `reason` に関係なく** `RATE_LIMITED` にする
- [ ] `src/lib/api-utils.test.ts`: 403 の振り分け優先順位を固定する
      （権限不足 → `FORBIDDEN` / レート制限 → `RATE_LIMITED` / 未知 → `AUTH_REQUIRED`）
- [ ] `src/lib/api.test.ts`: `isAuthRequiredError()` が `RATE_LIMITED` を含まないこと
- [ ] `src/commands/init.test.ts`: `RATE_LIMITED` で自動再認証が起動しないこと
- [ ] `src/lib/tasks-api.test.ts`: Tasks 側も同じ振り分けになること
- [ ] `spec/output.md`: Error Codes 表に `RATE_LIMITED` を追加
- [ ] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

**E2E は追加しない。** レート制限を意図的に発生させるには API を大量に叩く必要があり、
それ自体が迷惑行為で、実行するたびにアカウントの状態を悪化させる。
ユニットテストでモックする。

この判断を `spec/testing.md` の方針と矛盾しないよう、タスク内に理由を明記しておく。

## Acceptance Criteria

- [ ] 403 の `rateLimitExceeded` / `userRateLimitExceeded` / `quotaExceeded` が
      `RATE_LIMITED` / 終了コード 1 になる
- [ ] 429 が `reason` の有無に関わらず `RATE_LIMITED` になる
- [ ] 権限不足の 403 は 044 どおり `FORBIDDEN` のまま
- [ ] 認証由来の 403（`insufficientPermissions`）は `AUTH_REQUIRED` のまま
- [ ] 未知の `reason` の 403 は `AUTH_REQUIRED` に倒れる（安全側の既定）
- [ ] 401 の扱いは一切変わらない
- [ ] `gcal init` が `RATE_LIMITED` で自動再認証を起動しない
- [ ] Calendar 側と Tasks 側の両方で同じ振り分けになる
- [ ] `spec/output.md` の Error Codes 表が実装と一致している
- [ ] 既存テストが pass する
