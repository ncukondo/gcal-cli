import { describe, expect, it } from "vitest";
import type {
  CalendarEvent,
  Calendar,
  CommandResult,
  ErrorCode,
  SuccessResponse,
  ErrorResponse,
  EventStatus,
  Transparency,
} from "./index.ts";
import { ExitCode } from "./index.ts";

/**
 * Helper: asserts that a value is assignable to a given type at compile time.
 * At runtime it simply returns true so we can use expect(...).toBe(true).
 */
function isType<T>(_value: T): true {
  return true;
}

describe("CalendarEvent", () => {
  it("accepts a spec-compliant event object", () => {
    const event: CalendarEvent = {
      id: "evt_1",
      title: "Team standup",
      description: null,
      start: "2026-02-22T09:00:00Z",
      end: "2026-02-22T09:30:00Z",
      all_day: false,
      calendar_id: "primary",
      calendar_name: "Work",
      html_link: "https://calendar.google.com/event?eid=abc",
      status: "confirmed",
      transparency: "opaque",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-02-20T12:00:00Z",
    };
    expect(isType<CalendarEvent>(event)).toBe(true);
  });

  it("accepts description as string", () => {
    const event: CalendarEvent = {
      id: "evt_2",
      title: "Lunch",
      description: "At the usual place",
      start: "2026-02-22T12:00:00Z",
      end: "2026-02-22T13:00:00Z",
      all_day: false,
      calendar_id: "primary",
      calendar_name: "Personal",
      html_link: "https://calendar.google.com/event?eid=def",
      status: "tentative",
      transparency: "transparent",
      created: "2026-01-15T00:00:00Z",
      updated: "2026-02-21T08:00:00Z",
    };
    expect(isType<CalendarEvent>(event)).toBe(true);
  });

  it("accepts an all-day event", () => {
    const event: CalendarEvent = {
      id: "evt_3",
      title: "Holiday",
      description: null,
      start: "2026-02-22",
      end: "2026-02-23",
      all_day: true,
      calendar_id: "holidays",
      calendar_name: "Holidays",
      html_link: "https://calendar.google.com/event?eid=ghi",
      status: "confirmed",
      transparency: "transparent",
      created: "2025-12-01T00:00:00Z",
      updated: "2025-12-01T00:00:00Z",
    };
    expect(isType<CalendarEvent>(event)).toBe(true);
  });
});

describe("Calendar", () => {
  it("accepts a spec-compliant calendar object", () => {
    const calendar: Calendar = {
      id: "primary",
      name: "My Calendar",
      description: null,
      primary: true,
      enabled: true,
    };
    expect(isType<Calendar>(calendar)).toBe(true);
  });

  it("accepts description as string", () => {
    const calendar: Calendar = {
      id: "work_cal",
      name: "Work",
      description: "Work-related events",
      primary: false,
      enabled: true,
    };
    expect(isType<Calendar>(calendar)).toBe(true);
  });
});

describe("ErrorCode", () => {
  it("accepts all 6 error codes", () => {
    const codes: ErrorCode[] = [
      "AUTH_REQUIRED",
      "AUTH_EXPIRED",
      "NOT_FOUND",
      "INVALID_ARGS",
      "API_ERROR",
      "CONFIG_ERROR",
    ];
    expect(codes).toHaveLength(6);
    for (const code of codes) {
      expect(isType<ErrorCode>(code)).toBe(true);
    }
  });
});

describe("SuccessResponse", () => {
  it("has shape { success: true, data: T }", () => {
    const response: SuccessResponse<string[]> = {
      success: true,
      data: ["a", "b"],
    };
    expect(response.success).toBe(true);
    expect(response.data).toEqual(["a", "b"]);
  });
});

describe("ErrorResponse", () => {
  it("has shape { success: false, error: { code: ErrorCode, message: string } }", () => {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
      },
    };
    expect(response.success).toBe(false);
    expect(response.error.code).toBe("AUTH_REQUIRED");
    expect(response.error.message).toBe("Authentication is required");
  });
});

describe("CommandResult", () => {
  it("accepts an object with exitCode", () => {
    const result: CommandResult = { exitCode: 0 };
    expect(isType<CommandResult>(result)).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("accepts non-zero exit codes", () => {
    const result: CommandResult = { exitCode: ExitCode.AUTH };
    expect(isType<CommandResult>(result)).toBe(true);
    expect(result.exitCode).toBe(2);
  });
});

describe("ExitCode", () => {
  it("has SUCCESS=0, GENERAL=1, AUTH=2, ARGUMENT=3", () => {
    expect(ExitCode.SUCCESS).toBe(0);
    expect(ExitCode.GENERAL).toBe(1);
    expect(ExitCode.AUTH).toBe(2);
    expect(ExitCode.ARGUMENT).toBe(3);
  });
});

describe("EventStatus", () => {
  it("accepts confirmed, tentative, and cancelled", () => {
    const statuses: EventStatus[] = ["confirmed", "tentative", "cancelled"];
    expect(statuses).toHaveLength(3);
    for (const status of statuses) {
      expect(isType<EventStatus>(status)).toBe(true);
    }
  });
});

describe("Transparency", () => {
  it("accepts opaque and transparent", () => {
    const values: Transparency[] = ["opaque", "transparent"];
    expect(values).toHaveLength(2);
    for (const value of values) {
      expect(isType<Transparency>(value)).toBe(true);
    }
  });
});

describe("negative type tests (@ts-expect-error)", () => {
  it("CalendarEvent rejects missing required fields", () => {
    // @ts-expect-error — missing required fields
    isType<CalendarEvent>({ id: "evt_1", title: "Test" });
    expect(true).toBe(true);
  });

  it("CalendarEvent rejects wrong field types", () => {
    isType<CalendarEvent>({
      id: "evt_1",
      title: "Test",
      description: null,
      start: "2026-02-22T09:00:00Z",
      end: "2026-02-22T09:30:00Z",
      // @ts-expect-error — all_day must be boolean, not string
      all_day: "yes",
      calendar_id: "primary",
      calendar_name: "Work",
      html_link: "https://example.com",
      status: "confirmed",
      transparency: "opaque",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-02-20T12:00:00Z",
    });
    expect(true).toBe(true);
  });

  it("CalendarEvent rejects invalid status", () => {
    isType<CalendarEvent>({
      id: "evt_1",
      title: "Test",
      description: null,
      start: "2026-02-22T09:00:00Z",
      end: "2026-02-22T09:30:00Z",
      all_day: false,
      calendar_id: "primary",
      calendar_name: "Work",
      html_link: "https://example.com",
      // @ts-expect-error — "maybe" is not a valid EventStatus
      status: "maybe",
      transparency: "opaque",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-02-20T12:00:00Z",
    });
    expect(true).toBe(true);
  });

  it("Calendar rejects missing required fields", () => {
    // @ts-expect-error — missing name, description, primary, enabled
    isType<Calendar>({ id: "cal_1" });
    expect(true).toBe(true);
  });

  it("Calendar rejects wrong field types", () => {
    isType<Calendar>({
      id: "cal_1",
      name: "Work",
      description: null,
      // @ts-expect-error — primary must be boolean, not string
      primary: "yes",
      enabled: true,
    });
    expect(true).toBe(true);
  });

  it("ErrorCode rejects invalid codes", () => {
    // @ts-expect-error — "UNKNOWN" is not a valid ErrorCode
    isType<ErrorCode>("UNKNOWN");
    expect(true).toBe(true);
  });

  it("SuccessResponse rejects success: false", () => {
    // @ts-expect-error — success must be true
    isType<SuccessResponse<string>>({ success: false, data: "hello" });
    expect(true).toBe(true);
  });

  it("ErrorResponse rejects success: true", () => {
    isType<ErrorResponse>({
      // @ts-expect-error — success must be false
      success: true,
      error: { code: "API_ERROR", message: "fail" },
    });
    expect(true).toBe(true);
  });

  it("ErrorResponse rejects invalid error code", () => {
    isType<ErrorResponse>({
      success: false,
      error: {
        // @ts-expect-error — "UNKNOWN" is not a valid ErrorCode
        code: "UNKNOWN",
        message: "fail",
      },
    });
    expect(true).toBe(true);
  });

  it("EventStatus rejects invalid values", () => {
    // @ts-expect-error — "maybe" is not a valid EventStatus
    isType<EventStatus>("maybe");
    expect(true).toBe(true);
  });

  it("Transparency rejects invalid values", () => {
    // @ts-expect-error — "semi" is not a valid Transparency
    isType<Transparency>("semi");
    expect(true).toBe(true);
  });
});
