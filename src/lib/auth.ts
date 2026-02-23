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
