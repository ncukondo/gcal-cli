# /code-with-task

Implement a task from `spec/tasks/` in a git worktree following TDD.

## Usage

```
/code-with-task <task-keyword>
```

## Steps

1. **Find task**: Search `spec/tasks/` for a file matching `<task-keyword>`
2. **Read task**: Parse the task file for requirements, implementation steps, and acceptance criteria
3. **Create worktree**: `git worktree add /workspaces/gcal-cli--worktrees/<branch-name> -b <branch-name>`
4. **Install deps**: `cd` to worktree and run `bun install`
5. **TDD cycle** (Red-Green-Refactor):
   - Write a failing test first
   - Implement minimal code to pass
   - Refactor while keeping tests green
   - Commit at each step
6. **Verify**: Run `bun run test:all && bun run lint`
7. **Create PR**: `gh pr create` with task context

## Rules

- Follow TDD strictly (Red-Green-Refactor)
- Use `git add <specific-files>` (never `git add -A`)
- Commit frequently with descriptive messages
- Only implement what the task specifies
- Do NOT modify ROADMAP, merge PRs, or move task files
- Work entirely within the worktree
