# gcal-cli Specifications

## Quick Start

1. Check `tasks/ROADMAP.md` for current priorities
2. Read `overview.md` for project context
3. Pick a task from the roadmap and start implementing

## Spec Files

| File | Description |
|------|-------------|
| [overview.md](./overview.md) | Project purpose, tech stack, design principles |
| [commands.md](./commands.md) | CLI command specifications |
| [config.md](./config.md) | Configuration file format |
| [output.md](./output.md) | Output format specifications |
| [auth.md](./auth.md) | Authentication flow |
| [architecture.md](./architecture.md) | Project structure and module responsibilities |
| [testing.md](./testing.md) | Test strategy and TDD approach |

## Task Management

- Tasks live in `tasks/` directory
- Use `tasks/ROADMAP.md` to track priority and progress
- Template: `tasks/_template.md`
- Completed tasks are moved to `tasks/completed/`

## Agent Roles

- `roles/implement.md` — Worker agent rules (TDD, commits, PR creation)
- `roles/review.md` — Reviewer agent rules (test, review, post findings)
