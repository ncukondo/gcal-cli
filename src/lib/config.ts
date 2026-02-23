import type { AppConfig, CalendarConfig } from "../types/index.ts";

interface FsAdapter {
  existsSync: (path: string) => boolean;
}

export async function findConfigPath(fs: FsAdapter): Promise<string | null> {
  const envPath = process.env["GCAL_CLI_CONFIG"];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const cwdPath = `${process.cwd()}/gcal-cli.toml`;
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const home = process.env["HOME"] ?? "";
  const defaultPath = `${home}/.config/gcal-cli/config.toml`;
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  return null;
}

export function parseConfig(_toml: string): AppConfig {
  throw new Error("Not implemented");
}

export async function loadConfig(): Promise<AppConfig> {
  throw new Error("Not implemented");
}

export function getEnabledCalendars(_calendars: CalendarConfig[]): CalendarConfig[] {
  throw new Error("Not implemented");
}

export function selectCalendars(
  _cliCalendars: string[] | undefined,
  _config: AppConfig,
): CalendarConfig[] {
  throw new Error("Not implemented");
}
