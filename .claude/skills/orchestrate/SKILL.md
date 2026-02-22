# /orchestrate

Control the background orchestrator that monitors worker states.

## Usage

```
/orchestrate [--background|--status|--stop]
```

## Modes

- `--background`: Start orchestration in background (default)
- `--status`: Show current orchestrator status
- `--stop`: Stop the orchestrator

## Event Model (Detect + Notify)

The orchestrator monitors agent state changes and writes event files to `/tmp/claude-orchestrator/events/`.

### Event Types

| Event | Meaning |
|-------|---------|
| `worker-completed` | Worker finished its task |
| `ci-failed` | CI check failed for a PR |
| `review-approved` | PR review approved |
| `review-changes-requested` | PR review requested changes |
| `review-commented` | PR review left comments |
| `agent-error` | Agent encountered an error |

The main agent reads events and decides how to respond.
