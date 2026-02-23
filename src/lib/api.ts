import type { Calendar, CalendarEvent, ErrorCode, EventStatus, Transparency } from "../types/index.ts";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Abstraction over the Google Calendar API client for testability
export interface GoogleCalendarApi {
  calendarList: {
    list: (params?: { pageToken?: string }) => Promise<{
      data: { items?: GoogleCalendar[]; nextPageToken?: string };
    }>;
  };
  events: {
    list: (params: {
      calendarId: string;
      pageToken?: string;
      timeMin?: string;
      timeMax?: string;
      q?: string;
      singleEvents?: boolean;
      orderBy?: string;
    }) => Promise<{
      data: { items?: GoogleEvent[]; nextPageToken?: string };
    }>;
    get: (params: {
      calendarId: string;
      eventId: string;
    }) => Promise<{ data: GoogleEvent }>;
  };
}

// Google API response types (partial, only fields we use)
export interface GoogleEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null;
  htmlLink?: string | null;
  status?: string | null;
  transparency?: string | null;
  created?: string | null;
  updated?: string | null;
}

export interface GoogleCalendar {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  primary?: boolean | null;
}

export function normalizeEvent(
  event: GoogleEvent,
  calendarId: string,
  calendarName: string,
): CalendarEvent {
  const allDay = Boolean(event.start?.date);
  const start = allDay ? (event.start?.date ?? "") : (event.start?.dateTime ?? "");
  const end = allDay ? (event.end?.date ?? "") : (event.end?.dateTime ?? "");

  return {
    id: event.id ?? "",
    title: event.summary ?? "",
    description: event.description ?? null,
    start,
    end,
    all_day: allDay,
    calendar_id: calendarId,
    calendar_name: calendarName,
    html_link: event.htmlLink ?? "",
    status: (event.status as EventStatus) ?? "confirmed",
    transparency: (event.transparency as Transparency) ?? "opaque",
    created: event.created ?? "",
    updated: event.updated ?? "",
  };
}

export function normalizeCalendar(calendar: GoogleCalendar): Calendar {
  return {
    id: calendar.id ?? "",
    name: calendar.summary ?? "",
    description: calendar.description ?? null,
    primary: calendar.primary ?? false,
    enabled: true,
  };
}

export async function listCalendars(api: GoogleCalendarApi): Promise<Calendar[]> {
  const calendars: Calendar[] = [];
  let pageToken: string | undefined;

  do {
    const response = await api.calendarList.list(
      pageToken ? { pageToken } : undefined,
    );
    const items = response.data.items ?? [];
    for (const item of items) {
      calendars.push(normalizeCalendar(item));
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return calendars;
}

export interface ListEventsOptions {
  timeMin?: string;
  timeMax?: string;
  q?: string;
}

export async function listEvents(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  options?: ListEventsOptions,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params: {
      calendarId: string;
      pageToken?: string;
      timeMin?: string;
      timeMax?: string;
      q?: string;
      singleEvents: boolean;
      orderBy: string;
    } = {
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      ...options,
    };
    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await api.events.list(params);
    const items = response.data.items ?? [];
    for (const item of items) {
      events.push(normalizeEvent(item, calendarId, calendarName));
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return events;
}

export async function getEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  eventId: string,
): Promise<CalendarEvent> {
  try {
    const response = await api.events.get({ calendarId, eventId });
    return normalizeEvent(response.data, calendarId, calendarName);
  } catch (error: unknown) {
    if (isGoogleApiError(error) && error.code === 404) {
      throw new ApiError("NOT_FOUND", `Event not found: ${eventId}`);
    }
    throw error;
  }
}

function isGoogleApiError(error: unknown): error is Error & { code: number } {
  return error instanceof Error && "code" in error && typeof (error as { code: unknown }).code === "number";
}
