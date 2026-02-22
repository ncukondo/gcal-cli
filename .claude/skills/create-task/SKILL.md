# /create-task

Create a new task file from template.

## Usage

```
/create-task <task-name>
```

## Steps

1. **Determine number**: Check `spec/tasks/` for existing files, pick next number
2. **Create file**: `spec/tasks/YYYYMMDD-NN-<task-name>.md`
3. **Fill template**:
   - Purpose
   - Context (relevant files, dependencies)
   - Implementation Steps (with checkboxes)
   - E2E Test specification
   - Acceptance Criteria
4. **Update ROADMAP**: Add task to `spec/tasks/ROADMAP.md`

## Template

```markdown
# Task: <title>

## Purpose
<what and why>

## Context
- Related files: ...
- Dependencies: ...

## Implementation Steps
- [ ] Step 1
- [ ] Step 2
- [ ] ...

## E2E Test
- [ ] Test scenario description

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```
