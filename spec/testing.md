# Testing Specification

## Tools

| Tool | Purpose |
|------|---------|
| Vitest | Test runner |
| oxlint | Linter |
| oxfmt | Formatter |

## Development Approach

**TDD (Test-Driven Development)**

1. Write failing test first
2. Implement minimal code to pass
3. Refactor while keeping tests green

## Test Types

### Unit Tests

- Test individual functions and modules in isolation
- Mock external dependencies (Google API, filesystem)
- Fast execution, run frequently during development

Location: `src/**/*.test.ts`

### Integration Tests

- Test module interactions
- May use test fixtures
- Verify config parsing, output formatting, etc.

Location: `tests/integration/**/*.test.ts`

### E2E Tests

- Test complete CLI commands against real Google Calendar API
- Require valid OAuth credentials
- Verify actual behavior end-to-end

Location: `tests/e2e/**/*.test.ts`

## Test Execution

### CI (GitHub Actions)

```bash
bun run test:unit
bun run test:integration
```

### Local Development

```bash
bun run test:unit
bun run test:integration
bun run test:e2e          # Required before commit
```

## E2E Test Policy

**CRITICAL**: E2E tests must always pass before merging.

When E2E tests fail:

1. **DO NOT** add mocks to bypass the failure
2. **DO NOT** change expected values to match broken behavior
3. **DO NOT** delete or skip failing tests
4. **DO** investigate the root cause thoroughly
5. **DO** fix the underlying issue in the implementation

E2E failures often reveal hidden issues that unit tests miss. Even when unit tests pass, E2E tests must not be skipped.

## Scripts (package.json)

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run src",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "vitest run tests/e2e",
    "test:all": "vitest run",
    "lint": "oxlint src tests",
    "format": "oxfmt src tests",
    "format:check": "oxfmt --check src tests"
  }
}
```

## Directory Structure

```
gcal-cli/
├── src/
│   ├── lib/
│   │   ├── config.ts
│   │   ├── config.test.ts      # Unit test alongside source
│   │   └── ...
│   └── commands/
│       ├── list.ts
│       ├── list.test.ts
│       └── ...
├── tests/
│   ├── integration/
│   │   ├── config.test.ts
│   │   └── output.test.ts
│   └── e2e/
│       ├── list.test.ts
│       ├── add.test.ts
│       └── auth.test.ts
└── vitest.config.ts
```
