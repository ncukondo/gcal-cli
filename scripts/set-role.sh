#!/usr/bin/env bash
set -euo pipefail

# Set the agent role marker in a worktree's CLAUDE.md.
#
# Usage: set-role.sh <worktree-dir> <role>
# Example: set-role.sh /path/to/worktree implement

WORKTREE_DIR="${1:?Usage: set-role.sh <worktree-dir> <role>}"
ROLE="${2:?Usage: set-role.sh <worktree-dir> <role>}"
CLAUDE_MD="$WORKTREE_DIR/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  echo "[set-role] ERROR: CLAUDE.md not found at $CLAUDE_MD"
  exit 1
fi

# Remove existing role marker if present
sed -i '/^<!-- role: .* -->$/d' "$CLAUDE_MD"

# Append new role marker
echo "<!-- role: $ROLE -->" >> "$CLAUDE_MD"
echo "[set-role] Set role to '$ROLE' in $CLAUDE_MD"
