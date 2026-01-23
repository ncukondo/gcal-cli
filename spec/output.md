# Output Format Specification

## Text Output (Default)

Human-readable format for terminal use.

### `gcal list` Text Output

```
2026-01-24 (Fri)
  [All Day]     Company Holiday (Main Calendar)
  10:00-11:00   Team Meeting (Main Calendar) [busy]
  14:00-15:00   Focus Time (Work Calendar) [free]

2026-01-25 (Sat)
  [All Day]     Vacation (Main Calendar)
```

### `gcal search` Text Output

```
Found 3 events matching "meeting":

2026-01-24 10:00-11:00  Team Meeting (Main Calendar) [busy]
2026-01-28 09:00-10:00  Project Meeting (Main Calendar) [busy]
2026-02-01 14:00-15:00  Review Meeting (Work Calendar) [busy]
```

### `gcal calendars` Text Output

```
Calendars:
  [x] primary           Main Calendar
  [x] family@group...   Family
  [ ] work@group...     Work Main (disabled)
```

## JSON Output

Use `-f json` for machine-readable output.

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Not authenticated |
| `AUTH_EXPIRED` | Token expired, re-auth needed |
| `NOT_FOUND` | Event or calendar not found |
| `INVALID_ARGS` | Invalid command arguments |
| `API_ERROR` | Google API error |
| `CONFIG_ERROR` | Configuration file error |

## Data Structures

### Event

All datetime fields include timezone offset (ISO 8601).

```json
{
  "id": "string",
  "title": "string",
  "start": "ISO8601 datetime with offset",
  "end": "ISO8601 datetime with offset",
  "all_day": "boolean",
  "status": "confirmed | tentative | cancelled",
  "transparency": "opaque | transparent",
  "description": "string | null",
  "calendar_id": "string",
  "calendar_name": "string",
  "html_link": "string",
  "created": "ISO8601 datetime",
  "updated": "ISO8601 datetime"
}
```

### Calendar

```json
{
  "id": "string",
  "name": "string",
  "description": "string | null",
  "primary": "boolean",
  "enabled": "boolean"
}
```

## Command Output Examples

### `gcal list -f json`

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "abc123",
        "title": "Company Holiday",
        "start": "2026-01-24",
        "end": "2026-01-25",
        "all_day": true,
        "status": "confirmed",
        "transparency": "opaque",
        "description": null,
        "calendar_id": "primary",
        "calendar_name": "Main Calendar"
      },
      {
        "id": "def456",
        "title": "Team Meeting",
        "start": "2026-01-24T10:00:00+09:00",
        "end": "2026-01-24T11:00:00+09:00",
        "all_day": false,
        "status": "confirmed",
        "transparency": "opaque",
        "description": null,
        "calendar_id": "primary",
        "calendar_name": "Main Calendar"
      }
    ],
    "count": 2
  }
}
```

### `gcal search "meeting" -f json`

```json
{
  "success": true,
  "data": {
    "query": "meeting",
    "events": [ ... ],
    "count": 3
  }
}
```

### `gcal add -f json`

```json
{
  "success": true,
  "data": {
    "event": { ... },
    "message": "Event created"
  }
}
```

### `gcal delete -f json`

```json
{
  "success": true,
  "data": {
    "deleted_id": "abc123",
    "message": "Event deleted"
  }
}
```
