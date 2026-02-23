import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getClientCredentials, loadTokens, saveTokens, AuthError } from "./auth.ts";
import type { AuthFsAdapter, TokenData } from "./auth.ts";

function makeFsAdapter(overrides: Partial<AuthFsAdapter> = {}): AuthFsAdapter {
  return {
    existsSync: () => false,
    readFileSync: () => {
      throw new Error("File not found");
    },
    writeFileSync: () => {},
    mkdirSync: () => {},
    unlinkSync: () => {},
    ...overrides,
  };
}

describe("getClientCredentials", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads client credentials from client_secret.json file", () => {
    vi.stubEnv("HOME", "/home/testuser");
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "file-client-id",
        client_secret: "file-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });
    const fs = makeFsAdapter({
      existsSync: (path: string) =>
        path === "/home/testuser/.config/gcal-cli/client_secret.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/client_secret.json") {
          return clientSecretJson;
        }
        throw new Error(`File not found: ${path}`);
      },
    });

    const result = getClientCredentials(fs);
    expect(result).toEqual({
      clientId: "file-client-id",
      clientSecret: "file-client-secret",
      redirectUri: "http://localhost",
    });
  });

  it("falls back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars", () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "env-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "env-client-secret");
    const fs = makeFsAdapter();

    const result = getClientCredentials(fs);
    expect(result).toEqual({
      clientId: "env-client-id",
      clientSecret: "env-client-secret",
      redirectUri: "http://localhost",
    });
  });

  it("throws AUTH_REQUIRED when neither source exists", () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const fs = makeFsAdapter();

    expect(() => getClientCredentials(fs)).toThrow(AuthError);
    try {
      getClientCredentials(fs);
    } catch (e) {
      expect((e as AuthError).code).toBe("AUTH_REQUIRED");
    }
  });

  it("prefers client_secret.json over env vars", () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "env-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "env-client-secret");
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "file-client-id",
        client_secret: "file-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });
    const fs = makeFsAdapter({
      existsSync: (path: string) =>
        path === "/home/testuser/.config/gcal-cli/client_secret.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/client_secret.json") {
          return clientSecretJson;
        }
        throw new Error(`File not found: ${path}`);
      },
    });

    const result = getClientCredentials(fs);
    expect(result.clientId).toBe("file-client-id");
  });
});

describe("loadTokens", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads tokens from credentials.json", () => {
    vi.stubEnv("HOME", "/home/testuser");
    const tokenData: TokenData = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      token_type: "Bearer",
      expiry_date: 1706000000000,
    };
    const fs = makeFsAdapter({
      existsSync: (path: string) =>
        path === "/home/testuser/.config/gcal-cli/credentials.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/credentials.json") {
          return JSON.stringify(tokenData);
        }
        throw new Error(`File not found: ${path}`);
      },
    });

    const result = loadTokens(fs);
    expect(result).toEqual(tokenData);
  });

  it("returns null when no credentials file exists", () => {
    vi.stubEnv("HOME", "/home/testuser");
    const fs = makeFsAdapter();

    const result = loadTokens(fs);
    expect(result).toBeNull();
  });
});

describe("saveTokens", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes token data to credentials file", () => {
    vi.stubEnv("HOME", "/home/testuser");
    const tokenData: TokenData = {
      access_token: "access-123",
      refresh_token: "refresh-456",
      token_type: "Bearer",
      expiry_date: 1706000000000,
    };

    let writtenPath = "";
    let writtenData = "";
    let mkdirPath = "";
    const fs = makeFsAdapter({
      mkdirSync: (path: string) => {
        mkdirPath = path;
      },
      writeFileSync: (path: string, data: string) => {
        writtenPath = path;
        writtenData = data;
      },
    });

    saveTokens(fs, tokenData);

    expect(mkdirPath).toBe("/home/testuser/.config/gcal-cli");
    expect(writtenPath).toBe(
      "/home/testuser/.config/gcal-cli/credentials.json",
    );
    expect(JSON.parse(writtenData)).toEqual(tokenData);
  });
});
