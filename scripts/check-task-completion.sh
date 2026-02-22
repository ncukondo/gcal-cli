#!/bin/bash
# Check task completion status via GitHub API
# Usage: ./scripts/check-task-completion.sh <mode> <pr-number>
# Modes: pr-creation, review

mode="${1:?Usage: check-task-completion.sh <mode> <pr-number>}"
pr_number="${2:?Usage: check-task-completion.sh <mode> <pr-number>}"

case "$mode" in
  pr-creation)
    # Check CI status
    status=$(gh pr checks "$pr_number" --json 'state' --jq '.[].state' 2>/dev/null | sort -u)
    if echo "$status" | grep -qi 'failure'; then
      echo "failed"
    elif echo "$status" | grep -qi 'pending'; then
      echo "pending"
    else
      echo "completed"
    fi
    ;;
  review)
    # Check latest review state
    review=$(gh pr view "$pr_number" --json reviewDecision --jq '.reviewDecision' 2>/dev/null)
    case "$review" in
      APPROVED) echo "approved" ;;
      CHANGES_REQUESTED) echo "changes_requested" ;;
      REVIEW_REQUIRED) echo "pending" ;;
      *) echo "commented" ;;
    esac
    ;;
  *)
    echo "Unknown mode: $mode"
    exit 1
    ;;
esac
