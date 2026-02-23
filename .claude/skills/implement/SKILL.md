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
6. **Review**: When worker completes and creates PR:
   a. Kill the completed worker (`kill-agent.sh`)
   b. Spawn reviewer (`spawn-reviewer.sh <pr-number>`)
   c. Wait for review to complete, then kill reviewer
   d. Report ALL findings (critical + minor) to user with summary table
7. **Fix reviews**: When user approves fixes:
   a. Set worktree role back to implement (`set-role.sh <worktree> implement`)
   b. Launch fix agent with detailed fix list (`launch-agent.sh <worktree> <prompt>`)
   c. Wait for completion, then kill fix agent
8. **Merge**: Only with explicit user approval
9. **Cleanup after merge**: Update ROADMAP, move task to completed, remove worktree, stop orchestrator

## Critical Rules

- **NEVER write code directly** — delegate everything to sub-agents
- **NEVER run tests directly** — workers do this
- **NEVER review PRs directly** — spawn reviewer agents
- **NEVER investigate issues directly** — spawn research agents
- **NEVER reuse an idle worker pane** — always kill and spawn fresh
- Max 4 worker panes + 1 main pane = 5 total
- Report all review findings to user
- Merges require explicit user approval
