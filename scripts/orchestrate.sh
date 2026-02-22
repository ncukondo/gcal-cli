#!/bin/bash
# Orchestration loop: monitor agent states and emit events
# Usage: ./scripts/orchestrate.sh [--background|--status|--stop]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVENT_DIR="/tmp/claude-orchestrator/events"
STATE_DIR="/tmp/claude-agent-states"
PID_FILE="/tmp/claude-orchestrator/pid"
INTERVAL=15

mkdir -p "$EVENT_DIR" "$(dirname "$PID_FILE")"

emit_event() {
  local type="$1"
  local data="$2"
  local timestamp=$(date +%s)
  local event_file="${EVENT_DIR}/${timestamp}-${type}.json"
  echo "{\"type\":\"${type}\",\"data\":\"${data}\",\"timestamp\":${timestamp}}" > "$event_file"

  # Notify main pane
  local main_pane=$(tmux list-panes -t main -F '#{pane_id}' 2>/dev/null | head -1)
  if [ -n "$main_pane" ]; then
    tmux display-message -t "$main_pane" "[orchestrator] ${type}: ${data}" 2>/dev/null || true
  fi
}

run_loop() {
  echo $$ > "$PID_FILE"
  declare -A prev_states

  while true; do
    # Scan worktree branches
    cd "$SCRIPT_DIR/.."
    for worktree in $(git worktree list --porcelain 2>/dev/null | grep '^worktree' | awk '{print $2}'); do
      # Skip main worktree
      [[ "$worktree" == *"--worktrees"* ]] || continue

      pane_id=""
      # Find associated tmux pane
      for pid in $(tmux list-panes -t main -F '#{pane_id}' 2>/dev/null); do
        pane_dir=$(tmux display-message -t "$pid" -p '#{pane_current_path}' 2>/dev/null || true)
        if [ "$pane_dir" = "$worktree" ]; then
          pane_id="$pid"
          break
        fi
      done

      [ -n "$pane_id" ] || continue

      # Check agent state
      current_state=$("$SCRIPT_DIR/check-agent-state.sh" "$pane_id" 2>/dev/null || echo "unknown")
      prev_state="${prev_states[$pane_id]:-unknown}"

      if [ "$current_state" != "$prev_state" ]; then
        prev_states[$pane_id]="$current_state"

        case "$current_state" in
          idle|exited)
            emit_event "worker-completed" "$pane_id"
            ;;
          error)
            emit_event "agent-error" "$pane_id"
            ;;
        esac
      fi

      # Check PR status for worktree branch
      branch=$(cd "$worktree" && git branch --show-current 2>/dev/null || true)
      if [ -n "$branch" ]; then
        pr_number=$(gh pr list --head "$branch" --json number --jq '.[0].number' 2>/dev/null || true)
        if [ -n "$pr_number" ]; then
          review_state=$("$SCRIPT_DIR/check-task-completion.sh" review "$pr_number" 2>/dev/null || true)
          case "$review_state" in
            approved) emit_event "review-approved" "PR #${pr_number}" ;;
            changes_requested) emit_event "review-changes-requested" "PR #${pr_number}" ;;
            commented) emit_event "review-commented" "PR #${pr_number}" ;;
          esac

          ci_state=$("$SCRIPT_DIR/check-task-completion.sh" pr-creation "$pr_number" 2>/dev/null || true)
          if [ "$ci_state" = "failed" ]; then
            emit_event "ci-failed" "PR #${pr_number}"
          fi
        fi
      fi
    done

    sleep "$INTERVAL"
  done
}

case "${1:-}" in
  --background)
    run_loop &
    echo "Orchestrator started in background (PID: $!)"
    ;;
  --status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Orchestrator running (PID: $(cat "$PID_FILE"))"
      echo "Events:"
      ls -la "$EVENT_DIR"/ 2>/dev/null || echo "  (none)"
    else
      echo "Orchestrator not running"
    fi
    ;;
  --stop)
    if [ -f "$PID_FILE" ]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo "Orchestrator stopped"
    else
      echo "Orchestrator not running"
    fi
    ;;
  *)
    run_loop
    ;;
esac
