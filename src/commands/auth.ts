import { Command } from "commander";
import * as z from "zod";
import type { AuthFsAdapter, TokenData } from "../lib/auth.ts";
import {
  AuthError,
  loadTokens,
  getClientCredentials,
  startOAuthFlow,
  revokeTokens,
} from "../lib/auth.ts";
import { formatJsonSuccess, formatJsonError } from "../lib/output.ts";
import { ExitCode } from "../types/index.ts";
import type { CommandResult, OutputFormat } from "../types/index.ts";

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const UserinfoSchema = z.object({
  email: z.string().optional(),
});

interface AuthHandlerOptions {
  fs: AuthFsAdapter;
  format: OutputFormat;
  write: (msg: string) => void;
  fetchFn: typeof globalThis.fetch;
}

interface HandleAuthOptions extends AuthHandlerOptions {
  openUrl: (url: string) => void;
  startOAuthFlowFn?: typeof startOAuthFlow;
}

async function fetchUserEmail(
  accessToken: string,
  fetchFn: typeof globalThis.fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const parsed = UserinfoSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return parsed.data.email ?? null;
  } catch {
    return null;
  }
}

export async function handleAuth(opts: HandleAuthOptions): Promise<CommandResult> {
  const { fs, format, write, openUrl, fetchFn, startOAuthFlowFn = startOAuthFlow } = opts;

  const tokens = loadTokens(fs);

  if (tokens) {
    return handleAuthStatus({ fs, format, write, fetchFn, cachedTokens: tokens });
  }

  let credentials: ReturnType<typeof getClientCredentials>;
  try {
    credentials = getClientCredentials(fs);
  } catch (err) {
    if (err instanceof AuthError) {
      if (format === "json") {
        write(formatJsonError(err.code, err.message));
      } else {
        write(err.message);
      }
      return { exitCode: ExitCode.AUTH };
    }
    throw err;
  }

  const { authUrl, waitForCode, server } = await startOAuthFlowFn(credentials, fs, fetchFn);

  write(`Open this URL to authenticate:\n${authUrl}`);
  openUrl(authUrl);

  try {
    await waitForCode;
    if (format === "json") {
      write(formatJsonSuccess({ authenticated: true }));
    } else {
      write("Authentication successful.");
    }
    return { exitCode: ExitCode.SUCCESS };
  } finally {
    server.close();
  }
}

interface AuthStatusOptions extends AuthHandlerOptions {
  cachedTokens?: TokenData;
}

export async function handleAuthStatus(opts: AuthStatusOptions): Promise<CommandResult> {
  const { fs, format, write, fetchFn, cachedTokens } = opts;

  const tokens = cachedTokens ?? loadTokens(fs);

  if (!tokens) {
    if (format === "json") {
      write(
        formatJsonError("AUTH_REQUIRED", "Not authenticated. Run `gcal auth` to authenticate."),
      );
    } else {
      write("Not authenticated. Run `gcal auth` to authenticate.");
    }
    return { exitCode: ExitCode.AUTH };
  }

  const email = await fetchUserEmail(tokens.access_token, fetchFn);
  const expiresAt = new Date(tokens.expiry_date);

  if (format === "json") {
    write(
      formatJsonSuccess({
        authenticated: true,
        email,
        expires_at: expiresAt.toISOString(),
      }),
    );
  } else {
    write(`Authenticated as: ${email ?? "unknown"}`);
    write(`Token expires: ${expiresAt.toISOString()}`);
  }

  return { exitCode: ExitCode.SUCCESS };
}

export async function handleAuthLogout(opts: AuthHandlerOptions): Promise<CommandResult> {
  const { fs, format, write, fetchFn } = opts;

  const tokens = loadTokens(fs);

  if (!tokens) {
    if (format === "json") {
      write(formatJsonSuccess({ logged_out: false, message: "Not authenticated." }));
    } else {
      write("Not authenticated. Nothing to log out.");
    }
    return { exitCode: ExitCode.SUCCESS };
  }

  await revokeTokens(fs, fetchFn);

  if (format === "json") {
    write(formatJsonSuccess({ logged_out: true }));
  } else {
    write("Logged out successfully. Credentials removed.");
  }

  return { exitCode: ExitCode.SUCCESS };
}

export function createAuthCommand(): Command {
  const cmd = new Command("auth").description("Manage OAuth authentication");

  cmd.option("--status", "Check authentication status");
  cmd.option("--logout", "Remove stored credentials");

  return cmd;
}
