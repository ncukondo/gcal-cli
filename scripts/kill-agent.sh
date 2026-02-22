#!/bin/bash
# Gracefully terminate an agent in a tmux pane
# Usage: ./scripts/kill-agent.sh <pane-id> [--keep-pane]

set -euo pipefail

pane_id="${1:?Usage: kill-agent.sh <pane-id> [--keep-pane]}"
keep_pane="${2:-}"

# Send Ctrl+C
tmux send-keys -t "$pane_id" C-c
sleep 1

# Send Escape
tmux send-keys -t "$pane_id" Escape
sleep 1

# Send /exit
tmux send-keys -t "$pane_id" "/exit" && sleep 1 && tmux send-keys -t "$pane_id" Enter
sleep 2

# Confirm exit
tmux send-keys -t "$pane_id" "y" && sleep 1 && tmux send-keys -t "$pane_id" Enter
sleep 2

# Verify exit
output=$(tmux capture-pane -t "$pane_id" -p 2>/dev/null || true)
if echo "$output" | grep -qE '(\$|❯|%)'; then
  echo "Agent exited successfully"
else
  echo "Agent may still be running, sending SIGTERM..."
  # Get child processes and terminate
  pane_pid=$(tmux display-message -t "$pane_id" -p '#{pane_pid}')
  if [ -n "$pane_pid" ]; then
    pkill -TERM -P "$pane_pid" 2>/dev/null || true
  fi
fi

# Kill pane unless --keep-pane
if [ "$keep_pane" != "--keep-pane" ]; then
  tmux kill-pane -t "$pane_id" 2>/dev/null || true
  echo "Pane $pane_id killed"
fi
