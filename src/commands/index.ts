import { google } from "googleapis";
import * as nodeFs from "node:fs";
import type { Command } from "commander";
import { createCalendarsCommand, handleCalendars } from "./calendars.ts";
import { resolveGlobalOptions } from "../cli.ts";
import { loadConfig } from "../lib/config.ts";
import { getAuthenticatedClient } from "../lib/auth.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";

const fsAdapter = {
  existsSync: (p: string) => nodeFs.existsSync(p),
  readFileSync: (p: string) => nodeFs.readFileSync(p, "utf-8"),
  writeFileSync: (p: string, d: string) => nodeFs.writeFileSync(p, d, "utf-8"),
  mkdirSync: (p: string) => nodeFs.mkdirSync(p, { recursive: true }),
  unlinkSync: (p: string) => nodeFs.unlinkSync(p),
  chmodSync: (p: string, m: number) => nodeFs.chmodSync(p, m),
};

export function registerCommands(program: Command): void {
  const calendarsCmd = createCalendarsCommand();
  calendarsCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const config = loadConfig(fsAdapter);
    const oauth2Client = await getAuthenticatedClient(fsAdapter);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const api = {
      calendarList: { list: (p?: { pageToken?: string }) => calendar.calendarList.list(p) },
      events: {
        list: (p: Parameters<typeof calendar.events.list>[0]) => calendar.events.list(p),
        get: (p: Parameters<typeof calendar.events.get>[0]) => calendar.events.get(p),
      },
    } as unknown as GoogleCalendarApi;
    const result = await handleCalendars({
      api,
      format: globalOpts.format,
      quiet: globalOpts.quiet,
      write: (msg) => process.stdout.write(msg + "\n"),
      configCalendars: config.calendars,
    });
    process.exit(result.exitCode);
  });
  program.addCommand(calendarsCmd);
}
