import { google } from "googleapis";
import type { ErrorCode } from "../types/index.ts";

export interface AuthFsAdapter {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string) => string;
  writeFileSync: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive: boolean }) => void;
  unlinkSync: (path: string) => void;
}

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

function getCredentialsPath(): string {
  return `${getCredentialsDir()}/credentials.json`;
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
  fs.writeFileSync(getCredentialsPath(), JSON.stringify(tokens, null, 2));
}

export function isTokenExpired(expiryDate: number): boolean {
  return Date.now() >= expiryDate;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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
