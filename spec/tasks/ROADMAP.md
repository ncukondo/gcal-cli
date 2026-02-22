# ROADMAP

## Priority Order

Tasks should be implemented in this order, respecting dependencies within each phase.

## Pending

### Phase 1: Core Library (no Google API dependency, unit-testable)

1. [001-types](./001-types.md) — Expand type definitions (Event, Calendar, Error types)
2. [002-timezone](./002-timezone.md) — Timezone resolution module (CLI > config > system)
3. [003-config](./003-config.md) — TOML config management (parsing, discovery, calendar selection)
4. [004-filter](./004-filter.md) — Event filtering (busy/free, confirmed/tentative)
5. [005-output](./005-output.md) — Enhance output formatting (date grouping, JSON envelope, error codes)

### Phase 2: Auth

6. [006-auth-module](./006-auth-module.md) — OAuth flow, token storage/refresh
7. [007-auth-command](./007-auth-command.md) — `gcal auth` / `--status` / `--logout` command

### Phase 3: CLI Framework & API

8. [008-cli-entry](./008-cli-entry.md) — CLI entry point, global options, command registration
9. [009a-api-read](./009a-api-read.md) — Google Calendar API wrapper: read operations (list, get, normalization)
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

## Completed
