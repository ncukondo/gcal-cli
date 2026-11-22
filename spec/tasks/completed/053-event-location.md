# Task: add・update で予定の場所（location）を設定する (#75)

## Purpose

学会の部屋番号などを説明欄ではなく場所欄に入れられるようにする。場所欄に入っていれば
スマートフォンのカレンダーで地図に飛べ、一覧でも目に入る。

## Context

- Related files: `src/commands/add.ts`, `src/commands/update.ts`, `src/lib/api.ts`,
  `src/lib/output.ts`, `src/lib/recurring-exceptions.ts`, `src/types/index.ts`
- Related specs: `spec/commands.md`（add / update / 繰り返し予定）, `spec/output.md`

## Implementation Steps

- [x] `CalendarEvent.location: string | null` を追加（空文字は null に正規化）
- [x] `gcal add --location <text>`、`gcal update --location <text>` / `--clear-location`
  （短縮形 `-l` は `gcal tasks` の `--list` と紛らわしいので付けない）
- [x] `show` と `list` のテキスト出力に場所を表示、JSON に `location` を含める
- [x] `--dry-run` に場所の変更を表示（クリアは `location: (none)`）
- [x] 繰り返し予定の本体更新: location を比較対象・書き戻し対象（`RESTORABLE_FIELDS`）に含める

## E2E Test

- [x] 実カレンダーで `gcal add --location` → `gcal update --location` → `--clear-location` を確認（2026-11-22、ダミー予定で確認後削除）

## Acceptance Criteria

- [x] `gcal add -t X -s 2026-11-22T10:30 --location "A-2会議室"` で場所付きの予定ができる
- [x] `gcal update <id> --location "E-2会議室"` で場所だけが変わる（patch body は `location` のみ）
- [x] `--dry-run` で場所の変更が表示される
