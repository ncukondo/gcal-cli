#!/bin/bash
# Session start hook: block manual Claude launches in worktrees
# Workers must be spawned via spawn-worker.sh which sets CLAUDE_WORKER_ID

current_dir="$(pwd)"

if echo "$current_dir" | grep -q -- '--worktrees'; then
  if [ -z "$CLAUDE_WORKER_ID" ]; then
    echo "ERROR: Manual Claude launch detected in worktree."
    echo "Use ./scripts/spawn-worker.sh to spawn worker agents."
    echo "Or set CLAUDE_WORKER_ID to bypass this check."
    exit 2
  fi
fi

exit 0
