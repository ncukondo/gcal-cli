import type { CalendarEvent } from "../types/index.ts";

export type TransparencyOption = "busy" | "free" | undefined;

export function filterByTransparency(
	events: CalendarEvent[],
	option: TransparencyOption,
): CalendarEvent[] {
	if (option === "busy") {
		return events.filter((e) => e.transparency === "opaque");
	}
	if (option === "free") {
		return events.filter((e) => e.transparency === "transparent");
	}
	return events;
}
