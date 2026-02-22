# /review

Batch review: spawn reviewer agents for all open PRs.

## Usage

```
/review
```

## Steps

1. **List open PRs**: `gh pr list --state open`
2. **Spawn reviewers**: Use `./scripts/spawn-reviewer.sh` for each PR (max 4 panes)
3. **Apply layout**: `./scripts/apply-layout.sh`
4. **Start orchestration**: `./scripts/orchestrate.sh --background`
5. **Monitor**: Wait for reviewers to complete and report results
