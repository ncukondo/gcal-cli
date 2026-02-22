# /pr-comments

Respond to PR comments and review feedback.

## Usage

```
/pr-comments <pr-number>
```

## Steps

1. **Fetch comments**: `gh api repos/{owner}/{repo}/pulls/<number>/comments`
2. **Categorize**:
   - **Critical**: Must fix before merge
   - **Suggestions**: Nice to have improvements
   - **Questions**: Need clarification
3. **Make fixes**: Address critical issues and reasonable suggestions
4. **Reply to comments**: `gh api` to post replies
5. **Push changes**: Commit and push fixes
6. **Request re-review**: Optionally request re-review from reviewer
