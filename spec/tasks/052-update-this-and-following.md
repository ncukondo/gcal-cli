# Task: 繰り返し予定を「これ以降のすべての予定」で更新する (#72)

## Purpose

`gcal update` で更新できるのは、繰り返し予定のシリーズ全体（本体 ID）か 1 回（インスタンス ID）だけで、
Web UI の「これ以降のすべての予定」がない。今は回を 1 つずつ更新するしかない。

## 実測した Google の挙動（2026-10-08、使い捨てシリーズ）

Web UI での分割（#72 のコメント参照）:

- 元の本体は `RRULE` の `COUNT` / `UNTIL` を `UNTIL=<分割の前日の終わり>` に置き換える
- 新シリーズの ID は `<元ID>_R<分割する回の開始>`（時刻指定: UTC `YYYYMMDDTHHMMSS`、終日: `YYYYMMDD`）。
  iCalUID は `<新ID>@google.com` で、元のシリーズとは別になる
- `COUNT` の場合、新シリーズの `COUNT` は残りの回数になる。`UNTIL` はそのまま
- 分割点以降の回の ID は**変わらない**（`<元ID>_<開始>Z`）。`recurringEventId` だけが新シリーズを指す
- 分割点以降の例外は新シリーズに移る。変更したフィールドは新しい値で上書きされ、
  変更しなかったフィールドは**その回の値が残る**

API での再現:

- `events.insert` では `_R` を含む ID を指定できない（400）。
  `events.import` で `iCalUID: "<元ID>_R<開始>@google.com"` を渡すと、Web UI と同じ ID が作られる
- 手順は (1) 元の本体の `recurrence` を切り詰める (2) 新シリーズを import する。
  (1) で分割点以降の回は cancelled になり、(2) で同じ ID の回として新シリーズに現れるが、
  **その回の値（説明・移動した時刻）は失われ、削除した回も復活する**。
  分割前にこれらを読んでおき、(2) の後に書き戻す・削除し直す必要がある（いずれも実測で可能）
- `conferenceData`（`conferenceId` / `conferenceSolution` / `entryPoints`）を
  `conferenceDataVersion: 1` で渡すと、同じ Meet リンクが新シリーズに付く
- (1) の後に `recurrence` を元に戻しても、分割点以降の例外は戻らない（移動はリセット、削除は復活）。
  ロールバックでは例外も書き戻す必要がある
- 元のシリーズを削除すると、そこから分割したシリーズも削除される（410 Gone）

## 決めたこと

- `--this-and-following` はインスタンス ID にだけ使える。本体 ID・単発の予定では `INVALID_ARGS`
- 分割する回がシリーズの最初の回なら、シリーズ全体の更新と同じ（本体を更新する。#70 の処理がそのまま働く）
- 自分が organizer でないシリーズは分割できない（`INVALID_ARGS`）。自分のコピーの `recurrence` だけが変わるのを防ぐ
- 分割点以降の例外:
  - 変更しないフィールドの値は**常に**新シリーズの同じ回に書き戻す（Web UI と同じ）。削除された回は削除し直す
  - 変更するフィールドについて例外の値を持つ回があれば、#70 と同じくフラグ無しでは中止。
    `--preserve-exceptions` はその値も書き戻し、`--overwrite-exceptions` は新しい値にする
  - 書き戻せないのは会議（Meet）だけ。会議が違う回は `--overwrite-exceptions` でしか進めない
  - 時刻を変える場合、新シリーズの回は別の ID になるので例外は書き戻せない。
    例外・削除された回があれば `--overwrite-exceptions` でしか進めない（削除された回は復活する）
- `--notify`: (1) の切り詰めにだけ効く。`events.import` には `sendUpdates` が無く、新シリーズは通知されない。
  出席者がいて `--notify` が `none` 以外のとき、そのことを stderr に出す
- (2) が失敗したら、元の `recurrence` に戻し、分割点以降の例外を書き戻してから、失敗として報告する。
  ロールバックにも失敗したら、元の `recurrence` を含めて報告する
- 出力: 新シリーズの本体を表示し、`split`（元の ID、新しい ID、分割点、両方の `recurrence`）を付ける。
  quiet は新シリーズの ID

## Context

- Related files: `src/commands/update.ts`, `src/lib/recurring-exceptions.ts`, `src/lib/recurring-split.ts`（新規）,
  `src/lib/api.ts`, `src/commands/shared.ts`
- Related specs: `spec/commands.md`（`gcal update`）
- Dependencies: 051-recurring-exceptions

## Implementation Steps

- [ ] `events.import` と `instances` の `showDeleted` を API 抽象に追加
- [ ] RRULE の切り詰め・続き（COUNT / UNTIL / 終日）と新シリーズ ID を計算する純粋関数
- [ ] 分割点以降の例外の分類（書き戻す値・衝突・削除された回）
- [ ] `--this-and-following` の実行（切り詰め → import → 書き戻し）とロールバック
- [ ] `--dry-run`、text / JSON / quiet 出力
- [ ] help と spec を更新

## E2E Test

- [ ] 使い捨てシリーズで分割し、Web UI の結果と ID・RRULE・例外が一致することを確認して削除する

## Acceptance Criteria

- [ ] 単体テスト: RRULE の切り詰め（UNTIL / COUNT / 終日）、新シリーズの body、
  分割点以降の例外（中止・保持・上書き・自動の書き戻し・削除し直し）、dry-run、部分失敗とロールバック
