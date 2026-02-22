#!/bin/bash
# Apply main-vertical tmux layout
# Main pane ~45% on left, worker panes stacked on right

tmux select-layout -t main main-vertical 2>/dev/null || {
  echo "Failed to apply layout. Is tmux session 'main' running?"
  exit 1
}

echo "Layout applied: main-vertical"
