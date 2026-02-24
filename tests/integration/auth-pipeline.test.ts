import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getClientCredentials,
  loadTokens,
  getAuthenticatedClient,
  AuthError,
  type AuthFsAdapter,
  type TokenData,
} from "../../src/lib/auth.ts";

function createAuthFs(files: Record<string, string> = {}): AuthFsAdapter {
  return {
    existsSync: vi.fn().mockImplementation((p: string) => p in files),
    readFileSync: vi.fn().mockImplementation((p: string) => {
      if (p in files) return files[p];
      throw new Error(`File not found: ${p}`);
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    chmodSync: vi.fn(),
  };
}

const CLIENT_SECRET_PATH = "/home/test/.config/gcal-cli/client_secret.json";
const CREDENTIALS_PATH = "/home/test/.config/gcal-cli/credentials.json";

const CLIENT_SECRET_JSON = JSON.stringify({
  installed: {
    client_id: "test-client-id",
    client_secret: "test-client-secret",
    redirect_uris: ["http://localhost"],
  },
});

function makeTokens(overrides: Partial<TokenData> = {}): TokenData {
  return {
    access_token: "valid-access-token",
    refresh_token: "valid-refresh-token",
    token_type: "Bearer",
    expiry_date: Date.now() + 3600 * 1000, // 1 hour from now
    ...overrides,
  };
}

describe("auth flow + API client creation integration", () => {
  beforeEach(() => {
    vi.stubEnv("HOME", "/home/test");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getClientCredentials reads client_secret.json and returns credentials", () => {
    const fs = createAuthFs({ [CLIENT_SECRET_PATH]: CLIENT_SECRET_JSON });
    const creds = getClientCredentials(fs);

    expect(creds.clientId).toBe("test-client-id");
    expect(creds.clientSecret).toBe("test-client-secret");
    expect(creds.redirectUri).toBe("http://localhost");
  });

  it("getClientCredentials falls back to env vars when no file exists", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "env-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "env-client-secret");
    const fs = createAuthFs();

    const creds = getClientCredentials(fs);

    expect(creds.clientId).toBe("env-client-id");
    expect(creds.clientSecret).toBe("env-client-secret");
  });

  it("getClientCredentials throws AUTH_REQUIRED when no credentials available", () => {
    const fs = createAuthFs();

    expect(() => getClientCredentials(fs)).toThrow(AuthError);
    try {
      getClientCredentials(fs);
    } catch (err) {
      expect((err as AuthError).code).toBe("AUTH_REQUIRED");
    }
  });

  it("loadTokens returns token data from credentials.json", () => {
    const tokens = makeTokens();
    const fs = createAuthFs({ [CREDENTIALS_PATH]: JSON.stringify(tokens) });

    const loaded = loadTokens(fs);

    expect(loaded).toEqual(tokens);
  });

  it("loadTokens returns null when no credentials file exists", () => {
    const fs = createAuthFs();

    expect(loadTokens(fs)).toBeNull();
  });

  it("getAuthenticatedClient returns OAuth2 client with valid tokens", async () => {
    const tokens = makeTokens();
    const fs = createAuthFs({
      [CLIENT_SECRET_PATH]: CLIENT_SECRET_JSON,
      [CREDENTIALS_PATH]: JSON.stringify(tokens),
    });

    const client = await getAuthenticatedClient(fs);

    expect(client).toBeDefined();
    expect(client.credentials.access_token).toBe("valid-access-token");
    expect(client.credentials.refresh_token).toBe("valid-refresh-token");
  });

  it("getAuthenticatedClient refreshes expired tokens and saves them", async () => {
    const expiredTokens = makeTokens({ expiry_date: Date.now() - 1000 });
    const fs = createAuthFs({
      [CLIENT_SECRET_PATH]: CLIENT_SECRET_JSON,
      [CREDENTIALS_PATH]: JSON.stringify(expiredTokens),
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "refreshed-access-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    });

    const client = await getAuthenticatedClient(fs, mockFetch as unknown as typeof fetch);

    expect(client.credentials.access_token).toBe("refreshed-access-token");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify tokens were saved
    expect(fs.writeFileSync).toHaveBeenCalled();
    const savedData = JSON.parse((fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string) as TokenData;
    expect(savedData.access_token).toBe("refreshed-access-token");
    expect(savedData.refresh_token).toBe("valid-refresh-token");
  });

  it("getAuthenticatedClient throws AUTH_REQUIRED when no tokens stored", async () => {
    const fs = createAuthFs({
      [CLIENT_SECRET_PATH]: CLIENT_SECRET_JSON,
    });

    await expect(getAuthenticatedClient(fs)).rejects.toThrow(AuthError);
    try {
      await getAuthenticatedClient(fs);
    } catch (err) {
      expect((err as AuthError).code).toBe("AUTH_REQUIRED");
    }
  });

  it("getAuthenticatedClient throws AUTH_EXPIRED when refresh fails", async () => {
    const expiredTokens = makeTokens({ expiry_date: Date.now() - 1000 });
    const fs = createAuthFs({
      [CLIENT_SECRET_PATH]: CLIENT_SECRET_JSON,
      [CREDENTIALS_PATH]: JSON.stringify(expiredTokens),
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      getAuthenticatedClient(fs, mockFetch as unknown as typeof fetch),
    ).rejects.toThrow(AuthError);
  });
});
