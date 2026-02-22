#!/bin/bash
# Merge a PR with full cleanup
# Usage: ./scripts/merge-pr.sh <pr-number> [--squash|--merge|--rebase] [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

pr_number="${1:?Usage: merge-pr.sh <pr-number> [--squash|--merge|--rebase] [--dry-run]}"
shift

merge_method="--squash"
dry_run=false

for arg in "$@"; do
  case "$arg" in
    --squash|--merge|--rebase) merge_method="$arg" ;;
    --dry-run) dry_run=true ;;
  esac
done

cd "$PROJECT_DIR"

# Get PR info
branch=$(gh pr view "$pr_number" --json headRefName --jq '.headRefName')
echo "PR #${pr_number} branch: $branch"

if $dry_run; then
  echo "[DRY RUN] Would merge PR #${pr_number} (${merge_method})"
  echo "[DRY RUN] Would clean up worktree and branch"
  exit 0
fi

# Wait for CI (up to 10 minutes)
echo "Waiting for CI..."
for i in $(seq 1 60); do
  ci_status=$("$SCRIPT_DIR/check-task-completion.sh" pr-creation "$pr_number" 2>/dev/null || echo "pending")
  case "$ci_status" in
    completed) echo "CI passed"; break ;;
    failed) echo "ERROR: CI failed"; exit 1 ;;
    *) sleep 10 ;;
  esac
done

# Merge
echo "Merging PR #${pr_number} (${merge_method})..."
gh pr merge "$pr_number" "$merge_method" --delete-branch

# Switch to main if in worktree
git checkout main 2>/dev/null || true
git pull origin main

# Find and clean up worktree
for wt in "$WORKTREE_BASE"/*; do
  [ -d "$wt" ] || continue
  wt_branch=$(cd "$wt" && git branch --show-current 2>/dev/null || true)
  if [ "$wt_branch" = "$branch" ]; then
    echo "Cleaning up worktree: $wt"

    # Kill agent if running
    for pane_id in $(tmux list-panes -t main -F '#{pane_id}' 2>/dev/null); do
      pane_dir=$(tmux display-message -t "$pane_id" -p '#{pane_current_path}' 2>/dev/null || true)
      if [ "$pane_dir" = "$wt" ]; then
        "$SCRIPT_DIR/kill-agent.sh" "$pane_id" 2>/dev/null || true
      fi
    done

    git worktree remove "$wt" --force 2>/dev/null || true
  fi
done

# Prune worktrees
git worktree prune

# Delete local branch
git branch -d "$branch" 2>/dev/null || true

# Move task file to completed
for task_file in spec/tasks/*.md; do
  [ -f "$task_file" ] || continue
  [[ "$task_file" == *"ROADMAP"* ]] && continue
  [[ "$task_file" == *"_template"* ]] && continue
  if grep -q "$branch" "$task_file" 2>/dev/null; then
    mv "$task_file" spec/tasks/completed/
    echo "Moved $task_file to completed/"
  fi
done

echo "PR #${pr_number} merged and cleaned up successfully"
