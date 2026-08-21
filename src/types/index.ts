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

export type AttendeeResponseStatus = "needsAction" | "declined" | "tentative" | "accepted";

export interface EventAttendee {
  email: string;
  display_name: string | null;
  response_status: AttendeeResponseStatus;
  optional: boolean;
  organizer: boolean;
  self: boolean;
}

/**
 * A calendar can be configured to host conferences other than Google Meet --
 * classic Hangouts, or a third-party add-on such as Zoom. `type` carries the
 * solution Google actually allocated (`hangoutsMeet` is the Meet one, and only
 * that one fills `meet_link`); it is null when the response omits the solution.
 */
export interface EventConference {
  type: string | null;
  uri: string | null;
}

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
  attendees: EventAttendee[];
  /** Google Meet video URL, or null when the event has no Meet conference. */
  meet_link: string | null;
  /** Whatever conference is attached, Meet or not. See EventConference. */
  conference: EventConference | null;
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
  | "FORBIDDEN"
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
