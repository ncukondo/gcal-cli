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
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId: string;
  status: "confirmed" | "tentative" | "cancelled";
  transparency: "opaque" | "transparent";
}
