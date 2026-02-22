#!/bin/bash
# Validate git worktree paths to ensure they go to the correct location
# Exit code 2 = block the tool call

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if [ -z "$command" ]; then
  exit 0
fi

# Only check git worktree add commands
if ! echo "$command" | grep -qE 'git\s+worktree\s+add'; then
  exit 0
fi

# Parse the worktree path (skip flags like -b, --force, etc.)
worktree_path=""
skip_next=false
for arg in $command; do
  if $skip_next; then
    skip_next=false
    continue
  fi
  case "$arg" in
    git|worktree|add) continue ;;
    -b|-B) skip_next=true; continue ;;
    --force|--detach|--checkout|--no-checkout|--lock|--quiet) continue ;;
    --*=*) continue ;;
    -*)
      if [ ${#arg} -eq 2 ]; then
        skip_next=true
      fi
      continue
      ;;
    *)
      if [ -z "$worktree_path" ]; then
        worktree_path="$arg"
      fi
      ;;
  esac
done

if [ -z "$worktree_path" ]; then
  exit 0
fi

# Resolve to absolute path
if [[ "$worktree_path" != /* ]]; then
  worktree_path="$(cd "$(dirname "$worktree_path")" 2>/dev/null && pwd)/$(basename "$worktree_path")"
fi

# Validate path is under gcal-cli--worktrees/
if ! echo "$worktree_path" | grep -q 'gcal-cli--worktrees/'; then
  echo "BLOCKED: Worktree path must be under gcal-cli--worktrees/ directory."
  echo "Got: $worktree_path"
  exit 2
fi

exit 0
