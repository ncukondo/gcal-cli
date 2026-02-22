# /fix-reviews

Detect PRs with requested changes and spawn fixer agents.

## Usage

```
/fix-reviews
```

## Steps

1. **Find PRs with changes requested**: Check all open PRs for `CHANGES_REQUESTED` review decision
2. **Fetch review comments**: Get specific feedback for each PR
3. **Spawn fixer agents**: Use `./scripts/spawn-worker.sh` (max 4 panes)
4. **Monitor**: Track progress via orchestration events

## Rules

- Max 4 fixer agents running simultaneously
- Each agent works in the PR's existing worktree
- Agent reads review comments and makes targeted fixes
