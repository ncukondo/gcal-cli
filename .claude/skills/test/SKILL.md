# /test

Run tests, typecheck, and lint. Report results.

## Usage

```
/test [subset]
```

- `/test` — run all checks
- `/test unit` — unit tests only
- `/test e2e` — e2e tests only
- `/test lint` — lint only

## Steps

1. **Run tests**: `bun run test:all` (or subset)
2. **Run lint**: `bun run lint`
3. **Report summary**:
   - Pass/fail counts
   - Failed test details
   - Lint errors
   - Overall status

## Auto-fix

If lint errors are found, suggest `bun run lint --fix` to auto-fix.
