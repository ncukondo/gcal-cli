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

export interface StatusFilterOptions {
	confirmed?: boolean;
	includeTentative?: boolean;
}

export function filterByStatus(
	events: CalendarEvent[],
	options: StatusFilterOptions,
): CalendarEvent[] {
	return events.filter((e) => {
		if (e.status === "cancelled") return false;
		if (options.confirmed) return e.status === "confirmed";
		if (options.includeTentative) return true;
		return e.status === "confirmed";
	});
}
