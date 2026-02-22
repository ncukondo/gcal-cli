#!/bin/bash
# Check agent state via state file or tmux capture
# Usage: ./scripts/check-agent-state.sh <pane-id>

pane_id="${1:?Usage: check-agent-state.sh <pane-id>}"
STATE_DIR="/tmp/claude-agent-states"

# Method 1: hooks-based state file (priority)
state_file="${STATE_DIR}/${pane_id}"
if [ -f "$state_file" ]; then
  cat "$state_file"
  exit 0
fi

# Method 2: tmux capture-pane fallback
output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null || echo "")

if [ -z "$output" ]; then
  echo "unknown"
  exit 0
fi

# Check for shell prompt (agent exited)
if echo "$output" | tail -3 | grep -qE '(\$\s*$|❯\s*$|%\s*$)'; then
  echo "exited"
  exit 0
fi

# Check for trust prompt
if echo "$output" | grep -qi 'trust'; then
  echo "trust-prompt"
  exit 0
fi

# Check for Claude prompt (idle)
if echo "$output" | tail -3 | grep -qE '(>\s*$|claude)'; then
  echo "idle"
  exit 0
fi

# Check for spinner (working)
if echo "$output" | tail -3 | grep -qE '(⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|\.{3})'; then
  echo "working"
  exit 0
fi

echo "unknown"
