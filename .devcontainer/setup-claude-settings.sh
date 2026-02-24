#!/bin/bash
# Ensure Claude Code global settings include statusLine configuration
SETTINGS_FILE="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude"

if [ -f "$SETTINGS_FILE" ]; then
  # Merge statusLine into existing settings
  jq '. + {"statusLine": {"type": "command", "command": "~/.claude/statusline.sh"}}' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && \
    mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
else
  # Create new settings with statusLine
  cat > "$SETTINGS_FILE" <<'EOF'
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}
EOF
fi
