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
		// confirmed:true is intentionally identical to the default (both exclude tentative/cancelled); the flag is a no-op by design
		if (options.confirmed) return e.status === "confirmed";
		if (options.includeTentative) return true;
		return e.status === "confirmed";
	});
}

export interface FilterOptions extends StatusFilterOptions {
	transparency?: TransparencyOption;
}

export function applyFilters(
	events: CalendarEvent[],
	options: FilterOptions,
): CalendarEvent[] {
	const afterTransparency = filterByTransparency(events, options.transparency);
	return filterByStatus(afterTransparency, options);
}
