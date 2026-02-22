# gcal-cli

CLI tool for managing Google Calendar events, designed for AI agent integration.

## Getting Started

- Read `spec/README.md` first when starting a new session
- Check `spec/tasks/ROADMAP.md` for current priorities

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Test**: Vitest
- **Lint**: oxlint
- **Format**: oxfmt
- **CLI**: commander

## Commands

```bash
bun run test          # Run all tests
bun run test:unit     # Unit tests only
bun run test:integration  # Integration tests
bun run test:e2e      # E2E tests (requires auth)
bun run lint          # Lint
bun run format        # Format
bun run format:check  # Format check
```

## Development Rules

### TDD (Red-Green-Refactor)

1. Write a failing test first
2. Write minimal code to pass
3. Refactor while keeping tests green

### Commits

- Make frequent, small commits
- Use specific `git add <file>` (never `git add -A` or `git add .`)
- Commit messages in English

### Context Management

- If context compaction is likely, pause and report to user before continuing
- At 15% context remaining: commit, push, create WIP PR, then exit

### tmux Guidelines

When using `tmux send-keys`:
- Always send text and Enter key separately
- Add `sleep 1` between them to prevent input race conditions

```bash
# Correct
tmux send-keys -t "$pane" "command" && sleep 1 && tmux send-keys -t "$pane" Enter

# Wrong
tmux send-keys -t "$pane" "command" Enter
```

## Agent Roles

This project supports multi-agent workflows. See `spec/roles/` for role definitions.

<!-- role: implement -->
