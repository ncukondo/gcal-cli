import * as z from "zod";
import type {
  Calendar,
  CalendarEvent,
  AttendeeResponseStatus,
  ErrorCode,
  EventAttendee,
  Transparency,
} from "../types/index.ts";
import { AuthError } from "./auth.ts";
import { MAX_PAGES, mapApiError } from "./api-utils.ts";

export { MAX_PAGES };

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const EventStatusSchema = z.enum(["confirmed", "tentative", "cancelled"]).catch("confirmed");
const TransparencySchema = z.enum(["opaque", "transparent"]).catch("opaque");
const ResponseStatusSchema = z
  .enum(["needsAction", "declined", "tentative", "accepted"])
  .catch("needsAction");

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
    get: (params: { calendarId: string; eventId: string }) => Promise<{ data: GoogleEvent }>;
    insert: (params: {
      calendarId: string;
      requestBody: GoogleEventWriteBody;
      sendUpdates?: SendUpdates;
    }) => Promise<{ data: GoogleEvent }>;
    patch: (params: {
      calendarId: string;
      eventId: string;
      requestBody: Partial<GoogleEventWriteBody>;
      sendUpdates?: SendUpdates;
    }) => Promise<{ data: GoogleEvent }>;
    delete: (params: {
      calendarId: string;
      eventId: string;
      sendUpdates?: SendUpdates;
    }) => Promise<void>;
  };
}

/**
 * Notification scope for write operations. The Google Calendar API already
 * defaults to not notifying, but we always send this explicitly so the
 * "never notify unless asked" guarantee does not depend on an API default.
 */
export type SendUpdates = "all" | "externalOnly" | "none";

export const DEFAULT_SEND_UPDATES: SendUpdates = "none";

/** Attendee fields the CLI can write. */
export interface AttendeeInput {
  email: string;
  displayName?: string;
  optional?: boolean;
  /**
   * Preserved on read-modify-write so replacing the guest list does not reset
   * everyone's RSVP. The API replaces the whole attendees array on patch.
   */
  responseStatus?: AttendeeResponseStatus;
}

// Request body for creating/updating events
export interface GoogleEventWriteBody {
  summary?: string;
  description?: string | null;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  transparency?: Transparency;
  attendees?: GoogleEventAttendeeWrite[];
}

interface GoogleEventAttendeeWrite {
  email: string;
  displayName?: string;
  optional?: boolean;
  responseStatus?: AttendeeResponseStatus;
}

export interface CreateEventInput {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timeZone?: string;
  description?: string | null;
  transparency?: Transparency;
  attendees?: AttendeeInput[];
  sendUpdates?: SendUpdates;
}

interface UpdateEventBase {
  title?: string;
  timeZone?: string;
  description?: string | null;
  transparency?: Transparency;
  /** Replaces the whole guest list; an empty array clears it. */
  attendees?: AttendeeInput[];
  sendUpdates?: SendUpdates;
}

interface UpdateEventTimeFields {
  start: string;
  end: string;
  allDay: boolean;
}

export type UpdateEventInput = UpdateEventBase &
  (UpdateEventTimeFields | { start?: never; end?: never; allDay?: never });

export interface GoogleConferenceEntryPoint {
  entryPointType?: string | null;
  uri?: string | null;
}

export interface GoogleConferenceData {
  createRequest?: {
    requestId?: string | null;
    status?: { statusCode?: string | null } | null;
  } | null;
  entryPoints?: GoogleConferenceEntryPoint[] | null;
}

export interface GoogleEventAttendee {
  email?: string | null;
  displayName?: string | null;
  responseStatus?: string | null;
  optional?: boolean | null;
  organizer?: boolean | null;
  self?: boolean | null;
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
  attendees?: GoogleEventAttendee[] | null;
  hangoutLink?: string | null;
  conferenceData?: GoogleConferenceData | null;
  created?: string | null;
  updated?: string | null;
}

export interface GoogleCalendar {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  primary?: boolean | null;
}

function normalizeAttendees(attendees: GoogleEventAttendee[] | null | undefined): EventAttendee[] {
  if (!attendees) {
    return [];
  }
  const result: EventAttendee[] = [];
  for (const attendee of attendees) {
    // Rooms and resources have no email address; they are out of scope for now.
    if (!attendee.email) {
      continue;
    }
    result.push({
      email: attendee.email,
      display_name: attendee.displayName ?? null,
      response_status: ResponseStatusSchema.parse(attendee.responseStatus ?? undefined),
      optional: attendee.optional ?? false,
      organizer: attendee.organizer ?? false,
      self: attendee.self ?? false,
    });
  }
  return result;
}

function normalizeMeetLink(event: GoogleEvent): string | null {
  if (event.hangoutLink) {
    return event.hangoutLink;
  }
  // Phone and SIP entry points are out of scope; only the video URL is surfaced.
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  );
  return video?.uri ?? null;
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
    status: EventStatusSchema.parse(event.status ?? undefined),
    transparency: TransparencySchema.parse(event.transparency ?? undefined),
    attendees: normalizeAttendees(event.attendees),
    meet_link: normalizeMeetLink(event),
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
  try {
    const calendars: Calendar[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      if (pages >= MAX_PAGES) {
        throw new ApiError("API_ERROR", `Pagination limit of ${MAX_PAGES} pages exceeded`);
      }
      const response = await api.calendarList.list(pageToken ? { pageToken } : undefined);
      const items = response.data.items ?? [];
      for (const item of items) {
        calendars.push(normalizeCalendar(item));
      }
      pageToken = response.data.nextPageToken;
      pages++;
    } while (pageToken);

    return calendars;
  } catch (error: unknown) {
    mapApiError(error);
  }
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
  try {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      if (pages >= MAX_PAGES) {
        throw new ApiError("API_ERROR", `Pagination limit of ${MAX_PAGES} pages exceeded`);
      }
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
      pages++;
    } while (pageToken);

    return events;
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function getEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  eventId: string,
  timeZone?: string,
): Promise<CalendarEvent> {
  try {
    const params: { calendarId: string; eventId: string; timeZone?: string } = {
      calendarId,
      eventId,
    };
    if (timeZone) {
      params.timeZone = timeZone;
    }
    const response = await api.events.get(params);
    return normalizeEvent(response.data, calendarId, calendarName);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

function buildTimeFields(
  start: string,
  end: string,
  allDay: boolean,
  timeZone?: string,
): Pick<GoogleEventWriteBody, "start" | "end"> {
  if (allDay) {
    return {
      start: { date: start },
      end: { date: end },
    };
  }
  const startField: { dateTime: string; timeZone?: string } = { dateTime: start };
  const endField: { dateTime: string; timeZone?: string } = { dateTime: end };
  if (timeZone) {
    startField.timeZone = timeZone;
    endField.timeZone = timeZone;
  }
  return { start: startField, end: endField };
}

function buildAttendees(attendees: AttendeeInput[]): GoogleEventAttendeeWrite[] {
  return attendees.map((attendee) => {
    const entry: GoogleEventAttendeeWrite = { email: attendee.email };
    if (attendee.displayName !== undefined) entry.displayName = attendee.displayName;
    if (attendee.optional !== undefined) entry.optional = attendee.optional;
    if (attendee.responseStatus !== undefined) entry.responseStatus = attendee.responseStatus;
    return entry;
  });
}

export async function createEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  input: CreateEventInput,
): Promise<CalendarEvent> {
  try {
    const requestBody: GoogleEventWriteBody = {
      summary: input.title,
      ...buildTimeFields(input.start, input.end, input.allDay, input.timeZone),
      transparency: input.transparency ?? "opaque",
    };
    if (input.description !== undefined) {
      requestBody.description = input.description;
    }
    if (input.attendees !== undefined) {
      requestBody.attendees = buildAttendees(input.attendees);
    }
    const response = await api.events.insert({
      calendarId,
      requestBody,
      sendUpdates: input.sendUpdates ?? DEFAULT_SEND_UPDATES,
    });
    return normalizeEvent(response.data, calendarId, calendarName);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function updateEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  eventId: string,
  input: UpdateEventInput,
): Promise<CalendarEvent> {
  try {
    const { start, end, allDay } = input as Record<string, unknown>;
    const timeFieldCount = [start, end, allDay].filter((v) => v !== undefined).length;
    if (timeFieldCount > 0 && timeFieldCount < 3) {
      throw new ApiError("INVALID_ARGS", "start, end, and allDay must all be provided together");
    }

    const requestBody: Partial<GoogleEventWriteBody> = {};
    if (input.title !== undefined) {
      requestBody.summary = input.title;
    }
    if (input.description !== undefined) {
      requestBody.description = input.description;
    }
    if (input.transparency !== undefined) {
      requestBody.transparency = input.transparency;
    }
    if (input.attendees !== undefined) {
      requestBody.attendees = buildAttendees(input.attendees);
    }
    if (start !== undefined && end !== undefined && allDay !== undefined) {
      Object.assign(
        requestBody,
        buildTimeFields(start as string, end as string, allDay as boolean, input.timeZone),
      );
    }
    const response = await api.events.patch({
      calendarId,
      eventId,
      requestBody,
      sendUpdates: input.sendUpdates ?? DEFAULT_SEND_UPDATES,
    });
    return normalizeEvent(response.data, calendarId, calendarName);
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export async function deleteEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  eventId: string,
  sendUpdates: SendUpdates = DEFAULT_SEND_UPDATES,
): Promise<void> {
  try {
    await api.events.delete({ calendarId, eventId, sendUpdates });
  } catch (error: unknown) {
    mapApiError(error);
  }
}

export function isAuthRequiredError(error: unknown): boolean {
  return (
    (error instanceof ApiError || error instanceof AuthError) &&
    (error.code === "AUTH_REQUIRED" || error.code === "AUTH_EXPIRED")
  );
}
