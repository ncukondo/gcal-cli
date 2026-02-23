import { parse as parseToml } from "smol-toml";
import type { AppConfig, CalendarConfig, OutputFormat } from "../types/index.ts";

export interface FsAdapter {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
}

type FindConfigFs = Pick<FsAdapter, "existsSync">;

export async function findConfigPath(fs: FindConfigFs): Promise<string | null> {
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

export function parseConfig(toml: string): AppConfig {
  const raw = parseToml(toml);

  const calendars: CalendarConfig[] = Array.isArray(raw["calendars"])
    ? (raw["calendars"] as Record<string, unknown>[]).map((c) => ({
        id: String(c["id"]),
        name: String(c["name"]),
        enabled: Boolean(c["enabled"]),
      }))
    : [];

  const envFormat = process.env["GCAL_CLI_FORMAT"];
  const envTimezone = process.env["GCAL_CLI_TIMEZONE"];

  const fileFormat = typeof raw["default_format"] === "string"
    ? raw["default_format"] as OutputFormat
    : "text";
  const fileTimezone = typeof raw["timezone"] === "string"
    ? raw["timezone"]
    : undefined;

  const timezone = envTimezone || fileTimezone;
  const config: AppConfig = {
    default_format: (envFormat as OutputFormat) || fileFormat,
    calendars,
  };
  if (timezone) {
    config.timezone = timezone;
  }
  return config;
}

export async function loadConfig(fs: FsAdapter): Promise<AppConfig> {
  const configPath = await findConfigPath(fs);
  if (!configPath) {
    return parseConfig("");
  }
  const content = fs.readFileSync(configPath);
  return parseConfig(content);
}

export function getEnabledCalendars(calendars: CalendarConfig[]): CalendarConfig[] {
  return calendars.filter((c) => c.enabled);
}

export function selectCalendars(
  cliCalendars: string[] | undefined,
  config: AppConfig,
): CalendarConfig[] {
  if (cliCalendars && cliCalendars.length > 0) {
    return cliCalendars.map((id) => {
      const found = config.calendars.find((c) => c.id === id);
      return found ?? { id, name: id, enabled: true };
    });
  }
  return getEnabledCalendars(config.calendars);
}
