import { getEvent, ApiError } from "./api.ts";
import type { GoogleCalendarApi } from "./api.ts";
import type { CalendarConfig } from "../types/index.ts";

export interface ResolvedCalendar {
  id: string;
  name: string;
}

export async function resolveEventCalendar(
  api: GoogleCalendarApi,
  eventId: string,
  calendars: CalendarConfig[],
): Promise<ResolvedCalendar> {
  const results = await Promise.all(
    calendars.map(async (cal) => {
      try {
        await getEvent(api, cal.id, cal.name, eventId);
        return { id: cal.id, name: cal.name };
      } catch (error: unknown) {
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          return null;
        }
        throw error;
      }
    }),
  );

  const found = results.filter((r): r is ResolvedCalendar => r !== null);

  if (found.length === 0) {
    throw new ApiError("NOT_FOUND", `Event "${eventId}" not found in any enabled calendar`);
  }

  if (found.length > 1) {
    const calList = found.map((c) => `${c.name} (${c.id})`).join(", ");
    throw new ApiError(
      "INVALID_ARGS",
      `Event "${eventId}" found in multiple calendars: ${calList}. Specify -c <calendar-id>.`,
    );
  }

  return found[0]!;
}
