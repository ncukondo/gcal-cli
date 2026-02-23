#!/usr/bin/env bash
set -euo pipefail

# Spawn a reviewer agent for a PR.
#
# Usage:
#   spawn-reviewer.sh <pr-number>
#   spawn-reviewer.sh --pr <pr-number>
#
# What it does:
#   1. Locates or creates the worktree (reuses worker's worktree)
#   2. Sets role marker to 'review' in CLAUDE.md
#   3. Delegates to launch-agent.sh with /review-pr prompt

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

PR_NUMBER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      PR_NUMBER="$2"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [ -z "$PR_NUMBER" ]; then
        PR_NUMBER="$1"
      else
        echo "Too many arguments" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: spawn-reviewer.sh <pr-number>" >&2
  exit 1
fi

# Get PR branch
cd "$PROJECT_DIR"
echo "[spawn-reviewer] Fetching branch name from PR #$PR_NUMBER..."
BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName --jq '.headRefName' 2>/dev/null) || {
  echo "[spawn-reviewer] ERROR: Could not get branch name for PR #$PR_NUMBER" >&2
  exit 1
}

echo "[spawn-reviewer] Branch: $BRANCH"
echo "[spawn-reviewer] PR: #$PR_NUMBER"

# Derive worktree path from branch name (reuse worker's worktree)
BRANCH_DIR=$(echo "$BRANCH" | sed 's|^task/||' | tr '/' '-')
WORKTREE_DIR="$WORKTREE_BASE/$BRANCH_DIR"

# --- 0. Duplicate reviewer check ---
if [ -d "$WORKTREE_DIR" ]; then
  CLAUDE_MD="$WORKTREE_DIR/CLAUDE.md"
  if [ -f "$CLAUDE_MD" ] && grep -q '<!-- role: review -->' "$CLAUDE_MD" 2>/dev/null; then
    SESSION_NAME="${TMUX_SESSION:-main}"
    EXISTING_PANE=$(tmux list-panes -t "$SESSION_NAME" -F "#{pane_id} #{pane_current_path}" 2>/dev/null | \
      grep " ${WORKTREE_DIR}$" | head -1 | cut -d' ' -f1 || true)
    PANE_EXISTS=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' 2>/dev/null | grep -Fx "$EXISTING_PANE" || true)
    if [ -n "$EXISTING_PANE" ] && [ -n "$PANE_EXISTS" ]; then
      echo "[spawn-reviewer] WARNING: Review agent already running for branch $BRANCH in pane $EXISTING_PANE. Skipping."
      exit 0
    fi
  fi
fi

# --- 1. Check/create worktree ---
if [ -d "$WORKTREE_DIR" ]; then
  echo "[spawn-reviewer] Using existing worktree: $WORKTREE_DIR"
else
  echo "[spawn-reviewer] Creating worktree: $WORKTREE_DIR"
  mkdir -p "$WORKTREE_BASE"

  git fetch origin "$BRANCH" 2>/dev/null || true

  if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" 2>/dev/null; then
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  else
    echo "[spawn-reviewer] ERROR: Branch '$BRANCH' not found locally or remotely" >&2
    exit 1
  fi

  (cd "$WORKTREE_DIR" && bun install)
fi

# --- 2. Set role marker in CLAUDE.md ---
echo "[spawn-reviewer] Setting role to 'review' in CLAUDE.md..."
"$SCRIPT_DIR/set-role.sh" "$WORKTREE_DIR" review

# --- 3. Delegate to launch-agent.sh ---
export LAUNCH_AGENT_LABEL="spawn-reviewer"
exec "$SCRIPT_DIR/launch-agent.sh" "$WORKTREE_DIR" "/review-pr $PR_NUMBER"
