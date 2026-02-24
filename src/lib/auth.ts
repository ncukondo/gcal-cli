import http from "node:http";
import { google } from "googleapis";
import type { ErrorCode } from "../types/index.ts";

export interface AuthFsAdapter {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
  writeFileSync: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive: boolean }) => void;
  unlinkSync: (path: string) => void;
  chmodSync: (path: string, mode: number) => void;
}

export type PromptFn = (message: string) => Promise<string>;

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
}

export class AuthError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const DEFAULT_REDIRECT_URI = "http://localhost";

function getCredentialsDir(): string {
  const home = process.env["HOME"] ?? "";
  return `${home}/.config/gcal-cli`;
}

export function getClientCredentials(fs: AuthFsAdapter): ClientCredentials {
  const clientSecretPath = `${getCredentialsDir()}/client_secret.json`;

  if (fs.existsSync(clientSecretPath)) {
    const raw = JSON.parse(fs.readFileSync(clientSecretPath)) as {
      installed: {
        client_id: string;
        client_secret: string;
        redirect_uris: string[];
      };
    };
    return {
      clientId: raw.installed.client_id,
      clientSecret: raw.installed.client_secret,
      redirectUri: raw.installed.redirect_uris[0] ?? DEFAULT_REDIRECT_URI,
    };
  }

  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

  if (clientId && clientSecret) {
    return {
      clientId,
      clientSecret,
      redirectUri: DEFAULT_REDIRECT_URI,
    };
  }

  throw new AuthError(
    "AUTH_REQUIRED",
    "No client credentials found. Place client_secret.json in ~/.config/gcal-cli/ or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
  );
}

export async function getClientCredentialsOrPrompt(
  fs: AuthFsAdapter,
  write: (msg: string) => void,
  promptFn: PromptFn,
): Promise<ClientCredentials> {
  try {
    return getClientCredentials(fs);
  } catch (err) {
    if (!(err instanceof AuthError)) {
      throw err;
    }
    const { clientId, clientSecret } = await promptForClientCredentials(write, promptFn);
    saveClientCredentials(fs, clientId, clientSecret);
    return {
      clientId,
      clientSecret,
      redirectUri: DEFAULT_REDIRECT_URI,
    };
  }
}

function getCredentialsPath(): string {
  return `${getCredentialsDir()}/credentials.json`;
}

export async function promptForClientCredentials(
  write: (msg: string) => void,
  promptFn: PromptFn,
): Promise<{ clientId: string; clientSecret: string }> {
  write("No client credentials found.");
  write("");
  write("To set up Google Calendar API access:");
  write("  1. Go to https://console.cloud.google.com");
  write("  2. Create a project and enable the Google Calendar API");
  write("  3. Create OAuth 2.0 credentials (Desktop app)");
  write("  4. Copy the Client ID and Client Secret below");
  write("");

  const clientId = (await promptFn("Client ID: ")).trim();
  if (!clientId) {
    throw new AuthError("AUTH_REQUIRED", "Client ID is required.");
  }

  const clientSecret = (await promptFn("Client Secret: ")).trim();
  if (!clientSecret) {
    throw new AuthError("AUTH_REQUIRED", "Client Secret is required.");
  }

  return { clientId, clientSecret };
}

export function saveClientCredentials(
  fs: AuthFsAdapter,
  clientId: string,
  clientSecret: string,
): void {
  const dir = getCredentialsDir();
  fs.mkdirSync(dir, { recursive: true });
  const clientSecretPath = `${dir}/client_secret.json`;
  const data = {
    installed: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [DEFAULT_REDIRECT_URI],
    },
  };
  fs.writeFileSync(clientSecretPath, JSON.stringify(data, null, 2));
  fs.chmodSync(clientSecretPath, 0o600);
}

export function loadTokens(fs: AuthFsAdapter): TokenData | null {
  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(credPath)) as TokenData;
}

export function saveTokens(fs: AuthFsAdapter, tokens: TokenData): void {
  const dir = getCredentialsDir();
  fs.mkdirSync(dir, { recursive: true });
  const credPath = getCredentialsPath();
  fs.writeFileSync(credPath, JSON.stringify(tokens, null, 2));
  fs.chmodSync(credPath, 0o600);
}

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export function isTokenExpired(expiryDate: number): boolean {
  return Date.now() >= expiryDate - EXPIRY_BUFFER_MS;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export async function refreshAccessToken(
  credentials: ClientCredentials,
  tokens: TokenData,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<TokenData> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  });

  const response = await fetchFn(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new AuthError(
      "AUTH_EXPIRED",
      "Failed to refresh access token. Please re-authenticate with `gcal auth`.",
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    token_type: data.token_type,
    expiry_date: Date.now() + data.expires_in * 1000,
  };
}

type OAuth2Client = InstanceType<(typeof google.auth)["OAuth2"]>;

export async function getAuthenticatedClient(
  fs: AuthFsAdapter,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<OAuth2Client> {
  const credentials = getClientCredentials(fs);
  const tokens = loadTokens(fs);

  if (!tokens) {
    throw new AuthError(
      "AUTH_REQUIRED",
      "No stored tokens found. Run `gcal auth` to authenticate.",
    );
  }

  let currentTokens = tokens;

  if (isTokenExpired(tokens.expiry_date)) {
    currentTokens = await refreshAccessToken(credentials, tokens, fetchFn);
    saveTokens(fs, currentTokens);
  }

  const oauth2Client = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri,
  );

  oauth2Client.setCredentials({
    access_token: currentTokens.access_token,
    refresh_token: currentTokens.refresh_token,
    token_type: currentTokens.token_type,
    expiry_date: currentTokens.expiry_date,
  });

  return oauth2Client;
}

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export interface OAuthFlowResult {
  authUrl: string;
  waitForCode: Promise<TokenData>;
  server: http.Server;
}

export async function startOAuthFlow(
  credentials: ClientCredentials,
  fs: AuthFsAdapter,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<OAuthFlowResult> {
  return new Promise((resolve) => {
    const server = http.createServer();

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      // Override redirect_uri with the ephemeral port assigned by the OS.
      // Google OAuth requires the redirect_uri in the token exchange to match
      // the one used when generating the auth URL, so we bind both to this port.
      const redirectUri = `http://localhost:${String(port)}`;

      const oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        redirectUri,
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: OAUTH_SCOPES,
        prompt: "consent",
      });

      const waitForCode = new Promise<TokenData>((resolveCode, rejectCode) => {
        server.on("request", async (req, res) => {
          const url = new URL(req.url ?? "/", `http://localhost:${String(port)}`);
          const code = url.searchParams.get("code");

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<html><body><h1>Error: No authorization code received.</h1></body></html>");
            return;
          }

          try {
            const tokenResponse = await fetchFn(GOOGLE_TOKEN_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                code,
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
              }).toString(),
            });

            if (!tokenResponse.ok) {
              throw new AuthError(
                "AUTH_REQUIRED",
                "Failed to exchange authorization code for tokens.",
              );
            }

            const data = (await tokenResponse.json()) as {
              access_token: string;
              refresh_token: string;
              expires_in: number;
              token_type: string;
            };

            const tokens: TokenData = {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              token_type: data.token_type,
              expiry_date: Date.now() + data.expires_in * 1000,
            };

            saveTokens(fs, tokens);

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              "<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>",
            );

            resolveCode(tokens);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end("<html><body><h1>Authentication failed.</h1></body></html>");
            rejectCode(err);
          }
        });
      });

      resolve({ authUrl, waitForCode, server });
    });
  });
}

export async function revokeTokens(
  fs: AuthFsAdapter,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const tokens = loadTokens(fs);

  if (!tokens) {
    return;
  }

  // Best-effort revocation — delete credentials regardless
  try {
    await fetchFn(`${GOOGLE_REVOKE_URL}?token=${tokens.refresh_token}`, { method: "POST" });
  } catch {
    // Ignore revocation errors
  }

  const credPath = getCredentialsPath();
  if (fs.existsSync(credPath)) {
    fs.unlinkSync(credPath);
  }
}
