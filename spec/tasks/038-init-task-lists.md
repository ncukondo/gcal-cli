# Task: `gcal init` にタスクリスト設定を追加

## Purpose

`gcal init` コマンドで設定ファイルを生成する際に、タスクリスト設定も含めるようにする。

## Context

- Related files: `src/commands/init.ts`, `src/lib/config.ts`
- Related specs: `spec/google-tasks.md`, `spec/config.md`
- Dependencies: 031-tasks-lists-command

## Changes

### `gcal init` の拡張

- Google Tasks API からタスクリスト一覧を取得
- config.toml に `[[task_lists]]` セクションを追加
- デフォルトリストのみ enabled（`--all` で全リスト有効化）

### 生成される config.toml

```toml
timezone = "Asia/Tokyo"

[[calendars]]
id = "primary"
name = "Main Calendar"
enabled = true

[[task_lists]]
id = "@default"
name = "My Tasks"
enabled = true

[[task_lists]]
id = "abc123"
name = "Work"
enabled = false
```

### Text Output

```
Config file created: ~/.config/gcal-cli/config.toml

Enabled calendars:
  - Main Calendar (user@gmail.com)

Enabled task lists:
  - My Tasks (@default)

Timezone: Asia/Tokyo
```

### 注意事項

- Tasks API のスコープがない場合（再認証前）はタスクリストの取得をスキップし、`task_lists` セクションを含めない
- `--all` オプションはカレンダーとタスクリストの両方に適用

## Implementation Steps

- [ ] `src/lib/config.ts`: `generateConfigToml()` に `task_lists` 出力を追加
- [ ] `src/commands/init.ts`: タスクリスト取得・設定生成を追加
- [ ] `src/commands/init.ts`: Tasks API エラー時のフォールバック処理
- [ ] `spec/config.md`: `task_lists` セクションの説明を追加
- [ ] `src/commands/init.test.ts`: テスト更新
- [ ] `bun run test` pass
- [ ] `bun run lint` pass
- [ ] `bun run format:check` pass

## Acceptance Criteria

- [ ] `gcal init` で `task_lists` セクションが生成される
- [ ] デフォルトリストが enabled になる
- [ ] `--all` で全リストが enabled になる
- [ ] Tasks スコープがない場合もエラーにならない
- [ ] テストが pass する
