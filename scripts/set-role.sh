#!/bin/bash
# Set agent role in a worktree's CLAUDE.md
# Usage: ./scripts/set-role.sh <worktree-path> <role>

set -euo pipefail

worktree_path="${1:?Usage: set-role.sh <worktree-path> <role>}"
role="${2:?Usage: set-role.sh <worktree-path> <role>}"

claude_md="${worktree_path}/CLAUDE.md"

if [ ! -f "$claude_md" ]; then
  echo "ERROR: CLAUDE.md not found at $claude_md"
  exit 1
fi

# Replace or append role marker
if grep -q '<!-- role:' "$claude_md"; then
  sed -i "s/<!-- role: .* -->/<!-- role: $role -->/" "$claude_md"
else
  echo "" >> "$claude_md"
  echo "<!-- role: $role -->" >> "$claude_md"
fi

echo "Role set to '$role' in $claude_md"
