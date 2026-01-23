# gcal-cli Overview

## Purpose

CLI tool for managing Google Calendar events, designed for seamless AI agent integration.

## Target Calendars

Only calendars containing "main" in their name are targeted by default.

## Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | Bun |
| Language | TypeScript |
| CLI Framework | commander |
| Google API | googleapis |
| Date Handling | date-fns, date-fns-tz |
| Config Format | TOML |

## Key Features

- List and search events with filtering (busy/free, confirmed/tentative)
- Support for all-day and timed events
- Configurable timezone (CLI > config > system)
- Multiple calendar support with enable/disable in config
- CLI override for target calendars

## Design Principles

1. **Human-readable default**: Text output for terminal use
2. **Machine-readable option**: JSON output with `-f json` for AI agents
3. **Consistent command structure**: Predictable subcommand patterns
4. **Structured errors**: Exit codes and JSON error messages

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication error |
| 3 | Argument error |

## Related Specs

- [commands.md](./commands.md) - Command specifications
- [config.md](./config.md) - Configuration file format
- [output.md](./output.md) - Output format specifications
- [auth.md](./auth.md) - Authentication flow
- [architecture.md](./architecture.md) - Project structure
- [testing.md](./testing.md) - Test strategy and TDD approach
