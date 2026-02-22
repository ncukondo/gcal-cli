#!/bin/bash
# Launch a Claude agent in a tmux pane
# Usage: ./scripts/launch-agent.sh <working-dir> <prompt>

set -euo pipefail

working_dir="${1:?Usage: launch-agent.sh <working-dir> <prompt>}"
prompt="${2:?Usage: launch-agent.sh <working-dir> <prompt>}"

# Enforce max panes (5 total: 1 main + 4 workers)
pane_count=$(tmux list-panes -t main 2>/dev/null | wc -l)
if [ "$pane_count" -ge 5 ]; then
  echo "ERROR: Max panes reached (5). Kill an agent first."
  exit 1
fi

# Generate worker ID
worker_id="worker-$(date +%s)-$$"

# Write settings.local.json with permissions
cat > "${working_dir}/.claude/settings.local.json" 2>/dev/null <<EOF || true
{
  "permissions": {
    "allow": [
      "Bash(bun:*)",
      "Bash(bunx:*)",
      "Bash(git:*)",
      "Bash(gh:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(cat:*)",
      "Bash(echo:*)"
    ]
  }
}
EOF

# Split pane and launch
tmux split-window -t main -h -c "$working_dir"
new_pane=$(tmux list-panes -t main -F '#{pane_id}' | tail -1)

# Wait for shell to be ready
sleep 2

# Launch claude with worker ID
tmux send-keys -t "$new_pane" "CLAUDE_WORKER_ID=$worker_id claude" && sleep 1 && tmux send-keys -t "$new_pane" Enter

# Wait for Claude to start (handle trust prompts)
echo "Waiting for Claude to start..."
for i in $(seq 1 90); do
  sleep 1
  output=$(tmux capture-pane -t "$new_pane" -p 2>/dev/null || true)
  if echo "$output" | grep -qE '(>|❯|claude)'; then
    break
  fi
  if echo "$output" | grep -qi 'trust'; then
    tmux send-keys -t "$new_pane" "y" && sleep 1 && tmux send-keys -t "$new_pane" Enter
  fi
done

# Send the prompt
sleep 1
tmux send-keys -t "$new_pane" "$prompt" && sleep 1 && tmux send-keys -t "$new_pane" Enter

echo "Agent launched in pane $new_pane with worker ID $worker_id"
