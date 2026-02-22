# /review-task

Review a task file for completeness and quality.

## Usage

```
/review-task <task-keyword>
```

## Steps

1. **Find task**: Search `spec/tasks/` for matching file
2. **Check completeness**:
   - Purpose is clear
   - Implementation steps are specific and actionable
   - E2E test scenarios are defined
   - Acceptance criteria are measurable
3. **Check test coverage**: Verify tests cover key scenarios
4. **Check code quality**: Review for patterns, consistency

## Output

```
## Review: <task-name>

### Completion
- [x] Purpose defined
- [x] Implementation steps clear
- [ ] Missing E2E test for edge case X

### Verdict
Ready for PR / Needs more work
```
