import * as z from "zod";
import type {
  Calendar,
  CalendarEvent,
  AttendeeResponseStatus,
  ErrorCode,
  EventAttendee,
  EventConference,
  Transparency,
} from "../types/index.ts";
import { randomUUID } from "node:crypto";
import { AuthError } from "./auth.ts";
import { MAX_PAGES, isGoogleApiError, mapApiError } from "./api-utils.ts";

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
      conferenceDataVersion?: number;
    }) => Promise<{ data: GoogleEvent }>;
    patch: (params: {
      calendarId: string;
      eventId: string;
      requestBody: Partial<GoogleEventWriteBody>;
      sendUpdates?: SendUpdates;
      conferenceDataVersion?: number;
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
  /** A createRequest asks Google to allocate a conference; null detaches the existing one. */
  conferenceData?: { createRequest: { requestId: string } } | null;
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
  /** Attach a freshly created Google Meet conference. */
  meet?: boolean;
}

interface UpdateEventBase {
  title?: string;
  timeZone?: string;
  description?: string | null;
  transparency?: Transparency;
  /** Replaces the whole guest list; an empty array clears it. */
  attendees?: AttendeeInput[];
  sendUpdates?: SendUpdates;
  /** Attach a freshly created Google Meet conference. Mutually exclusive with removeMeet. */
  meet?: boolean;
  /** Detach the conference currently attached to the event. */
  removeMeet?: boolean;
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
  conferenceSolution?: { key?: { type?: string | null } | null; name?: string | null } | null;
  entryPoints?: GoogleConferenceEntryPoint[] | null;
}

/** The one conference solution that is Google Meet. */
export const MEET_SOLUTION_TYPE = "hangoutsMeet";

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

function normalizeConference(event: GoogleEvent): EventConference | null {
  const data = event.conferenceData;
  if (!data && !event.hangoutLink) {
    return null;
  }
  // Phone and SIP entry points are out of scope; only the video URL is surfaced.
  const video = data?.entryPoints?.find((entry) => entry.entryPointType === "video");
  return {
    type: data?.conferenceSolution?.key?.type ?? null,
    uri: video?.uri ?? event.hangoutLink ?? null,
  };
}

function normalizeMeetLink(event: GoogleEvent, conference: EventConference | null): string | null {
  // hangoutLink is documented as populated only for Meet, so it settles the
  // question on its own -- including on responses that omit conferenceSolution.
  if (event.hangoutLink) {
    return event.hangoutLink;
  }
  if (!conference) {
    return null;
  }
  // A known non-Meet solution must not be passed off as a Meet link. An absent
  // solution stays ambiguous, and the entry point is the best answer available.
  if (conference.type !== null && conference.type !== MEET_SOLUTION_TYPE) {
    return null;
  }
  return conference.uri;
}

export function normalizeEvent(
  event: GoogleEvent,
  calendarId: string,
  calendarName: string,
): CalendarEvent {
  const allDay = Boolean(event.start?.date);
  const start = allDay ? (event.start?.date ?? "") : (event.start?.dateTime ?? "");
  const end = allDay ? (event.end?.date ?? "") : (event.end?.dateTime ?? "");
  const conference = normalizeConference(event);
  const meetLink = normalizeMeetLink(event, conference);

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
    meet_link: meetLink,
    conference,
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

/**
 * Conference creation is asynchronous: the insert/patch response can come back
 * with a `pending` status and no link yet. These are the waits between polls.
 */
const CONFERENCE_POLL_DELAYS_MS = [500, 1000, 2000];

/** Injection points that let tests drive conference creation deterministically. */
export interface ConferenceDeps {
  generateRequestId?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function conferenceStatus(event: GoogleEvent): string | undefined {
  return event.conferenceData?.createRequest?.status?.statusCode ?? undefined;
}

function assertConferenceNotFailed(event: GoogleEvent): void {
  if (conferenceStatus(event) === "failure") {
    // The event itself was already written, so name it -- otherwise the user
    // sees a bare failure and has no way to find or clean up what was created.
    const saved = event.id ? ` The event was still saved as ${event.id}.` : "";
    throw new ApiError(
      "API_ERROR",
      `Google Meet conference creation failed (createRequest status: failure).${saved}`,
    );
  }
}

/**
 * Polls the event until its conference leaves the `pending` state. Returning a
 * still-pending event is deliberate: the event itself was written successfully,
 * so callers surface a null meet_link rather than failing the whole command.
 */
async function resolveConference(
  api: GoogleCalendarApi,
  calendarId: string,
  event: GoogleEvent,
  deps: ConferenceDeps,
): Promise<GoogleEvent> {
  const sleep = deps.sleep ?? defaultSleep;
  let current = event;

  for (const delay of CONFERENCE_POLL_DELAYS_MS) {
    assertConferenceNotFailed(current);
    if (conferenceStatus(current) !== "pending") {
      return current;
    }
    if (!current.id) {
      return current;
    }
    await sleep(delay);
    try {
      const response = await api.events.get({ calendarId, eventId: current.id });
      current = response.data;
    } catch {
      // The event is already written; a failed poll must not fail the command.
      // Report what we last knew, which surfaces as a null meet_link.
      return current;
    }
  }

  assertConferenceNotFailed(current);
  return current;
}

function buildConferenceRequest(deps: ConferenceDeps): { createRequest: { requestId: string } } {
  // A reused requestId makes Google hand back the *same* conference, which would
  // leak one meeting URL across unrelated events. Always mint a new one.
  const generate = deps.generateRequestId ?? randomUUID;
  return { createRequest: { requestId: generate() } };
}

// Deliberately phrased as a possibility: a 400 on a --meet request is often
// about the conference, but it can equally be a bad time range, and asserting
// the wrong cause sends the user down the wrong path.
const MEET_400_HINT =
  "(--meet was requested; if this calendar cannot host conferences, retry without it.)";

/** Rethrows API errors, appending a hint when a conference request drew a 400. */
function mapWriteError(error: unknown, meetRequested: boolean): never {
  if (meetRequested && isGoogleApiError(error) && error.code === 400) {
    throw new ApiError("API_ERROR", `${error.message} ${MEET_400_HINT}`);
  }
  mapApiError(error);
}

export async function createEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  input: CreateEventInput,
  deps: ConferenceDeps = {},
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
    const params: Parameters<GoogleCalendarApi["events"]["insert"]>[0] = {
      calendarId,
      requestBody,
      sendUpdates: input.sendUpdates ?? DEFAULT_SEND_UPDATES,
    };
    if (input.meet) {
      requestBody.conferenceData = buildConferenceRequest(deps);
      params.conferenceDataVersion = 1;
    }
    const response = await api.events.insert(params);
    const data = input.meet
      ? await resolveConference(api, calendarId, response.data, deps)
      : response.data;
    return normalizeEvent(data, calendarId, calendarName);
  } catch (error: unknown) {
    mapWriteError(error, input.meet === true);
  }
}

export async function updateEvent(
  api: GoogleCalendarApi,
  calendarId: string,
  calendarName: string,
  eventId: string,
  input: UpdateEventInput,
  deps: ConferenceDeps = {},
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
    const params: Parameters<GoogleCalendarApi["events"]["patch"]>[0] = {
      calendarId,
      eventId,
      requestBody,
      sendUpdates: input.sendUpdates ?? DEFAULT_SEND_UPDATES,
    };
    // conferenceDataVersion is opt-in: without it the patch leaves any existing
    // conference alone, which is what an update that never mentions Meet wants.
    if (input.meet) {
      requestBody.conferenceData = buildConferenceRequest(deps);
      params.conferenceDataVersion = 1;
    } else if (input.removeMeet) {
      requestBody.conferenceData = null;
      params.conferenceDataVersion = 1;
    }
    const response = await api.events.patch(params);
    const data = input.meet
      ? await resolveConference(api, calendarId, response.data, deps)
      : response.data;
    return normalizeEvent(data, calendarId, calendarName);
  } catch (error: unknown) {
    mapWriteError(error, input.meet === true);
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
