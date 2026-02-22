#!/bin/bash
# Block git push --force and variants
# Exit code 2 = block the tool call

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

if [ -z "$command" ]; then
  exit 0
fi

if echo "$command" | grep -qE 'git\s+push\s+.*(-f|--force|--force-with-lease|--force-if-includes)'; then
  echo "BLOCKED: Force push is not allowed. Use regular push instead."
  exit 2
fi

exit 0
