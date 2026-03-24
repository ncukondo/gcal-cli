import path from "node:path";
import { Command } from "commander";
import type { Calendar, CommandResult, OutputFormat, TaskList, TaskListConfig } from "../types/index.ts";
import { ExitCode } from "../types/index.ts";
import { generateConfigToml, getDefaultConfigPath } from "../lib/config.ts";
import { isAuthRequiredError } from "../lib/api.ts";
import { formatJsonSuccess, formatJsonError } from "../lib/output.ts";

export interface InitFsAdapter {
  existsSync: (path: string) => boolean;
  writeFileSync: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive: boolean }) => void;
}

export interface HandleInitOptions {
  listCalendars: () => Promise<Calendar[]>;
  listTaskLists?: () => Promise<TaskList[]>;
  requestAuth?: () => Promise<void>;
  fs: InitFsAdapter;
  format: OutputFormat;
  quiet: boolean;
  write: (msg: string) => void;
  force: boolean;
  all: boolean;
  local: boolean;
  timezone?: string | undefined;
}

function resolveTimezone(cliTimezone?: string): string {
  return cliTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function handleInit(opts: HandleInitOptions): Promise<CommandResult> {
  const { fs, format, quiet, write, force, all, local, requestAuth } = opts;

  // Determine output path
  const configPath = local ? `${process.cwd()}/gcal-cli.toml` : getDefaultConfigPath();

  // Check if file exists (unless --force)
  if (!force && fs.existsSync(configPath)) {
    const msg = `Config file already exists: ${configPath}\nUse --force to overwrite.`;
    if (format === "json") {
      write(formatJsonError("CONFIG_ERROR", msg));
    } else {
      write(msg);
    }
    return { exitCode: ExitCode.GENERAL };
  }

  // Fetch calendars (with auto-auth retry)
  let calendars: Calendar[];
  try {
    calendars = await opts.listCalendars();
  } catch (error: unknown) {
    if (isAuthRequiredError(error) && requestAuth) {
      await requestAuth();
      calendars = await opts.listCalendars();
    } else if (isAuthRequiredError(error)) {
      const msg = "Not authenticated. Run `gcal auth` to authenticate.";
      if (format === "json") {
        write(formatJsonError("AUTH_REQUIRED", msg));
      } else {
        write(msg);
      }
      return { exitCode: ExitCode.AUTH };
    } else {
      throw error;
    }
  }

  // Check for empty calendars
  if (calendars.length === 0) {
    const msg = "No calendars found in Google Calendar.";
    if (format === "json") {
      write(formatJsonError("API_ERROR", msg));
    } else {
      write(msg);
    }
    return { exitCode: ExitCode.GENERAL };
  }

  // Select calendars: primary only by default, all if --all
  const configCalendars = calendars.map((cal) => ({
    id: cal.id,
    name: cal.name,
    enabled: all || cal.primary,
  }));

  // Fetch task lists (skip on error - Tasks API scope may not be available)
  let configTaskLists: TaskListConfig[] = [];
  if (opts.listTaskLists) {
    try {
      const taskLists = await opts.listTaskLists();
      configTaskLists = taskLists.map((tl) => ({
        id: tl.id,
        name: tl.title,
        enabled: all || tl.id === "@default",
      }));
    } catch {
      // Tasks API not available - skip task lists
    }
  }

  // Resolve timezone
  const timezone = resolveTimezone(opts.timezone);

  // Generate TOML and write
  const toml = generateConfigToml(configCalendars, timezone, configTaskLists.length > 0 ? configTaskLists : undefined);
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, toml);

  // Output results
  const enabledCalendars = configCalendars.filter((c) => c.enabled);
  const enabledTaskLists = configTaskLists.filter((t) => t.enabled);

  if (quiet) {
    write(configPath);
    return { exitCode: ExitCode.SUCCESS };
  }

  if (format === "json") {
    const data: Record<string, unknown> = {
      path: configPath,
      timezone,
      calendars: configCalendars.map((c) => ({
        id: c.id,
        name: c.name,
        enabled: c.enabled,
      })),
      enabled_count: enabledCalendars.length,
      total_count: configCalendars.length,
    };
    if (configTaskLists.length > 0) {
      data.task_lists = configTaskLists.map((t) => ({
        id: t.id,
        name: t.name,
        enabled: t.enabled,
      }));
    }
    write(formatJsonSuccess(data));
  } else {
    write(`Config file created: ${configPath}`);
    write("");
    write("Enabled calendars:");
    for (const cal of enabledCalendars) {
      write(`  - ${cal.name} (${cal.id})`);
    }
    if (enabledTaskLists.length > 0) {
      write("");
      write("Enabled task lists:");
      for (const tl of enabledTaskLists) {
        write(`  - ${tl.name} (${tl.id})`);
      }
    }
    write("");
    write(`Timezone: ${timezone}`);
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createInitCommand(): Command {
  const cmd = new Command("init").description(
    "Initialize config file with calendars from Google Calendar",
  );

  cmd.option("--force", "Overwrite existing config file");
  cmd.option("--all", "Enable all calendars (default: primary only)");
  cmd.option("--local", "Create ./gcal-cli.toml in current directory");
  cmd.option("--timezone <zone>", "Set timezone (default: system timezone)");

  return cmd;
}
