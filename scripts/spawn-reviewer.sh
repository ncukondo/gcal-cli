#!/bin/bash
# Spawn a reviewer agent for a PR
# Usage: ./scripts/spawn-reviewer.sh <pr-number>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

pr_number="${1:?Usage: spawn-reviewer.sh <pr-number>}"

# Get PR branch
cd "$PROJECT_DIR"
branch=$(gh pr view "$pr_number" --json headRefName --jq '.headRefName')
worktree_path="${WORKTREE_BASE}/review-pr-${pr_number}"

# Check for duplicate reviewers
if tmux list-panes -a -F '#{pane_title}' 2>/dev/null | grep -q "review-${pr_number}"; then
  echo "Reviewer for PR #${pr_number} already running"
  exit 1
fi

# Create worktree
mkdir -p "$WORKTREE_BASE"
git worktree add "$worktree_path" "$branch" 2>/dev/null || {
  echo "Using existing worktree at $worktree_path"
}

# Set role
"$SCRIPT_DIR/set-role.sh" "$worktree_path" review

# Launch agent
"$SCRIPT_DIR/launch-agent.sh" "$worktree_path" "/review-pr $pr_number"
