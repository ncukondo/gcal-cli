# ROADMAP

## Priority Order

Tasks should be implemented in this order, respecting dependencies within each phase.

## Pending

(none)

## In Progress

(none)

## Completed

### Phase 9: Command Consistency

22. [022-update-command-duration](./completed/022-update-command-duration.md) — gcal update に --duration サポートと --start/--end 単独指定を追加 (#31)

### Phase 8: UX Improvements (cont.)

21. [021-add-command-ux](./completed/021-add-command-ux.md) — gcal add UX改善: 全日イベント自動判定・end省略・duration対応 (#30)

### Phase 7: UX Improvements

21. [020-search-range-feedback](./completed/020-search-range-feedback.md) — Search range stderr feedback & negative --days (#28)

### Phase 6: Testing & Polish

18. [017-integration-tests](./completed/017-integration-tests.md) — Integration tests (cross-module) (#26)
19. [018-e2e-tests](./completed/018-e2e-tests.md) — E2E tests (real API calls) (#27)

### Phase 3–5: CLI Framework, API, Read & Write Commands

8. [008-cli-entry](./completed/008-cli-entry.md) — CLI entry point, global options, command registration (#15)
9. [009a-api-read](./completed/009a-api-read.md) — Google Calendar API wrapper: read operations (#16)
10. [009b-api-write](./completed/009b-api-write.md) — Google Calendar API wrapper: write operations (#17)
11. [010-calendars-command](./completed/010-calendars-command.md) — `gcal calendars` command (#19)
12. [011-list-command](./completed/011-list-command.md) — `gcal list` command (#20)
13. [012-search-command](./completed/012-search-command.md) — `gcal search` command (#18)
14. [013-show-command](./completed/013-show-command.md) — `gcal show` command (#22)
15. [014-add-command](./completed/014-add-command.md) — `gcal add` command (#21)
16. [015-update-command](./completed/015-update-command.md) — `gcal update` command (#23)
17. [016-delete-command](./completed/016-delete-command.md) — `gcal delete` command (#25)
20. [019-init-command](./completed/019-init-command.md) — `gcal init` command (#24)

### Phase 2: Auth

6. [006-auth-module](./completed/006-auth-module.md) — OAuth flow, token storage/refresh (#13)
7. [007-auth-command](./completed/007-auth-command.md) — `gcal auth` / `--status` / `--logout` command (#14)

### Phase 1: Core Library

1. [001-types](./completed/001-types.md) — Expand type definitions (#1)
2. [002-timezone](./completed/002-timezone.md) — Timezone resolution module (#2)
3. [003-config](./completed/003-config.md) — TOML config management (#3)
4. [004-filter](./completed/004-filter.md) — Event filtering (#4)
5. [005-output](./completed/005-output.md) — Enhance output formatting (#5)
