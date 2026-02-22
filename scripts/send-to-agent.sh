#!/bin/bash
# Send a prompt to an idle agent
# Usage: ./scripts/send-to-agent.sh <pane-id> <prompt>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

pane_id="${1:?Usage: send-to-agent.sh <pane-id> <prompt>}"
prompt="${2:?Usage: send-to-agent.sh <pane-id> <prompt>}"

# Validate agent state
state=$("$SCRIPT_DIR/check-agent-state.sh" "$pane_id")
case "$state" in
  idle|starting)
    ;;
  *)
    echo "ERROR: Agent in pane $pane_id is '$state', not idle/starting"
    exit 1
    ;;
esac

# Send text and Enter separately with sleep
tmux send-keys -t "$pane_id" "$prompt" && sleep 1 && tmux send-keys -t "$pane_id" Enter

echo "Prompt sent to pane $pane_id"
