import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../types/index.ts";
import { applyFilters, filterByStatus, filterByTransparency } from "./filter.ts";

function makeEvent(
	overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
	return {
		id: "1",
		title: "Test Event",
		description: null,
		start: "2026-02-23T10:00:00+09:00",
		end: "2026-02-23T11:00:00+09:00",
		all_day: false,
		calendar_id: "cal1",
		calendar_name: "My Calendar",
		html_link: "https://calendar.google.com/event/1",
		status: "confirmed",
		transparency: "opaque",
		created: "2026-02-20T00:00:00Z",
		updated: "2026-02-20T00:00:00Z",
		...overrides,
	};
}

const opaqueEvent = makeEvent({ id: "1", title: "Busy Event", transparency: "opaque" });
const transparentEvent = makeEvent({ id: "2", title: "Free Event", transparency: "transparent" });
const mixedEvents = [opaqueEvent, transparentEvent];

const confirmedEvent = makeEvent({ id: "10", title: "Confirmed", status: "confirmed" });
const tentativeEvent = makeEvent({ id: "11", title: "Tentative", status: "tentative" });
const cancelledEvent = makeEvent({ id: "12", title: "Cancelled", status: "cancelled" });
const statusEvents = [confirmedEvent, tentativeEvent, cancelledEvent];

describe("filterByTransparency", () => {
	it("returns only opaque events when option is 'busy'", () => {
		const result = filterByTransparency(mixedEvents, "busy");
		expect(result).toEqual([opaqueEvent]);
	});

	it("returns only transparent events when option is 'free'", () => {
		const result = filterByTransparency(mixedEvents, "free");
		expect(result).toEqual([transparentEvent]);
	});

	it("returns all events when no option is provided", () => {
		const result = filterByTransparency(mixedEvents, undefined);
		expect(result).toEqual(mixedEvents);
	});

	it("returns empty array when no events match", () => {
		const result = filterByTransparency([opaqueEvent], "free");
		expect(result).toEqual([]);
	});

	it("returns empty array when input is empty", () => {
		const result = filterByTransparency([], "busy");
		expect(result).toEqual([]);
	});
});

describe("filterByStatus", () => {
	it("excludes tentative and cancelled events by default", () => {
		const result = filterByStatus(statusEvents, {});
		expect(result).toEqual([confirmedEvent]);
	});

	it("returns only confirmed events when confirmed is true", () => {
		const result = filterByStatus(statusEvents, { confirmed: true });
		expect(result).toEqual([confirmedEvent]);
	});

	it("includes tentative events when includeTentative is true", () => {
		const result = filterByStatus(statusEvents, { includeTentative: true });
		expect(result).toEqual([confirmedEvent, tentativeEvent]);
	});

	it("always excludes cancelled events even with includeTentative", () => {
		const result = filterByStatus(statusEvents, { includeTentative: true });
		expect(result.some((e) => e.status === "cancelled")).toBe(false);
	});

	it("always excludes cancelled events even with no options", () => {
		const result = filterByStatus([cancelledEvent], {});
		expect(result).toEqual([]);
	});

	it("returns empty array when input is empty", () => {
		const result = filterByStatus([], {});
		expect(result).toEqual([]);
	});
});

describe("applyFilters", () => {
	const busyConfirmed = makeEvent({
		id: "20",
		title: "Busy Confirmed",
		transparency: "opaque",
		status: "confirmed",
	});
	const busyTentative = makeEvent({
		id: "21",
		title: "Busy Tentative",
		transparency: "opaque",
		status: "tentative",
	});
	const freeConfirmed = makeEvent({
		id: "22",
		title: "Free Confirmed",
		transparency: "transparent",
		status: "confirmed",
	});
	const freeCancelled = makeEvent({
		id: "23",
		title: "Free Cancelled",
		transparency: "transparent",
		status: "cancelled",
	});
	const allEvents = [busyConfirmed, busyTentative, freeConfirmed, freeCancelled];

	it("applies both transparency and status filters", () => {
		const result = applyFilters(allEvents, { transparency: "busy", confirmed: true });
		expect(result).toEqual([busyConfirmed]);
	});

	it("applies only transparency filter when no status options", () => {
		const result = applyFilters(allEvents, { transparency: "free" });
		expect(result).toEqual([freeConfirmed]);
	});

	it("applies only status filter when no transparency option", () => {
		const result = applyFilters(allEvents, { includeTentative: true });
		expect(result).toEqual([busyConfirmed, busyTentative, freeConfirmed]);
	});

	it("returns confirmed events by default (no options)", () => {
		const result = applyFilters(allEvents, {});
		expect(result).toEqual([busyConfirmed, freeConfirmed]);
	});

	it("handles --busy --include-tentative combination", () => {
		const result = applyFilters(allEvents, {
			transparency: "busy",
			includeTentative: true,
		});
		expect(result).toEqual([busyConfirmed, busyTentative]);
	});

	it("applies composed filters to return only matching events", () => {
		const result = applyFilters(allEvents, {
			transparency: "free",
			confirmed: true,
		});
		expect(result).toEqual([freeConfirmed]);
	});

	it("returns empty array for empty input", () => {
		const result = applyFilters([], { transparency: "busy" });
		expect(result).toEqual([]);
	});
});
