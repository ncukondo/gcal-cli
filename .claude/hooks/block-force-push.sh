#!/bin/bash
# Block git push --force and variants
# Exit code 2 = block the tool call

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if [ -z "$command" ]; then
  exit 0
fi

# Match the flags as whole tokens. A bare `-f` substring also occurs inside
# ordinary arguments -- pushing a branch whose name contains `-f` is not a force
# push -- so the flag must start its own token. The first alternative covers
# short-flag clusters, the second the long forms.
if echo "$command" | grep -qE 'git[[:space:]]+push[[:space:]]+([^[:space:]]+[[:space:]]+)*(-[a-zA-Z]*f[a-zA-Z]*|--force(-with-lease|-if-includes)?)([[:space:]=]|$)'; then
  echo "BLOCKED: Force push is not allowed. Use regular push instead."
  exit 2
fi

exit 0
