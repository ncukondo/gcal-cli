# Task: Expand Type Definitions

## Purpose

Define all core TypeScript types used throughout the application: Event, Calendar, error types, and JSON output envelope. These types form the foundation for every other module.

## Context

- Related files: `src/types/index.ts`
- Dependencies: none
- Related specs: `spec/output.md` (Data Structures), `spec/overview.md` (Exit Codes), `spec/config.md`

Current `src/types/index.ts` has partial types (`CalendarEvent`, `AppConfig`, `CalendarConfig`, `OutputFormat`). These need to be expanded and aligned with the spec.

## Implementation Steps

- [ ] Write tests for type shape validation (ensure types compile correctly with sample data)
- [ ] Expand `CalendarEvent` type to match spec: add `calendar_name`, `html_link`, `created`, `updated` fields; rename `summary` to `title`
- [ ] Add `Calendar` type per output spec: `id`, `name`, `description`, `primary`, `enabled`
- [ ] Add error code union type: `AUTH_REQUIRED | AUTH_EXPIRED | NOT_FOUND | INVALID_ARGS | API_ERROR | CONFIG_ERROR`
- [ ] Add `SuccessResponse<T>` and `ErrorResponse` types for JSON envelope
- [ ] Add `ExitCode` enum or const: `0 = Success`, `1 = General`, `2 = Auth`, `3 = Argument`
- [ ] Add `EventStatus` and `Transparency` union types
- [ ] Verify all existing tests still pass

## E2E Test

- [ ] Not applicable (type-only changes, verified at compile time)

## Acceptance Criteria

- [ ] All types from `spec/output.md` Data Structures section are defined
- [ ] Error code type and exit code constants are defined
- [ ] JSON response envelope types (`SuccessResponse`, `ErrorResponse`) are defined
- [ ] `CalendarEvent.title` replaces `CalendarEvent.summary` (aligns with spec field name)
- [ ] Existing tests pass with updated types
- [ ] `bun run lint` passes
