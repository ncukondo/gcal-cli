# Task: レート制限時の自動 exponential backoff

## Purpose

045 でレート制限を `RATE_LIMITED` として正しく分類したが、リトライは呼び出し側任せになっている。
Google のドキュメントは 403 / 429 のレート制限に対して **exponential backoff を明示的に推奨**している。

このツールは AI エージェント連携が目的である。エージェントはレート制限に対して
**待たずに即座に再実行しがち**で、それは状況を悪化させる。CLI 側で有界な
backoff を持てば、呼び出し側がそれぞれ実装しなくて済む。

## Context

- Related files:
  - `src/lib/api-utils.ts` — `mapApiError()`、`RATE_LIMITED` の判定（045 で追加）
  - `src/lib/api.ts` — 全 API 呼び出し（`resolveConference()` に DI した `sleep` の既存の型がある）
  - `src/lib/tasks-api.ts` — 8 箇所の API 呼び出し
- Related specs: `spec/overview.md`、`spec/commands.md`
- Dependencies: **045-rate-limit-classification**（`RATE_LIMITED` の判定が前提）
- 参照: [Calendar API エラー](https://developers.google.com/workspace/calendar/api/guides/errors)

## Design Decisions

### 未決 — 実装前に決めること

このタスクは 045 から意図的に切り出した。**全コマンドの所要時間の性質を変える**変更なので、
先に方針を固めること。

1. **リトライの上限と待機列**。042 の会議ポーリングは 500ms → 1s → 2s の 3 回。
   レート制限はそれより長い待機が要る可能性がある。上限は何回で、最大どれだけ待つか。
   ジッタを入れるか（同時に走る複数プロセスが同期しないように）。
2. **オプトアウト**。`--no-retry` を足すか。スクリプトから使う場合、
   黙って数十秒待たれるより即座に失敗した方が良い場面がある。
3. **可視性**。待っている間に stderr へ知らせるか。`--quiet` ではどうするか。
   黙って固まる CLI は壊れて見える。
4. **リトライする操作の範囲**。読み取りは安全。書き込みも、レート制限は
   リクエストが**拒否された**ことを意味するので副作用は無く、リトライして安全なはず
   — ただしこれは確認すること。
5. **実装位置**。呼び出しごとに包むのか、`api-utils.ts` に
   `withRateLimitRetry(thunk)` のようなラッパを置いて全呼び出し箇所に適用するのか。
   後者なら Calendar と Tasks の両方を 1 箇所で賄える。

### テスト

`sleep` を DI して即時解決させる（042 の `ConferenceDeps` と同じ手口）。
実時間を待つテストは書かない。

### Out of Scope

- レート制限の事前回避（リクエストの間引き、バッチ化）
- `Retry-After` ヘッダの解釈（Calendar のドキュメントに記載が無い）

## Implementation Steps

- [ ] 上記「未決」の 5 点を決め、このファイルに追記する
- [ ] （方針確定後に具体化）

## E2E Test

**追加しない。** レート制限を意図的に発生させるには API を大量に叩く必要があり、
それ自体が迷惑行為である。`sleep` を DI したユニットテストで検証する。

## Acceptance Criteria

- [ ] レート制限に対して有界な exponential backoff でリトライする
- [ ] 上限に達したら 045 どおり `RATE_LIMITED` で失敗する
- [ ] リトライ中であることがユーザーに分かる（`--quiet` を除く）
- [ ] リトライを無効化する手段がある
- [ ] `sleep` が DI されており、テストが実時間を待たない
- [ ] レート制限以外のエラーではリトライしない
- [ ] 既存テストが pass する
