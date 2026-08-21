# Task: 複数カレンダー取得の部分的失敗を機械可読にする

## Purpose

`gcal list` は複数カレンダーを並行に引き、**失敗したカレンダーを stderr の警告に畳んで先へ進む**
（`src/commands/list.ts:164-175`）。stdout の JSON と終了コードは成功を主張する。

```
stderr: Warning: failed to fetch calendar "Main Calendar": ApiError: Rate Limit Exceeded ...
stdout: {"success": true, "data": {"events": [], "count": 0}}
exit:   0
```

人間は端末で警告に気づける。**問題はエージェントである。** このツールのエージェント向け
インタフェースは `-f json` であり、標準的な使い方は stdout を parse して終了コードを見ることだ。
stderr は捨てられることが多く、読んでも構造化されていないので機械的に判定しにくい。
結果としてエージェントは「予定が無い」と結論する。**誤った成功は、誤ったエラーより静かに害をなす。**

さらに `gcal search` は同じ状況で**正反対**に振る舞う。`Promise.all` を使っているため
（`src/commands/search.ts:89-91`）、1 つのカレンダーが失敗すれば全体が失敗し、
取得できた他のカレンダーの結果も捨てられる。

どちらも極端で、しかも互いに矛盾している。共通の表現を与える。

045（レート制限の分類）のレビューで発見された。レート制限に限らず、認証エラー・権限エラー・
ネットワーク障害でも同じ経路を通る。

## Context

- Related files:
  - `src/commands/list.ts` — `Promise.allSettled` で失敗を警告に畳む（`:164-175`）
  - `src/commands/search.ts` — `Promise.all` で 1 つの失敗が全体を落とす（`:89-91`）
  - `src/lib/output.ts` — `formatJsonSuccess()`
  - `src/lib/api.ts` — `ApiError`（`code` / `message` を持つ）
- Related specs: `spec/output.md`（JSON の形）、`spec/commands.md`（`list` / `search`）
- Dependencies: なし（045 はマージ済みだが独立）

## Design Decisions

### 部分的失敗は成功として返し、失敗を構造化して同梱する

一部のカレンダーが取れなかっただけで、取れた予定まで捨てるのは損失が大きい。
`success: false` には倒さない。代わりに `data` に失敗の一覧を足す。

```json
{
  "success": true,
  "data": {
    "events": [ ... ],
    "count": 3,
    "failed_calendars": [
      {
        "id": "work@group.calendar.google.com",
        "name": "Work",
        "error": { "code": "RATE_LIMITED", "message": "Rate Limit Exceeded ..." }
      }
    ]
  }
}
```

`failed_calendars` は **失敗が無くても常に配列で返す**（空なら `[]`）。
041 の `attendees` と同じ方針で、エージェントがキーの有無を確認しなくて済む。

`error.code` は `ErrorCode`。`ApiError` から取れるときはその値、取れないときは `API_ERROR`。

### 全カレンダーが失敗したときはエラーにする

1 件も取得できていないのに `success: true` / `count: 0` を返すのは端的に嘘である。
**すべてのカレンダーが失敗した場合は最初のエラーをそのまま投げ**、通常のエラー経路
（`handleError()` → `error.code` に応じた終了コード）に載せる。

これは特に重要で、**設定でカレンダーを 1 つしか有効にしていない場合、「全部失敗」＝「その 1 つが失敗」
になる**。これが最も一般的な構成であり、現状そこが黙って成功を返している。

### `search` を `list` と同じ形に揃える

`Promise.all` を `Promise.allSettled` に変え、上と同じ `failed_calendars` を返す。
これにより「1 つのカレンダーが一時的に落ちているだけで検索が丸ごと失敗する」挙動が無くなり、
2 コマンドの挙動が一致する。

### stderr の警告は残す

人間向けには今の警告が有効なので消さない。`list` は現在 `--quiet` でも警告を出す。
`search` の `writeErr` は `--quiet` で抑制される既存の実装なので、
**どちらに揃えるかを決めること。** 警告は失敗の通知であってデータではないため、
`--quiet` でも出す（`list` 側に揃える）のが妥当と考えるが、既存の `search` の挙動を
変えることになるので明記する。

### Text 出力

`failed_calendars` が空でなければ、イベント一覧の後に 1 行足す。

```
Note: 1 calendar could not be fetched (see warnings above).
```

`--quiet` では出さない（`-q` は最小出力の契約のため）。

### Out of Scope

- 失敗したカレンダーのリトライ（→ 046）
- `calendars` / `tasks` 系コマンドの部分的失敗（現状 1 回の API 呼び出しで完結しており、
  部分的失敗の概念が無い）
- 失敗の種類による扱いの differentiation（認証エラーだけ特別扱いする等）

## Changes

### JSON Output

`gcal list` / `gcal search` の `data` に追加:

```
failed_calendars   FailedCalendar[]   （失敗が無くても [] を返す）
```

`FailedCalendar`:

```json
{
  "id": "string",
  "name": "string",
  "error": { "code": "ErrorCode", "message": "string" }
}
```

## Implementation Steps

- [ ] `src/types/index.ts`: `FailedCalendar` を追加
- [ ] `src/commands/list.test.ts` / `list.ts`: 一部失敗で `failed_calendars` が埋まり、
      取得できた予定は返ること
- [ ] `src/commands/list.test.ts` / `list.ts`: 失敗が無いとき `failed_calendars` が `[]` であること
- [ ] `src/commands/list.test.ts` / `list.ts`: **全カレンダー失敗で最初のエラーを投げる**こと
- [ ] `src/commands/list.test.ts` / `list.ts`: カレンダー 1 つだけの構成でその 1 つが失敗した場合、
      エラーになること（最も一般的な構成なので独立したテストにする）
- [ ] `src/commands/search.test.ts` / `search.ts`: `Promise.all` を `Promise.allSettled` に変え、
      `list` と同じ挙動にする（上の 4 ケースすべて）
- [ ] `src/commands/search.ts`: `--quiet` 時の警告の扱いを `list` に揃える
- [ ] `src/lib/output.test.ts` / `output.ts`: text 出力の Note 行（`--quiet` では出さない）
- [ ] `tests/integration/list-pipeline.test.ts` / `search-pipeline.test.ts`:
      API エラー → `failed_calendars` の一連が繋がること
- [ ] `spec/output.md`: `failed_calendars` と `FailedCalendar` を追加
- [ ] `spec/commands.md`: `list` / `search` の部分的失敗の挙動を明記
- [ ] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

**追加しない。** 特定のカレンダーだけを失敗させる状況を実 API で安定に作れない
（読み取り専用カレンダーは*読める*ので失敗しない）。ユニットテストと統合テストでモックする。

## Acceptance Criteria

- [ ] 一部のカレンダーが失敗したとき、取得できた予定が返り `failed_calendars` に失敗が入る
- [ ] 失敗が無いとき `failed_calendars` が `[]`（キーが無いのではなく空配列）
- [ ] すべてのカレンダーが失敗したときエラーになり、終了コードが `error.code` に対応する
- [ ] カレンダー 1 つの構成でそれが失敗したとき、成功を返さない
- [ ] `list` と `search` の部分的失敗の挙動が一致する
- [ ] stderr の警告が従来どおり出る
- [ ] text 出力で失敗があったことが分かる（`--quiet` を除く）
- [ ] `spec/output.md` の記述が実装と一致している
- [ ] 既存テストが pass する
