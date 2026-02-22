#!/bin/bash
# Spawn a generic Claude agent
# Usage: ./scripts/spawn-agent.sh [options] [-- <prompt>]
# Options:
#   --pr <number>   Work on a specific PR
#   --create        Create a new worktree
#   --role <role>   Set agent role (implement/review)
#   --main          Use main repo (no worktree)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="/workspaces/gcal-cli--worktrees"

pr_number=""
create_worktree=false
role=""
use_main=false
prompt=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr) pr_number="$2"; shift 2 ;;
    --create) create_worktree=true; shift ;;
    --role) role="$2"; shift 2 ;;
    --main) use_main=true; shift ;;
    --) shift; prompt="$*"; break ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

working_dir="$PROJECT_DIR"

if [ -n "$pr_number" ]; then
  branch=$(gh pr view "$pr_number" --json headRefName --jq '.headRefName')
  working_dir="${WORKTREE_BASE}/pr-${pr_number}"
  mkdir -p "$WORKTREE_BASE"
  git -C "$PROJECT_DIR" worktree add "$working_dir" "$branch" 2>/dev/null || true
elif $create_worktree && ! $use_main; then
  name="agent-$(date +%s)"
  working_dir="${WORKTREE_BASE}/${name}"
  mkdir -p "$WORKTREE_BASE"
  git -C "$PROJECT_DIR" worktree add "$working_dir" -b "$name" 2>/dev/null || true
fi

if [ -n "$role" ]; then
  "$SCRIPT_DIR/set-role.sh" "$working_dir" "$role"
fi

"$SCRIPT_DIR/launch-agent.sh" "$working_dir" "${prompt:-}"
