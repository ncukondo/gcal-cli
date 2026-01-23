# Architecture Specification

## Directory Structure

```
gcal-cli/
├── spec/                     # Specifications (this directory)
│   ├── overview.md
│   ├── commands.md
│   ├── config.md
│   ├── output.md
│   ├── auth.md
│   └── architecture.md
├── src/
│   ├── index.ts              # Entry point, CLI setup
│   ├── commands/
│   │   ├── index.ts          # Command registration
│   │   ├── list.ts           # gcal list
│   │   ├── search.ts         # gcal search
│   │   ├── add.ts            # gcal add
│   │   ├── show.ts           # gcal show
│   │   ├── update.ts         # gcal update
│   │   ├── delete.ts         # gcal delete
│   │   ├── calendars.ts      # gcal calendars
│   │   └── auth.ts           # gcal auth
│   ├── lib/
│   │   ├── api.ts            # Google Calendar API wrapper
│   │   ├── auth.ts           # OAuth handling
│   │   ├── config.ts         # Config file management
│   │   ├── timezone.ts       # Timezone resolution
│   │   ├── filter.ts         # Event filtering (busy/free/confirmed)
│   │   └── output.ts         # Output formatting
│   └── types/
│       └── index.ts          # TypeScript type definitions
├── tests/
│   ├── integration/          # Integration tests
│   └── e2e/                  # E2E tests (local only)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env.example
```

## Module Responsibilities

### `src/index.ts`

- Parse CLI arguments with commander
- Route to appropriate command handler
- Handle top-level errors

### `src/commands/*`

Each command file exports a function that:
1. Validates arguments
2. Calls lib functions
3. Outputs result via `output.ts`

### `src/lib/api.ts`

- Wraps Google Calendar API calls
- Handles pagination
- Normalizes response data to internal types
- Supports both timed and all-day events

### `src/lib/auth.ts`

- OAuth flow implementation
- Token storage/retrieval
- Token refresh logic

### `src/lib/config.ts`

- TOML parsing (use `smol-toml`)
- Config file discovery
- Calendar filtering logic
- CLI calendar override handling

### `src/lib/timezone.ts`

- Timezone resolution (CLI > config > system)
- Datetime conversion utilities

### `src/lib/filter.ts`

- Filter events by transparency (busy/free)
- Filter events by status (confirmed/tentative)
- Combine multiple filter conditions

### `src/lib/output.ts`

- Text formatting (default)
- JSON formatting
- Error response generation

## Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "googleapis": "^130.0.0",
    "date-fns": "^3.0.0",
    "date-fns-tz": "^3.0.0",
    "smol-toml": "^1.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0",
    "oxlint": "latest",
    "@oxc/oxfmt": "latest"
  }
}
```

## Build & Distribution

### Development

```bash
bun run src/index.ts
```

### Build (npm package)

```bash
bun build src/index.ts --outdir dist --target node
```

### Build (single binary)

```bash
bun build src/index.ts --compile --outfile gcal
```

## Error Handling Pattern

```typescript
try {
  const result = await doOperation();
  output.success(result, options.format);
  process.exit(0);
} catch (error) {
  output.error(errorToCode(error), error.message, options.format);
  process.exit(getExitCode(error));
}
```
