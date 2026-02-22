# /status

Show project health and progress.

## Usage

```
/status
```

## Output

1. **ROADMAP progress**: Task completion status from `spec/tasks/ROADMAP.md`
2. **Tests**: Run `bun run test:all` and report pass/fail
3. **Lint**: Run `bun run lint` and report
4. **Git status**: Uncommitted changes, current branch
5. **Worktrees**: List active worktrees (`git worktree list`)
6. **Active agents**: Check tmux panes for running agents
7. **Open PRs**: `gh pr list --state open`
