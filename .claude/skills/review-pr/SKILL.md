# /review-pr

Review a GitHub pull request.

## Usage

```
/review-pr <pr-number>
```

## Steps

1. **Wait for CI**: Check CI status, wait up to 5 minutes if pending
2. **Read PR diff**: `gh pr diff <number>`
3. **Check task requirements**: Find related task file from PR description
4. **Run locally**: In a worktree, run `bun run test:all && bun run lint`
5. **Post review**: `gh pr review <number>` with structured feedback

## Review Format

```
## Summary
<1-2 sentence overview>

## Findings

### Critical
- [ ] Issue description (file:line)

### Minor
- [ ] Suggestion (file:line)

## Verdict
APPROVE / REQUEST_CHANGES / COMMENT
```

## Rules

- Report ALL findings, including minor issues
- Do NOT merge or make code changes
- Do NOT skip findings to be "nice"
- Exit after posting review
