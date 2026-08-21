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

### 確認済み: 実 API が返す 403 の形（2026-08-21 採取）

**このタスクの前提だった事実確認は完了している。** 書き込み不可の ICS 購読カレンダー
（`...@import.calendar.google.com`）に `events.insert` を試み、以下を採取した。

```
constructor          GaxiosError
e.code               403          (number)
e.status             403
e.message            "You need to have writer access to this calendar."
e.errors             [ { domain: "calendar",
                         reason: "requiredAccessLevel",
                         message: "You need to have writer access to this calendar." } ]
e.response.data.error.errors   同じ配列
```

判明したこと:

- **`reason` は `e.errors[0].reason` から直接読める。** `e.response.data.error.errors` を
  掘る必要はない（両方に載っている）。`isGoogleApiError()` の型を
  `errors?: { domain?: string; reason?: string; message?: string }[]` で拡張すればよい
- 読み取り専用カレンダーへの書き込みは `reason: "requiredAccessLevel"`
- `message` は既に人間に十分な内容（"You need to have writer access to this calendar."）で、
  **現状はこれが「認証が必要」として提示されている**のが問題の実体

まだ未確認の `reason`（実装時に同様の手口で採取するか、判明するまで `AUTH_REQUIRED` に倒す）:

- `forbiddenForNonOrganizer` — 他人主催イベントの会議情報を変更しようとした場合。
  Google のドキュメントに記載があるが、本採取では再現していない（第2アカウントが必要）
- `insufficientPermissions` — OAuth スコープ不足。**これは再認証で直るので `AUTH_REQUIRED` のまま**
- `rateLimitExceeded` / `quotaExceeded` — Out of Scope

### 403 は権限不足だけではない

**403 は権限不足以外の理由でも返る。** 代表的なのは OAuth スコープ不足で、これは本当に再認証が要る。
したがって 403 を一律に振り分け直すと、今度は逆方向の誤りを作る。

**確認できた `reason` だけを根拠に振り分ける。未知の `reason` は現状どおり `AUTH_REQUIRED` に倒す**
（安全側。再認証を促すのは無駄だが害は小さい）。新しい `reason` を足すときは、
上記と同じ手口で実 API から採取してから足すこと。推測で文字列を並べない。

### `reason` で振り分ける

確認結果に基づき、おおよそ次の方針とする。実際の `reason` 値は確認後に確定させること。

| 状況 | ErrorCode | 終了コード |
|---|---|---|
| 401 全般 | `AUTH_REQUIRED` | 2 |
| 403 / `insufficientPermissions`（スコープ不足） | `AUTH_REQUIRED` | 2 |
| 403 / `requiredAccessLevel`（読み取り専用カレンダー）**確認済み** | `FORBIDDEN`（新設） | 1 |
| 403 / `forbiddenForNonOrganizer`（非主催者） | `FORBIDDEN`（新設） | 1 |
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

- [x] **先に事実確認**: 実 API が 403 で返す本文と `reason` を確認する
      → Design Decisions の「確認済み」節を参照。`e.errors[0].reason` から読め、
      読み取り専用カレンダーは `requiredAccessLevel` を返す
- [x] `src/lib/api-utils.ts`: `isGoogleApiError()` を `reason` を読めるよう拡張（型と実装）
- [x] `src/types/index.ts`: `ErrorCode` に `FORBIDDEN` を追加
- [x] `src/lib/output.ts`: `ERROR_CODE_EXIT_MAP` に `FORBIDDEN: ExitCode.GENERAL` を追加
- [x] `src/cli.ts`: `getErrorCode()` の `validCodes` に `FORBIDDEN` を追加
- [x] `src/lib/api-utils.test.ts` / `api-utils.ts`: 403 の振り分け
      （権限不足 → `FORBIDDEN` / スコープ不足 → `AUTH_REQUIRED` / `reason` 不明 → `AUTH_REQUIRED`）
- [x] `src/lib/api.ts`: `isAuthRequiredError()` が `FORBIDDEN` を含まないことをテストで固定
- [x] `src/commands/init.test.ts`: `FORBIDDEN` では自動再認証が起動しないこと
- [x] `src/lib/tasks-api.test.ts`: Tasks 側も同じ振り分けになること（`mapApiError()` 共用の確認）
- [x] `spec/output.md`: Error Codes 表に `FORBIDDEN` を追加
- [x] `spec/overview.md`: 必要なら Exit Codes の説明を補足
- [x] `vitest run src tests/integration` / `lint` / `format:check` / `typecheck` pass
      （E2E は実 API を叩くため本作業では未実行）

## E2E Test

`tests/e2e/` に追加する。**読み取り専用カレンダーが必要なため、用意できない環境ではスキップする**
（`tests/e2e/helpers.ts` の既存パターンに合わせる）。

- [ ] 読み取り専用カレンダーに `gcal add -c <read-only-cal-id>` を実行すると
      終了コード 1 で `FORBIDDEN` が返り、再認証を促すメッセージが出ないこと
- [ ] 書き込み可能なカレンダーでは同じ操作が成功すること（対照）

環境変数 `GCAL_E2E_READONLY_CALENDAR_ID` で読み取り専用カレンダーを指定し、未設定ならスキップする。
`tests/e2e/forbidden.test.ts` に実装済み。**未実行**（実 API を叩くため）。
非主催者イベント（`forbiddenForNonOrganizer`）は第2アカウントが要るため E2E では扱わず、
ユニットテストでモックする。

## Acceptance Criteria

- [x] 実 API が返す 403 の `reason` を確認し、その根拠がタスクファイルに記録されている
- [x] 権限不足の 403 が `FORBIDDEN` / 終了コード 1 になる
- [x] 認証由来の 403（スコープ不足）は従来どおり `AUTH_REQUIRED` / 終了コード 2 のまま
- [x] `reason` が読めない 403 は `AUTH_REQUIRED` に倒れる（安全側の既定）
- [x] 401 の扱いは一切変わらない
- [x] `gcal init` が `FORBIDDEN` で自動再認証を起動しない
- [x] Calendar 側と Tasks 側の両方で同じ振り分けになる
- [x] エラーメッセージが API の原文を保ち、原因を断定していない
- [x] `spec/output.md` の Error Codes 表が実装と一致している
- [x] 既存テストが pass する
