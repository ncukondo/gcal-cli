# /spawn-agent

Spawn a generic Claude agent for various tasks.

## Usage

```
/spawn-agent [options] [-- <prompt>]
```

## Options

- `--pr <number>`: Work on a specific PR (auto-detect branch)
- `--create`: Create a new worktree
- `--role <role>`: Set agent role (implement/review)
- `--main`: Use main repo (no worktree)

## Examples

```bash
# Spawn a research agent
/spawn-agent -- "Research how Google Calendar API handles recurring events"

# Spawn an agent to fix a PR
/spawn-agent --pr 42 --role implement -- "Fix the review comments"

# Spawn an interactive agent
/spawn-agent --create
```

## Rules

- Max 4 worker panes + 1 main pane
- Each agent runs in its own tmux pane
- Agent lifecycle is managed via state tracking
