#!/bin/bash
# Monitor active agent states
# Usage: ./scripts/monitor-agents.sh [--watch|--json]

STATE_DIR="/tmp/claude-agent-states"

show_status() {
  echo "=== Agent Status ==="
  printf "%-12s %-15s %-10s\n" "PANE" "STATE" "AGE"
  echo "-------------------------------------------"

  if [ -d "$STATE_DIR" ]; then
    for state_file in "$STATE_DIR"/*; do
      [ -f "$state_file" ] || continue
      pane_id=$(basename "$state_file")

      # Check if pane still exists
      SESSION_NAME="${TMUX_SESSION:-main}"
      PANE_EXISTS=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' 2>/dev/null | grep -Fx "$pane_id" || true)
      if [ -z "$PANE_EXISTS" ]; then
        rm -f "$state_file"
        continue
      fi

      state=$(cat "$state_file" 2>/dev/null || echo "unknown")
      age=$(( $(date +%s) - $(stat -c %Y "$state_file" 2>/dev/null || echo "0") ))
      printf "%-12s %-15s %-10s\n" "$pane_id" "$state" "${age}s"
    done
  fi

  # Also check tmux panes
  echo ""
  echo "=== tmux Panes ==="
  tmux list-panes -t main -F '#{pane_id} #{pane_current_command} #{pane_width}x#{pane_height}' 2>/dev/null || echo "No tmux session 'main'"
}

case "${1:-}" in
  --watch)
    while true; do
      clear
      show_status
      sleep 5
    done
    ;;
  --json)
    echo "{"
    if [ -d "$STATE_DIR" ]; then
      first=true
      for state_file in "$STATE_DIR"/*; do
        [ -f "$state_file" ] || continue
        pane_id=$(basename "$state_file")
        state=$(cat "$state_file" 2>/dev/null || echo "unknown")
        if [ "$first" = true ]; then first=false; else echo ","; fi
        printf '  "%s": "%s"' "$pane_id" "$state"
      done
    fi
    echo ""
    echo "}"
    ;;
  *)
    show_status
    ;;
esac
