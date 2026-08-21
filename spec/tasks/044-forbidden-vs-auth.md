# Task: 403（権限不足）を認証エラーと区別する

## Purpose

現在 `mapApiError()` は HTTP 401 と 403 をまとめて `AUTH_REQUIRED` にしている。
しかし 2 つは意味が違う。

- **401 Unauthorized** = 誰か分からない（トークン切れ・無効）→ **再認証すれば直る**
- **403 Forbidden** = 誰かは分かるが、その操作をする権限がない → **再認証しても直らない**

この取り違えにより、権限の問題が「認証が必要です」と報告され、終了コード 2（AUTH）が返る。
ユーザーは `gcal auth` をやり直すが何度やっても直らず、原因にたどり着けない。
AI エージェントが使う場合はさらに悪く、終了コード 2 を見て再認証ループに入りうる。
実際 `gcal init` は `isAuthRequiredError()` を見て**自動で再認証フローを起動する**
（`src/commands/init.ts:63`）ため、権限エラーが無関係な再認証を引き起こす経路が既にある。

典型例は Google Calendar の主催者制約である。**イベントの会議情報を変更できるのは主催者だけ**で、
招待されただけのイベントに対して以下を実行すると API は 403 を返す。

```bash
gcal update <他人が主催するイベントのID> --remove-meet   # 「この Meet リンクは使わないので消したい」
```

042（Google Meet）のレビューで指摘された。`--meet` / `--remove-meet` が最も踏みやすい経路だが、
**原因の 401/403 統合は 042 より前から存在し、`update` / `delete` 全体、さらに
Google Tasks API 側にも同じ経路がある**（`mapApiError()` は `api.ts` と `tasks-api.ts` の共用）。

## Context

- Related files:
  - `src/lib/api-utils.ts` — `mapApiError()`。401/403 をまとめている当該箇所（`:15`）
  - `src/lib/api.ts` — `isAuthRequiredError()`（`:624`）、`mapWriteError()`（`--meet` の 400 ヒント）
  - `src/lib/tasks-api.ts` — 同じ `mapApiError()` を 8 箇所で使用
  - `src/commands/init.ts` — `isAuthRequiredError()` で自動再認証を起動（`:63`）
  - `src/lib/output.ts` — `ERROR_CODE_EXIT_MAP`（`:267`）
  - `src/types/index.ts` — `ErrorCode`（`:98`）
- Related specs: `spec/output.md`（Error Codes 表）、`spec/overview.md`（Exit Codes 表）
- Dependencies: なし（042 はマージ済み。043 とも独立）
- 参照: [Events: patch — Errors](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)

## Design Decisions

### まず実際のエラー本文を確認する — これが本タスクの前提

**403 は権限不足以外の理由でも返る。** 代表的なのは OAuth スコープ不足で、これは本当に再認証が要る。
したがって 403 を一律に振り分け直すと、今度は逆方向の誤りを作る。

Google は 403 のレスポンス本文に `reason` を持つ（`forbiddenForNonOrganizer`,
`insufficientPermissions`, `rateLimitExceeded`, `quotaExceeded` など）。
**実装に入る前に、実 API が返す本文と、それが `googleapis` の例外オブジェクトの
どのプロパティに載るかを確認すること。** 未確認の文字列マッチを先に書くと、
正しく見えて後で静かに壊れる。

確認手段の案:

- E2E で他人が主催するイベントを用意し（テスト用に 2 アカウント必要）、`--remove-meet` を実行する
- あるいは意図的にスコープを絞ったトークンで書き込みを試す
- `googleapis` の `GaxiosError` は `error.errors[].reason` や `error.response.data.error.errors[].reason`
  を持つことがある。`isGoogleApiError()` は `code: number` しか見ていないので、型の拡張が必要になる

**確認できた事実だけを根拠に実装する。分からなければ、その 403 は現状どおり `AUTH_REQUIRED` に倒す**
（安全側。再認証を促すのは無駄だが害は小さい）。

### `reason` で振り分ける

確認結果に基づき、おおよそ次の方針とする。実際の `reason` 値は確認後に確定させること。

| 状況 | ErrorCode | 終了コード |
|---|---|---|
| 401 全般 | `AUTH_REQUIRED` | 2 |
| 403 / スコープ不足・認証由来 | `AUTH_REQUIRED` | 2 |
| 403 / 権限不足（非主催者・読み取り専用カレンダー等） | `FORBIDDEN`（新設） | 1 |
| 403 / レート制限・クォータ | 別タスク（本タスクの対象外） | — |
| `reason` が不明・取得できない | `AUTH_REQUIRED`（現状維持） | 2 |

### `FORBIDDEN` を新設するか `API_ERROR` に寄せるか

`ErrorCode` に `FORBIDDEN` を足すと **JSON 出力の契約が変わる**（`spec/output.md` の Error Codes 表に
追記が必要）。ただしフィールド追加ではなく既存値の追加なので、`API_ERROR` を期待していた消費者には影響しない。
一方 `API_ERROR` に寄せると終了コードは正しくなる（1）が、エージェントが「権限の問題だから
別アカウントに切り替える／主催者に依頼する」と判断する材料が消える。

**`FORBIDDEN` を新設する方を推す。** このツールは AI エージェント連携が目的であり、
機械可読なコードで原因を区別できることに価値がある。

### メッセージ

API の原文を保った上で、対処を添える。原因を断定しないこと（042 の 400 ヒントと同じ理由）。

```
Error: <API の原文> You may not have permission to change this event; only its organizer can.
```

### `isAuthRequiredError()` の扱い

`init.ts` の自動再認証は `isAuthRequiredError()` を見ている。`FORBIDDEN` はここに**含めない**。
含めると本タスクが直そうとしている無駄な再認証がそのまま残る。

### Out of Scope

- 403 のレート制限・クォータ（`rateLimitExceeded` / `quotaExceeded`）への対応。
  リトライやバックオフの設計が必要で、別タスクが妥当
- 事前の権限チェック（書き込み前に主催者かどうかを問い合わせる）。API 呼び出しが増えるため、
  042 と同じくエラーを受けて案内する方針を保つ

## Implementation Steps

- [ ] **先に事実確認**: 実 API が 403 で返す本文と `reason` を確認し、`googleapis` の例外の
      どのプロパティから読めるかを特定する。判明した内容をこのタスクファイルに追記する
- [ ] `src/lib/api-utils.ts`: `isGoogleApiError()` を `reason` を読めるよう拡張（型と実装）
- [ ] `src/types/index.ts`: `ErrorCode` に `FORBIDDEN` を追加
- [ ] `src/lib/output.ts`: `ERROR_CODE_EXIT_MAP` に `FORBIDDEN: ExitCode.GENERAL` を追加
- [ ] `src/cli.ts`: `getErrorCode()` の `validCodes` に `FORBIDDEN` を追加
- [ ] `src/lib/api-utils.test.ts` / `api-utils.ts`: 403 の振り分け
      （権限不足 → `FORBIDDEN` / スコープ不足 → `AUTH_REQUIRED` / `reason` 不明 → `AUTH_REQUIRED`）
- [ ] `src/lib/api.ts`: `isAuthRequiredError()` が `FORBIDDEN` を含まないことをテストで固定
- [ ] `src/commands/init.test.ts`: `FORBIDDEN` では自動再認証が起動しないこと
- [ ] `src/lib/tasks-api.test.ts`: Tasks 側も同じ振り分けになること（`mapApiError()` 共用の確認）
- [ ] `spec/output.md`: Error Codes 表に `FORBIDDEN` を追加
- [ ] `spec/overview.md`: 必要なら Exit Codes の説明を補足
- [ ] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/` に追加する。**他人が主催するイベントが必要なため、用意できない環境ではスキップする**
（`tests/e2e/helpers.ts` の既存パターンに合わせる）。

- [ ] 他人が主催するイベントに `gcal update <id> --remove-meet` を実行すると
      終了コード 1 で `FORBIDDEN` が返り、再認証を促すメッセージが出ないこと
- [ ] 自分が主催するイベントでは同じ操作が成功すること（対照）
- [ ] トークンが無効な状態では従来どおり終了コード 2 / `AUTH_REQUIRED` であること

環境変数（例 `GCAL_E2E_FOREIGN_EVENT_ID`）で他人主催イベントを指定し、未設定ならスキップする方式を想定。

## Acceptance Criteria

- [ ] 実 API が返す 403 の `reason` を確認し、その根拠がタスクファイルに記録されている
- [ ] 権限不足の 403 が `FORBIDDEN` / 終了コード 1 になる
- [ ] 認証由来の 403（スコープ不足）は従来どおり `AUTH_REQUIRED` / 終了コード 2 のまま
- [ ] `reason` が読めない 403 は `AUTH_REQUIRED` に倒れる（安全側の既定）
- [ ] 401 の扱いは一切変わらない
- [ ] `gcal init` が `FORBIDDEN` で自動再認証を起動しない
- [ ] Calendar 側と Tasks 側の両方で同じ振り分けになる
- [ ] エラーメッセージが API の原文を保ち、原因を断定していない
- [ ] `spec/output.md` の Error Codes 表が実装と一致している
- [ ] 既存テストが pass する
