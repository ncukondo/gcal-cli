export type OutputFormat = "text" | "json";

export interface CalendarConfig {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AppConfig {
  timezone?: string;
  default_format: OutputFormat;
  calendars: CalendarConfig[];
  task_lists: TaskListConfig[];
}

export type TaskStatus = "needsAction" | "completed";

export interface TaskList {
  id: string;
  title: string;
  updated: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  due: string | null;
  completed: string | null;
  list_id: string;
  list_title: string;
  parent: string | null;
  updated: string;
}

export interface TaskListConfig {
  id: string;
  name: string;
  enabled: boolean;
}

export type EventStatus = "confirmed" | "tentative" | "cancelled";

export type Transparency = "opaque" | "transparent";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  all_day: boolean;
  calendar_id: string;
  calendar_name: string;
  html_link: string;
  status: EventStatus;
  transparency: Transparency;
  created: string;
  updated: string;
}

export interface Calendar {
  id: string;
  name: string;
  description: string | null;
  primary: boolean;
  enabled: boolean;
}

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "NOT_FOUND"
  | "INVALID_ARGS"
  | "API_ERROR"
  | "CONFIG_ERROR";

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

export interface CommandResult {
  exitCode: number;
}

export const ExitCode = {
  SUCCESS: 0,
  GENERAL: 1,
  AUTH: 2,
  ARGUMENT: 3,
} as const;
