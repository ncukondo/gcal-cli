# /implement

Main orchestration skill. Analyzes ROADMAP and spawns parallel workers.

## Usage

```
/implement
```

## Behavior

1. **Analyze ROADMAP**: Read `spec/tasks/ROADMAP.md` and identify ready tasks
2. **Identify parallelizable tasks**: Group tasks that can be worked on simultaneously
3. **Spawn workers**: Use `./scripts/spawn-worker.sh` (max 4 worker panes)
4. **Start orchestration**: `./scripts/orchestrate.sh --background`
5. **Monitor progress**: Read events from `/tmp/claude-orchestrator/events/`
6. **Report**: Summarize findings to user, handle review feedback
7. **Merge**: Only with explicit user approval

## Critical Rules

- **NEVER write code directly** — delegate everything to sub-agents
- **NEVER run tests directly** — workers do this
- **NEVER review PRs directly** — spawn reviewer agents
- **NEVER investigate issues directly** — spawn research agents
- Max 4 worker panes + 1 main pane = 5 total
- Report all review findings to user
- Merges require explicit user approval
