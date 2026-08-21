# Task: 出席者の差分更新 (`--add-attendee` / `--remove-attendee`)

## Purpose

041 で導入した `gcal update --attendee` は **Google Calendar API の仕様上、出席者リストの全置換**になる。
既存の出席者を保ったまま 1 人だけ追加/削除したいケースでは、呼び出し側が
「現在の出席者を取得 → マージ → 全置換」を自前で組み立てる必要があり、AI エージェントが誤って
既存の招待者を消してしまう事故が起きやすい。

CLI 側で read-modify-write を吸収し、`--add-attendee` / `--remove-attendee` を提供する。

## Context

- Related files:
  - `src/commands/update.ts` — `handleUpdate()`, `createUpdateCommand()`
  - `src/lib/api.ts` — `getEvent()`, `updateEvent()`, `UpdateEventInput`
  - `src/commands/index.ts` — `update` サブコマンドの依存注入
- Related specs: `spec/commands.md`
- Dependencies: **041-attendees**（`attendees` の型と全置換パスが前提）

## Design Decisions

### read-modify-write は API 層で行う

**当初は「`api.ts` の `updateEvent()` は薄いラッパのまま保ち、差分の解決は `handleUpdate()`
側で行う」という方針だったが、実装後のレビューで撤回した。** `handleUpdate()` が使える
現在の出席者は `CalendarEvent.attendees`、つまり `normalizeAttendees()` を通した
**非可逆な射影**しかない。全置換で書き戻す以上、射影が落とした情報はそのまま消える:

- `comment`（「10 分遅れます」等）と `additionalGuests` は読みも書きもしていないため、
  無関係な `--add-attendee` が既存出席者のコメントと同伴人数を消す。
- `normalizeAttendees()` はメールアドレスを持たない出席者（会議室・備品）を捨てる。
  出席者を書き戻さなかった頃は無害だったが、差分機能では**無関係な `--add-attendee` が
  会議室の予約を黙って解除する**ことになる。

そこで `updateEvent()` に `attendeeDiff` 入力を足し、**API が返した生の
`GoogleEventAttendee[]` に対して** マージするようにした。残す出席者はオブジェクトを
そのまま（参照で）書き戻すので、CLI がモデル化していないフィールドは今後 Google が
増やしたものも含めて保たれる。

commands 層は**ポリシー**だけを持つ: アドレスの検証、主催者の保護、add/remove 同時指定の
検出、未参加アドレスの注記、dry-run の表示。解決した差分を `attendeeDiff` として渡す。

取得は 1 回に統一する。`getEventWithRaw()` が正規化済みの `CalendarEvent` と生のレスポンスの
両方を返し、`handleUpdate()` の `getEvent` 依存もこの形にする。生の `attendees` は
`attendeeDiff.base` として `updateEvent()` に渡すので、API 層は取得し直さない
（`base` を渡さない呼び出し元のために、API 層側の取得はフォールバックとして残す）。

`--add-attendee` / `--remove-attendee` が**指定されたときだけ**イベントを取得する
（指定なしのときに余計な API 呼び出しを増やさない）という当初の条件はそのまま維持する。
`api` オブジェクトは注入されたままなので、マージもユニットテストでモックできる。

### マージ規則

1. `handleUpdate()` が生イベントを 1 回だけ取得し、その `attendees` を `attendeeDiff.base` として渡す
2. `--remove-attendee` のアドレスを除去（**大文字小文字を区別しない**比較。
   アドレスを持たない出席者は対象外なので必ず残る）
3. `--add-attendee` のアドレスを追加（既に居れば no-op）
4. 結果を patch の `attendees` として送る（= 全置換だが内容はマージ済み）

追加も削除も実際には起きなかった場合、**`attendees` は patch に含めない。**
同じ出席者リストを書き直すだけでも Google は「変更あり」とみなし、
`--notify` が `none` 以外なら全員に更新通知メールを送ってしまうため。

同一アドレスが `--add-attendee` と `--remove-attendee` の両方に指定された場合は `INVALID_ARGS`。

### 主催者の保護

Google はイベント主催者を自動的に attendees に含める。`--remove-attendee` で
`organizer: true` の出席者を消そうとした場合は `INVALID_ARGS` で弾く
（送信しても API 側で復活するか 400 になるため、CLI で明示的に止める方が分かりやすい）。

### 存在しないアドレスの削除

`--remove-attendee` に現在の出席者に居ないアドレスを渡した場合は**エラーにせず**、
stderr に注記を出して続行する（冪等な操作にしたいため）。

```
Note: dave@example.com is not an attendee of this event; nothing to remove.
```

### 排他制御

`--attendee`（全置換）/ `--clear-attendees` と `--add-attendee` / `--remove-attendee` は conflict にする。
意図の異なる 2 つのモードを同時に使わせない。

commander の `conflicts()` に加えて、`handleUpdate()` と `updateEvent()` にも
`INVALID_ARGS` のガードを置く。どちらも export されており CLI を経由せずに呼べるため、
「差分を計算してから黙って捨てる」状態にならないようにする。

### 競合（race condition）の扱い

read-modify-write は atomic ではない。取得と更新の間に他クライアントが出席者を変更すると
その変更が失われる。本タスクでは **ETag による楽観ロックは実装せず**、
`spec/commands.md` に「短時間に並行更新した場合は後勝ちになる」旨を注記するに留める。
（必要になれば `If-Match` ヘッダ対応を別タスクに切る。）

取得は 1 回なので、送信する内容はすべて同じスナップショットから決まる。時刻の部分更新
（`--start` 単独など）と差分を併用しても、時刻と出席者が別のスナップショットを見ることはない。

### Dry-run

`--dry-run` ではマージ結果を表示する。`getEvent` は呼ぶ（マージ結果を見せるため）が、
`updateEvent` は呼ばない。

```
DRY RUN: Would update event abc123:
  attendees: alice@example.com, bob@example.com   (+bob@example.com, -carol@example.com)
```

## Changes

### `gcal update`

```bash
gcal update abc123 --add-attendee bob@example.com
gcal update abc123 --remove-attendee carol@example.com --notify all
gcal update abc123 --add-attendee bob@example.com --remove-attendee carol@example.com
```

```
--add-attendee <email>      出席者を追加する（既存を保持、複数指定可）
--remove-attendee <email>   出席者を削除する（既存を保持、複数指定可）
```

`--notify` は 041 で追加済みのものをそのまま使う。

## Implementation Steps

- [x] `src/commands/update.test.ts`: マージ規則の失敗テストを書く
      （追加 / 削除 / 追加+削除の同時指定 / 大文字小文字違い / 既に居るアドレスの追加が no-op / 未参加アドレスの削除で stderr 注記）
- [x] `src/commands/update.ts`: `UpdateHandlerOptions` に `getEvent` を追加（041 で導入済み）
- [x] `src/lib/api.ts`: `UpdateEventInput` に `attendeeDiff` を追加し、生の
      `GoogleEventAttendee[]` に対してマージする（レビューで commands 層から移動）
- [x] `src/lib/api.ts`: 差分が空のときは `attendees` を patch に含めない
- [x] `src/lib/api.ts`: `attendees` と `attendeeDiff` の同時指定を `INVALID_ARGS`
- [x] `src/commands/update.ts`: `--add-attendee` / `--remove-attendee` 指定時のみ
      イベントを取得し、ポリシー適用と dry-run 表示を行って `attendeeDiff` を渡す
- [x] `src/lib/api.ts`: `getEventWithRaw()` で正規化済みイベントと生レスポンスの両方を返す
- [x] `src/lib/api.ts`: `attendeeDiff.base` を受け取り、渡されたら取得し直さない
- [x] `src/commands/update.ts`: 取得を 1 回にし、時刻解決・出席者ポリシー・dry-run・
      書き込むマージのすべてを同じスナップショットから決める
- [x] `src/commands/update.ts`: `--attendee` / `--clear-attendees` との conflict 設定
      （commander の `conflicts()` と `handleUpdate()` のガードの両方）
- [x] `src/commands/update.ts`: 同一アドレスの add/remove 同時指定を `INVALID_ARGS`
- [x] `src/commands/update.ts`: `organizer: true` の削除を `INVALID_ARGS`
- [x] `src/commands/update.ts`: dry-run のマージ結果表示
- [x] `src/commands/index.ts`: `update` サブコマンドに `getEvent` を注入（041 で導入済み）
- [x] `spec/commands.md`: オプション追加、全置換モードとの使い分け、後勝ちの注記
- [x] `src/lib/api.test.ts`: 生の出席者オブジェクトが保たれること / 空差分を書かないこと
- [x] `tests/integration/update-pipeline.test.ts`: get → merge → patch の一連が繋がること
      （`comment` / `additionalGuests` / アドレスを持たない会議室が保たれることを含む）
- [x] `bun run test` pass
- [x] `bun run lint` / `format:check` / `typecheck` pass

## E2E Test

`tests/e2e/attendees.test.ts`（041 で作成）に追記する。`--notify` は指定しない。

> 追記済み。実 API を叩くため本ブランチでは**未実行**（他エージェントと並行作業中のため）。

- [x] 出席者 2 名のイベントを作り、`--add-attendee` で 3 名になること（既存 2 名が保持されること）
- [x] `--remove-attendee` で 1 名減り、他が保持されること
- [x] 未参加アドレスの `--remove-attendee` が exit code 0 で stderr に注記を出すこと
- [x] `--attendee` と `--add-attendee` の同時指定が拒否されること
      （commander の conflict エラーは exit code **1**。既存の `--meet` / `--remove-meet` の
      E2E と同じく `exitCode !== 0` と stderr の `cannot be used with` で検証する）
- [x] 作成したイベントを cleanup で削除する

## Acceptance Criteria

- [x] `--add-attendee` が既存の出席者を保持したまま追加する
- [x] `--remove-attendee` が既存の出席者を保持したまま削除する
- [x] メールアドレスの比較が大文字小文字を区別しない
- [x] 既に居るアドレスの追加が no-op（`attendees` を patch に含めない）
- [x] 残す出席者の `responseStatus` / `comment` / `additionalGuests` が保たれる
- [x] アドレスを持たない出席者（会議室・備品）が差分で消えない
- [x] 追加も削除も起きなかったときに `attendees` を送らない（`--notify` 誤爆の防止）
- [x] 未参加アドレスの削除がエラーにならず stderr に注記が出る
- [x] 主催者の削除が `INVALID_ARGS` で弾かれる
- [x] `--attendee` / `--clear-attendees` との併用が弾かれる
- [x] `--add-attendee` / `--remove-attendee` 未指定のとき `getEvent` が呼ばれない
- [x] 差分指定時のイベント取得が 1 回だけであり、時刻と出席者が同じスナップショットから決まる
- [x] dry-run でマージ結果が表示され、更新は実行されない
- [x] 既存テストが pass する
