import { Command } from "commander";
import type { GoogleCalendarApi } from "../lib/api.ts";
import { listEvents } from "../lib/api.ts";
import { applyFilters } from "../lib/filter.ts";
import type { FilterOptions, TransparencyOption } from "../lib/filter.ts";
import { formatJsonSuccess, formatSearchResultText } from "../lib/output.ts";
import { formatDateTimeInZone, parseDateTimeInZone } from "../lib/timezone.ts";
import type { CalendarConfig, OutputFormat } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";

const DEFAULT_SEARCH_DAYS = 30;

export interface SearchHandlerOptions {
  api: GoogleCalendarApi;
  query: string;
  format: OutputFormat;
  calendars: CalendarConfig[];
  timezone: string;
  days?: number;
  from?: string;
  to?: string;
  busy?: boolean;
  free?: boolean;
  confirmed?: boolean;
  includeTentative?: boolean;
  write: (msg: string) => void;
}

interface CommandResult {
  exitCode: number;
}

export async function handleSearch(opts: SearchHandlerOptions): Promise<CommandResult> {
  const { api, query, format, calendars, timezone, write } = opts;

  const now = new Date();
  const timeMin = opts.from
    ? formatDateTimeInZone(parseDateTimeInZone(opts.from, timezone), timezone)
    : formatDateTimeInZone(now, timezone);

  let timeMax: string;
  if (opts.to) {
    timeMax = formatDateTimeInZone(parseDateTimeInZone(opts.to + "T23:59:59", timezone), timezone);
  } else {
    const days = opts.days ?? DEFAULT_SEARCH_DAYS;
    const startDate = opts.from ? parseDateTimeInZone(opts.from, timezone) : now;
    const endDate = new Date(startDate.getTime());
    endDate.setDate(endDate.getDate() + days);
    timeMax = formatDateTimeInZone(endDate, timezone);
  }

  const results = await Promise.all(
    calendars.map((cal) =>
      listEvents(api, cal.id, cal.name, { timeMin, timeMax, q: query }),
    ),
  );
  const allEvents = results.flat();

  const transparency: TransparencyOption = opts.busy ? "busy" : opts.free ? "free" : undefined;
  const filterOpts: FilterOptions = { transparency };
  if (opts.confirmed !== undefined) filterOpts.confirmed = opts.confirmed;
  if (opts.includeTentative !== undefined) filterOpts.includeTentative = opts.includeTentative;
  const filtered = applyFilters(allEvents, filterOpts);

  if (format === "json") {
    write(
      formatJsonSuccess({
        query,
        events: filtered,
        count: filtered.length,
      }),
    );
  } else {
    write(formatSearchResultText(query, filtered));
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createSearchCommand(): Command {
  const cmd = new Command("search")
    .description("Search events by keyword")
    .argument("<query>", "Search query string");

  cmd.option("--from <date>", "Start date for search range");
  cmd.option("--to <date>", "End date for search range");
  cmd.option("--days <n>", "Search within next n days (default: 30)", Number.parseInt);

  // --days is mutually exclusive with --from and --to
  const daysOpt = cmd.options.find((o) => o.long === "--days")!;
  const fromOpt = cmd.options.find((o) => o.long === "--from")!;
  const toOpt = cmd.options.find((o) => o.long === "--to")!;
  daysOpt.conflicts(["from", "to"]);
  fromOpt.conflicts(["days"]);
  toOpt.conflicts(["days"]);

  cmd.option("--busy", "Show only busy (opaque) events");
  cmd.option("--free", "Show only free (transparent) events");
  cmd.option("--confirmed", "Show only confirmed events");
  cmd.option("--include-tentative", "Include tentative events");

  return cmd;
}
