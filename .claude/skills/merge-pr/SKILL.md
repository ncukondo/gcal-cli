# /merge-pr

Merge a pull request with full cleanup.

## Usage

```
/merge-pr <pr-number> [--squash|--merge|--rebase] [--dry-run]
```

## Steps

1. **Fetch PR info**: `gh pr view <number>`
2. **Wait for CI**: Wait up to 10 minutes for CI to pass
3. **Merge**: `./scripts/merge-pr.sh <number>` (default: squash)
4. **Cleanup**:
   - Kill agents in worktree
   - Remove worktree
   - Delete local + remote branch
   - Move task file to `spec/tasks/completed/`
5. **Pull main**: Update local main branch

## Options

- `--squash` (default): Squash and merge
- `--merge`: Create merge commit
- `--rebase`: Rebase and merge
- `--dry-run`: Show what would happen without doing it
