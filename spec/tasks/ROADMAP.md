# ROADMAP

## Priority Order

Tasks should be implemented in this order, respecting dependencies within each phase.

## Pending

### Phase 3: CLI Framework & API

10. [009b-api-write](./009b-api-write.md) — Google Calendar API wrapper: write operations (create, update, delete)

### Phase 4: Read Commands

11. [010-calendars-command](./010-calendars-command.md) — `gcal calendars` command
12. [011-list-command](./011-list-command.md) — `gcal list` command
13. [012-search-command](./012-search-command.md) — `gcal search` command
14. [013-show-command](./013-show-command.md) — `gcal show` command

### Phase 5: Write Commands

15. [014-add-command](./014-add-command.md) — `gcal add` command
16. [015-update-command](./015-update-command.md) — `gcal update` command
17. [016-delete-command](./016-delete-command.md) — `gcal delete` command

### Phase 6: Testing & Polish

18. [017-integration-tests](./017-integration-tests.md) — Integration tests (cross-module)
19. [018-e2e-tests](./018-e2e-tests.md) — E2E tests (real API calls)

## In Progress

(none)

## Completed

### Phase 3: CLI Framework & API (partial)

8. [008-cli-entry](./completed/008-cli-entry.md) — CLI entry point, global options, command registration (#15)
9. [009a-api-read](./completed/009a-api-read.md) — Google Calendar API wrapper: read operations (#16)

### Phase 2: Auth

6. [006-auth-module](./completed/006-auth-module.md) — OAuth flow, token storage/refresh (#13)
7. [007-auth-command](./completed/007-auth-command.md) — `gcal auth` / `--status` / `--logout` command (#14)

### Phase 1: Core Library

1. [001-types](./completed/001-types.md) — Expand type definitions (#1)
2. [002-timezone](./completed/002-timezone.md) — Timezone resolution module (#2)
3. [003-config](./completed/003-config.md) — TOML config management (#3)
4. [004-filter](./completed/004-filter.md) — Event filtering (#4)
5. [005-output](./completed/005-output.md) — Enhance output formatting (#5)
