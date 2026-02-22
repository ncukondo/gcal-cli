#!/bin/bash
# Spawn a worker agent in a new worktree
# Usage: ./scripts/spawn-worker.sh <task-keyword>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

task_keyword="${1:?Usage: spawn-worker.sh <task-keyword>}"
branch_name="task/${task_keyword}"
worktree_path="${WORKTREE_BASE}/${task_keyword}"

# Create worktree directory if needed
mkdir -p "$WORKTREE_BASE"

# Create worktree
cd "$PROJECT_DIR"
git worktree add "$worktree_path" -b "$branch_name" 2>/dev/null || {
  echo "Worktree already exists or branch conflict. Trying without -b..."
  git worktree add "$worktree_path" "$branch_name" 2>/dev/null || {
    echo "Using existing worktree at $worktree_path"
  }
}

# Set role
"$SCRIPT_DIR/set-role.sh" "$worktree_path" implement

# Launch agent
"$SCRIPT_DIR/launch-agent.sh" "$worktree_path" "/code-with-task $task_keyword"
