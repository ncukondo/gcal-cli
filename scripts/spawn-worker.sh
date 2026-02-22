#!/usr/bin/env bash
set -euo pipefail

# Spawn a worker agent for a task in a new worktree.
#
# Usage: spawn-worker.sh <task-keyword>
# Example: spawn-worker.sh 001-types
#
# What it does:
#   1. Creates worktree (if it doesn't exist)
#   2. Sets role marker in CLAUDE.md
#   3. Delegates to launch-agent.sh for pane + Claude setup

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

task_keyword="${1:?Usage: spawn-worker.sh <task-keyword>}"
branch_name="task/${task_keyword}"
worktree_path="${WORKTREE_BASE}/${task_keyword}"

# --- 1. Create worktree ---
cd "$PROJECT_DIR"
if [ -d "$worktree_path" ]; then
  echo "[spawn-worker] Worktree already exists: $worktree_path"
else
  echo "[spawn-worker] Creating worktree..."
  mkdir -p "$WORKTREE_BASE"
  git worktree add "$worktree_path" -b "$branch_name"
  (cd "$worktree_path" && bun install)
fi

# --- 2. Set role marker in CLAUDE.md ---
echo "[spawn-worker] Setting role to 'implement' in CLAUDE.md..."
"$SCRIPT_DIR/set-role.sh" "$worktree_path" implement

# --- 3. Delegate to launch-agent.sh ---
export LAUNCH_AGENT_LABEL="spawn-worker"
exec "$SCRIPT_DIR/launch-agent.sh" "$worktree_path" "/code-with-task $task_keyword"
