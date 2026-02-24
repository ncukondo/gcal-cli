import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getClientCredentials,
  getClientCredentialsOrPrompt,
  loadTokens,
  saveTokens,
  saveClientCredentials,
  promptForClientCredentials,
  isTokenExpired,
  refreshAccessToken,
  getAuthenticatedClient,
  startOAuthFlow,
  revokeTokens,
  AuthError,
} from "./auth.ts";
import type { AuthFsAdapter, TokenData, ClientCredentials, PromptFn } from "./auth.ts";

function makeFsAdapter(overrides: Partial<AuthFsAdapter> = {}): AuthFsAdapter {
  return {
    existsSync: () => false,
    readFileSync: () => {
      throw new Error("File not found");
    },
    writeFileSync: () => {},
    mkdirSync: () => {},
    unlinkSync: () => {},
    chmodSync: () => {},
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
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/client_secret.json",
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
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/client_secret.json",
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
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/credentials.json",
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

  it("writes token data to credentials file with 0o600 permissions", () => {
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
    let chmodPath = "";
    let chmodMode = 0;
    const fs = makeFsAdapter({
      mkdirSync: (path: string) => {
        mkdirPath = path;
      },
      writeFileSync: (path: string, data: string) => {
        writtenPath = path;
        writtenData = data;
      },
      chmodSync: (path: string, mode: number) => {
        chmodPath = path;
        chmodMode = mode;
      },
    });

    saveTokens(fs, tokenData);

    expect(mkdirPath).toBe("/home/testuser/.config/gcal-cli");
    expect(writtenPath).toBe("/home/testuser/.config/gcal-cli/credentials.json");
    expect(JSON.parse(writtenData)).toEqual(tokenData);
    expect(chmodPath).toBe("/home/testuser/.config/gcal-cli/credentials.json");
    expect(chmodMode).toBe(0o600);
  });
});

describe("saveClientCredentials", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes correct JSON format with installed.client_id and installed.client_secret", () => {
    vi.stubEnv("HOME", "/home/testuser");

    let writtenPath = "";
    let writtenData = "";
    let mkdirPath = "";
    let chmodPath = "";
    let chmodMode = 0;
    const fs = makeFsAdapter({
      mkdirSync: (path: string) => {
        mkdirPath = path;
      },
      writeFileSync: (path: string, data: string) => {
        writtenPath = path;
        writtenData = data;
      },
      chmodSync: (path: string, mode: number) => {
        chmodPath = path;
        chmodMode = mode;
      },
    });

    saveClientCredentials(fs, "my-client-id", "my-client-secret");

    expect(mkdirPath).toBe("/home/testuser/.config/gcal-cli");
    expect(writtenPath).toBe("/home/testuser/.config/gcal-cli/client_secret.json");
    const parsed = JSON.parse(writtenData);
    expect(parsed).toEqual({
      installed: {
        client_id: "my-client-id",
        client_secret: "my-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });
    expect(chmodPath).toBe("/home/testuser/.config/gcal-cli/client_secret.json");
    expect(chmodMode).toBe(0o600);
  });
});

describe("promptForClientCredentials", () => {
  it("returns trimmed clientId and clientSecret", async () => {
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const promptFn: PromptFn = vi
      .fn<PromptFn>()
      .mockResolvedValueOnce("  my-client-id  ")
      .mockResolvedValueOnce("  my-client-secret  ");

    const result = await promptForClientCredentials(write, promptFn);

    expect(result.clientId).toBe("my-client-id");
    expect(result.clientSecret).toBe("my-client-secret");
  });

  it("shows Google Cloud Console guidance", async () => {
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const promptFn: PromptFn = vi
      .fn<PromptFn>()
      .mockResolvedValueOnce("id")
      .mockResolvedValueOnce("secret");

    await promptForClientCredentials(write, promptFn);

    const text = output.join("\n");
    expect(text).toContain("console.cloud.google.com");
  });

  it("throws on empty client_id", async () => {
    const write = vi.fn();
    const promptFn: PromptFn = vi.fn<PromptFn>().mockResolvedValueOnce("   ");

    await expect(promptForClientCredentials(write, promptFn)).rejects.toThrow(AuthError);
    try {
      const pf: PromptFn = vi.fn<PromptFn>().mockResolvedValueOnce("");
      await promptForClientCredentials(write, pf);
    } catch (e) {
      expect((e as AuthError).code).toBe("AUTH_REQUIRED");
    }
  });

  it("throws on empty client_secret", async () => {
    const write = vi.fn();
    const promptFn: PromptFn = vi
      .fn<PromptFn>()
      .mockResolvedValueOnce("valid-id")
      .mockResolvedValueOnce("   ");

    await expect(promptForClientCredentials(write, promptFn)).rejects.toThrow(AuthError);
  });
});

describe("getClientCredentialsOrPrompt", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns existing credentials without prompting", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "env-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "env-secret");

    const fs = makeFsAdapter();
    const write = vi.fn();
    const promptFn = vi.fn<PromptFn>();

    const result = await getClientCredentialsOrPrompt(fs, write, promptFn);

    expect(result.clientId).toBe("env-id");
    expect(result.clientSecret).toBe("env-secret");
    expect(promptFn).not.toHaveBeenCalled();
  });

  it("prompts and saves when no credentials exist", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    let writtenData = "";
    const fs = makeFsAdapter({
      writeFileSync: (_path: string, data: string) => {
        writtenData = data;
      },
    });
    const write = vi.fn();
    const promptFn = vi
      .fn<PromptFn>()
      .mockResolvedValueOnce("prompted-id")
      .mockResolvedValueOnce("prompted-secret");

    const result = await getClientCredentialsOrPrompt(fs, write, promptFn);

    expect(result.clientId).toBe("prompted-id");
    expect(result.clientSecret).toBe("prompted-secret");
    expect(result.redirectUri).toBe("http://localhost");
    expect(promptFn).toHaveBeenCalledTimes(2);
    // Verify credentials were saved
    const saved = JSON.parse(writtenData);
    expect(saved.installed.client_id).toBe("prompted-id");
  });

  it("propagates non-AuthError", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const fs = makeFsAdapter({
      existsSync: () => {
        throw new Error("filesystem error");
      },
    });
    const write = vi.fn();
    const promptFn = vi.fn<PromptFn>();

    await expect(getClientCredentialsOrPrompt(fs, write, promptFn)).rejects.toThrow(
      "filesystem error",
    );
    expect(promptFn).not.toHaveBeenCalled();
  });
});

describe("isTokenExpired", () => {
  it("returns true when expiry_date is in the past", () => {
    const pastDate = Date.now() - 60_000;
    expect(isTokenExpired(pastDate)).toBe(true);
  });

  it("returns true when expiry_date is within the 5-minute buffer", () => {
    const almostExpired = Date.now() + 2 * 60 * 1000; // 2 minutes from now
    expect(isTokenExpired(almostExpired)).toBe(true);
  });

  it("returns false when expiry_date is beyond the 5-minute buffer", () => {
    const futureDate = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    expect(isTokenExpired(futureDate)).toBe(false);
  });
});

function makeCredentials(overrides: Partial<ClientCredentials> = {}): ClientCredentials {
  return {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost",
    ...overrides,
  };
}

function makeTokenData(overrides: Partial<TokenData> = {}): TokenData {
  return {
    access_token: "old-access-token",
    refresh_token: "test-refresh-token",
    token_type: "Bearer",
    expiry_date: Date.now() - 60_000,
    ...overrides,
  };
}

describe("refreshAccessToken", () => {
  it("calls Google token endpoint and returns updated tokens", async () => {
    const credentials = makeCredentials();
    const tokens = makeTokenData();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    });

    const result = await refreshAccessToken(
      credentials,
      tokens,
      mockFetch as unknown as typeof globalThis.fetch,
    );

    expect(result.access_token).toBe("new-access-token");
    expect(result.refresh_token).toBe("test-refresh-token");
    expect(result.token_type).toBe("Bearer");
    expect(result.expiry_date).toBeGreaterThan(Date.now() - 1000);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("throws AUTH_EXPIRED when refresh fails", async () => {
    const credentials = makeCredentials();
    const tokens = makeTokenData();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: "invalid_grant",
          error_description: "Token has been revoked.",
        }),
    });

    await expect(
      refreshAccessToken(credentials, tokens, mockFetch as unknown as typeof globalThis.fetch),
    ).rejects.toThrow(AuthError);

    try {
      await refreshAccessToken(
        credentials,
        tokens,
        mockFetch as unknown as typeof globalThis.fetch,
      );
    } catch (e) {
      expect((e as AuthError).code).toBe("AUTH_EXPIRED");
    }
  });
});

describe("getAuthenticatedClient", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns OAuth2 client with valid token", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const validTokens = makeTokenData({
      access_token: "valid-access-token",
      expiry_date: Date.now() + 3600_000,
    });
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) =>
        path === "/home/testuser/.config/gcal-cli/client_secret.json" ||
        path === "/home/testuser/.config/gcal-cli/credentials.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/client_secret.json") {
          return clientSecretJson;
        }
        if (path === "/home/testuser/.config/gcal-cli/credentials.json") {
          return JSON.stringify(validTokens);
        }
        throw new Error(`File not found: ${path}`);
      },
    });

    const client = await getAuthenticatedClient(fs);
    expect(client).toBeDefined();
    expect(client.credentials.access_token).toBe("valid-access-token");
  });

  it("auto-refreshes expired token", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const expiredTokens = makeTokenData({
      access_token: "expired-access-token",
      expiry_date: Date.now() - 60_000,
    });
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    let savedData = "";
    const fs = makeFsAdapter({
      existsSync: (path: string) =>
        path === "/home/testuser/.config/gcal-cli/client_secret.json" ||
        path === "/home/testuser/.config/gcal-cli/credentials.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/client_secret.json") {
          return clientSecretJson;
        }
        if (path === "/home/testuser/.config/gcal-cli/credentials.json") {
          return JSON.stringify(expiredTokens);
        }
        throw new Error(`File not found: ${path}`);
      },
      writeFileSync: (_path: string, data: string) => {
        savedData = data;
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "refreshed-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    });

    const client = await getAuthenticatedClient(
      fs,
      mockFetch as unknown as typeof globalThis.fetch,
    );
    expect(client.credentials.access_token).toBe("refreshed-access-token");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(savedData).toBeTruthy();
    expect(JSON.parse(savedData).access_token).toBe("refreshed-access-token");
  });

  it("throws AUTH_REQUIRED when neither client_secret.json nor env vars exist", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const fs = makeFsAdapter();

    await expect(getAuthenticatedClient(fs)).rejects.toThrow(AuthError);
    try {
      await getAuthenticatedClient(fs);
    } catch (e) {
      expect((e as AuthError).code).toBe("AUTH_REQUIRED");
    }
  });

  it("throws AUTH_REQUIRED when no tokens exist", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/client_secret.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/client_secret.json") {
          return clientSecretJson;
        }
        throw new Error(`File not found: ${path}`);
      },
    });

    await expect(getAuthenticatedClient(fs)).rejects.toThrow(AuthError);
  });
});

describe("startOAuthFlow", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts local server and generates auth URL", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const credentials = makeCredentials();

    let savedData = "";
    const fs = makeFsAdapter({
      writeFileSync: (_path: string, data: string) => {
        savedData = data;
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
    });

    const { authUrl, waitForCode, server } = await startOAuthFlow(
      credentials,
      fs,
      mockFetch as unknown as typeof globalThis.fetch,
    );

    try {
      expect(authUrl).toContain("accounts.google.com");
      expect(authUrl).toContain("client_id=test-client-id");
      expect(authUrl).toContain("calendar.readonly");
      expect(server).toBeDefined();

      // Simulate callback with auth code
      const port = server.address();
      const addr = typeof port === "object" && port !== null ? port.port : 0;
      const callbackUrl = `http://localhost:${String(addr)}?code=test-auth-code`;

      // Fetch the callback URL to trigger the code exchange
      const callbackResponse = await globalThis.fetch(callbackUrl);
      expect(callbackResponse.ok).toBe(true);

      const tokens = await waitForCode;
      expect(tokens.access_token).toBe("new-access-token");
      expect(tokens.refresh_token).toBe("new-refresh-token");
      expect(savedData).toBeTruthy();
    } finally {
      server.close();
    }
  });
});

describe("revokeTokens", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls revocation endpoint with refresh_token and deletes credentials file", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const tokens = makeTokenData({ refresh_token: "refresh-token-to-revoke" });

    let deletedPath = "";
    const fs = makeFsAdapter({
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/credentials.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/credentials.json") {
          return JSON.stringify(tokens);
        }
        throw new Error(`File not found: ${path}`);
      },
      unlinkSync: (path: string) => {
        deletedPath = path;
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });

    await revokeTokens(fs, mockFetch as unknown as typeof globalThis.fetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchUrl = mockFetch.mock.calls[0]![0] as string;
    expect(fetchUrl).toContain("oauth2.googleapis.com/revoke");
    expect(fetchUrl).toContain("token=refresh-token-to-revoke");
    expect(deletedPath).toBe("/home/testuser/.config/gcal-cli/credentials.json");
  });

  it("deletes credentials even when revocation endpoint fails", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const tokens = makeTokenData();

    let deletedPath = "";
    const fs = makeFsAdapter({
      existsSync: (path: string) => path === "/home/testuser/.config/gcal-cli/credentials.json",
      readFileSync: (path: string) => {
        if (path === "/home/testuser/.config/gcal-cli/credentials.json") {
          return JSON.stringify(tokens);
        }
        throw new Error(`File not found: ${path}`);
      },
      unlinkSync: (path: string) => {
        deletedPath = path;
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });

    await revokeTokens(fs, mockFetch as unknown as typeof globalThis.fetch);

    expect(deletedPath).toBe("/home/testuser/.config/gcal-cli/credentials.json");
  });

  it("succeeds silently when no tokens exist", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    const fs = makeFsAdapter();
    const mockFetch = vi.fn();

    await revokeTokens(fs, mockFetch as unknown as typeof globalThis.fetch);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
