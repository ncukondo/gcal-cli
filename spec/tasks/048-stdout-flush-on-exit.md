# Task: JSON 出力がパイプで 64KB を超えると切れる（process.exit が stdout のフラッシュを待たない）

GitHub issue: #64

## Purpose

`gcal ... -f json` の出力をパイプに流すと、ちょうど **65,536 バイト**で切れて JSON として壊れる。
ファイルへリダイレクトした場合は全量出る。

```
$ gcal tasks list -l Calendar -f json | wc -c
65536
$ gcal tasks list -l Calendar -f json > out.json; wc -c out.json
162163 out.json
$ gcal tasks list -l Calendar -f json | jq '.data.count'
jq: error: Unfinished string at EOF at line 343, column 22
```

このツールのエージェント向けインタフェースは `-f json` をパイプで受けて parse することであり、
そこが壊れているとエージェントは grep 等の場当たり的手段に退避し、本日 due のタスクを見落とす。

### 原因

`src/commands/index.ts` の各ハンドラが `process.stdout.write(...)` の直後に
`process.exit(result.exitCode)` を呼んでいる（`runTaskAction` ほか、すべてのコマンドが同じ形）。
Linux のパイプは 64KB（カーネルのパイプバッファ）を超える分が libuv の非同期キューに入るため、
`process.exit()` で捨てられる。素の Node で再現できる:

```
$ node -e 'process.stdout.write("x".repeat(200000)); process.exit(0)' | wc -c
65536
$ node -e 'process.stdout.write("x".repeat(200000))' | wc -c
200000
```

`tasks list` に限らず `list` / `search` などすべてのコマンドが同じ終了経路を通る。
`src/cli.ts` の `handleError` も stderr に書いた直後に exit している。

## Context

- Related files:
  - `src/commands/index.ts` — 各コマンドの action 内の `process.exit(result.exitCode)`（十数箇所）
  - `src/cli.ts` — `handleError()`（stderr 書き込み直後の exit）、`command:*` と
    `resolveGlobalOptions()` の引数エラー exit
  - `src/index.ts` — エントリポイント
  - `tests/e2e/helpers.ts` — `Bun.spawn` で stdout を pipe 経由で読んでいる（同じ経路の参考）
- Related specs: `spec/output.md`, `spec/architecture.md`
- Dependencies: なし

## Design Decisions

### 終了は `process.exitCode` を設定して自然終了させる

`process.exit()` を直接呼ぶ箇所をなくし、終了コードは `process.exitCode = code` で設定して
イベントループの終了に任せる。Node は自然終了時に stdout/stderr のキューを書き切ってから終わる。

`src/commands/index.ts` に散らばっている
`process.exit(result.exitCode)` を、共通の小さなヘルパー（例: `src/cli.ts` に
`finish(result: CommandResult): void` を追加し `process.exitCode` を設定する）に置き換える。
`handleError()` も `process.exit(...)` を `process.exitCode = ...` に変える。

### 自然終了で止まらないことを必ず確認する

`process.exit()` をやめると、開いたままのハンドル（googleapis の keep-alive ソケット、
タイマー、閉じ忘れの HTTP サーバー等）があるとプロセスが終了しなくなる。
**これは実装の最初に実機で確認する**（`bun run dev tasks list -f json | cat` と
`bun run dev list -f json | cat` が数秒以内に終わり、終了コードが保たれること）。

止まる場合は、フラッシュを待ってから exit する方式に切り替える:

```ts
export function finish(result: CommandResult): void {
  process.exitCode = result.exitCode;
  // 空チャンクの write コールバックは、先行するすべてのチャンクが書き終わった後に呼ばれる
  process.stdout.write("", () => process.exit(result.exitCode));
}
```

どちらの方式でも、**`process.exit()` の直接呼び出しが `src/commands/index.ts` に残らない**ことを
条件とする。

### 引数エラーの exit も同じ経路に載せる

`cli.ts` の `command:*`（不明なコマンド）と `resolveGlobalOptions()`（不正な `--format`）は
stderr に短いメッセージを書いて `process.exit(ExitCode.ARGUMENT)` している。出力は小さく実害は
ないが、経路を 1 つにしておく方が再発を防げる。ただし `resolveGlobalOptions()` は呼び出し元が
「戻ってこない」前提で書かれているので、変える場合は呼び出し元の挙動（不正な format のまま処理を
続けない）を壊さないこと。難しければこの 2 箇所は現状維持でよい（理由を PR に書く）。

### 回帰テストは子プロセスでパイプ越しに全量読む

ユニットテストでは `process.exit` の挙動を再現できないので、**子プロセスを起動して stdout を
パイプで全部読む**テストを integration に置く。認証を要求しない経路が必要なので、
共通ヘルパー（`finish`）を使って 200KB 以上を書き出す小さなフィクスチャスクリプトを
`tests/integration/fixtures/` に置き、`Bun.spawn` で起動して:

- stdout の長さが書き込んだ長さと一致する
- 終了コードが指定したもの（0 以外も 1 ケース）になる
- 一定時間（例: 10 秒）以内に終了する（ハングの検出）

を確認する。`bun run --bun vitest run` で動くこと（`test:all`）。

加えて、`src/commands/index.ts` に `process.exit(` が残っていないことを確認する
軽いガードテスト（ファイルを読んで文字列を検索する）を置いてよい。

### Out of Scope

- 出力のストリーミング化（現状は 1 回の `write` で全量を書いており、それ自体は問題ない）
- `--quiet` 等の出力形式の変更

## Implementation Steps

- [x] 実機で現象を再現し（`bun run dev tasks list -f json | wc -c` 等）、記録する
- [x] `src/cli.ts`: `finish(result)` ヘルパーを追加（テスト先行: `src/cli.test.ts` に
      `process.exitCode` が設定されることを確認するテスト）
- [x] `tests/integration/stdout-flush.test.ts` + `tests/integration/fixtures/large-output.ts`:
      200KB 超をパイプ越しに全量受け取れることを確認するテスト（この時点では失敗する）
- [x] `src/commands/index.ts`: すべての `process.exit(result.exitCode)` を `finish(result)` に置換
- [x] `src/cli.ts`: `handleError()` の `process.exit` を `process.exitCode` に変更
- [x] 実機で自然終了することを確認（`tasks list` / `list` / `search` / エラー経路）。
      止まる場合はフラッシュ待ち方式に切り替え、PR に理由を書く
- [x] `command:*` / `resolveGlobalOptions()` の exit の扱いを決めて実装（または現状維持の理由を PR に記載）
- [x] `bun run test:all` / `lint` / `format:check` / `typecheck` pass

## E2E Test

- [x] `tests/e2e/output-and-filters.test.ts`（または新規）: `runCliJson("tasks", "list")` /
      `runCliJson("list", "--days", "60")` が JSON として parse できること。
      64KB を超えるかは実データ次第なので保証はしないが、パイプ経由で全量読む経路の煙テストとして置く

## Acceptance Criteria

- [x] `gcal tasks list -f json | jq .` が 64KB を超える出力でも壊れない
- [x] 終了コードが従来どおり（成功 0、エラー時は `error.code` に対応する値）
- [x] すべてのコマンドが数秒以内に自然終了する（ハングしない）
- [x] `src/commands/index.ts` に `process.exit(` の直接呼び出しが残っていない
- [x] 子プロセスでパイプ越しに 64KB 超を読む回帰テストが `test:all` に含まれ pass する
- [x] 既存テストが pass する
