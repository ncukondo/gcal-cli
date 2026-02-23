# Task: Expand Type Definitions

## Purpose

Define all core TypeScript types used throughout the application: Event, Calendar, error types, and JSON output envelope. These types form the foundation for every other module.

## Context

- Related files: `src/types/index.ts`
- Dependencies: none
- Related specs: `spec/output.md` (Data Structures), `spec/overview.md` (Exit Codes), `spec/config.md`

Current `src/types/index.ts` has partial types (`CalendarEvent`, `AppConfig`, `CalendarConfig`, `OutputFormat`). These need to be expanded and aligned with the spec.

## Implementation Steps

- [x] Write tests for type shape validation (ensure types compile correctly with sample data)
- [x] Expand `CalendarEvent` type to match spec: add `calendar_name`, `html_link`, `created`, `updated` fields; rename `summary` to `title`
- [x] Add `Calendar` type per output spec: `id`, `name`, `description`, `primary`, `enabled`
- [x] Add error code union type: `AUTH_REQUIRED | AUTH_EXPIRED | NOT_FOUND | INVALID_ARGS | API_ERROR | CONFIG_ERROR`
- [x] Add `SuccessResponse<T>` and `ErrorResponse` types for JSON envelope
- [x] Add `ExitCode` enum or const: `0 = Success`, `1 = General`, `2 = Auth`, `3 = Argument`
- [x] Add `EventStatus` and `Transparency` union types
- [x] Verify all existing tests still pass

## E2E Test

- [x] Not applicable (type-only changes, verified at compile time)

## Acceptance Criteria

- [x] All types from `spec/output.md` Data Structures section are defined
- [x] Error code type and exit code constants are defined
- [x] JSON response envelope types (`SuccessResponse`, `ErrorResponse`) are defined
- [x] `CalendarEvent.title` replaces `CalendarEvent.summary` (aligns with spec field name)
- [x] Existing tests pass with updated types
- [x] `bun run lint` passes

## Completion

- **PR**: #1
- **Merged**: ✓
