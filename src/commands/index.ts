import type { Command } from "commander";
import { createListCommand, handleList, type ListHandlerDeps } from "./list.ts";
import { listEvents } from "../lib/api.ts";
import { loadConfig } from "../lib/config.ts";
import { resolveGlobalOptions, handleError } from "../cli.ts";
import type { GoogleCalendarApi } from "../lib/api.ts";
import type { ListOptions } from "./list.ts";

export function registerCommands(program: Command): void {
  const listCmd = createListCommand();
  listCmd.action(async () => {
    const globalOpts = resolveGlobalOptions(program);
    const listOpts = listCmd.opts();

    try {
      const { getAuthenticatedClient } = await import("../lib/auth.ts");
      const { google } = await import("googleapis");
      const fs = await import("node:fs");

      const authFs = {
        existsSync: (p: string) => fs.existsSync(p),
        readFileSync: (p: string) => fs.readFileSync(p, "utf-8"),
        writeFileSync: (p: string, d: string) => fs.writeFileSync(p, d, "utf-8"),
        mkdirSync: (p: string) => fs.mkdirSync(p, { recursive: true }),
        unlinkSync: (p: string) => fs.unlinkSync(p),
        chmodSync: (p: string, m: number) => fs.chmodSync(p, m),
      };

      const auth = await getAuthenticatedClient(authFs);
      const api = google.calendar({ version: "v3", auth }) as unknown as GoogleCalendarApi;

      const deps: ListHandlerDeps = {
        listEvents: (calendarId, calendarName, options) =>
          listEvents(api, calendarId, calendarName, options),
        loadConfig: () =>
          loadConfig({
            existsSync: (p) => fs.existsSync(p),
            readFileSync: (p) => fs.readFileSync(p, "utf-8"),
          }),
        write: (msg) => process.stdout.write(msg + "\n"),
      };

      const handleOpts: ListOptions = {
        ...listOpts,
        format: globalOpts.format,
        quiet: globalOpts.quiet,
        calendar: globalOpts.calendar,
      };
      if (globalOpts.timezone) handleOpts.timezone = globalOpts.timezone;

      const result = await handleList(handleOpts, deps);
      process.exit(result.exitCode);
    } catch (error) {
      handleError(error, globalOpts.format);
    }
  });
  program.addCommand(listCmd);
}
