import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AuthFsAdapter, TokenData, PromptFn } from "../lib/auth.ts";
import { ExitCode } from "../types/index.ts";
import { handleAuth, handleAuthStatus, handleAuthLogout, createAuthCommand } from "./auth.ts";

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

function makeTokenData(overrides: Partial<TokenData> = {}): TokenData {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "Bearer",
    expiry_date: Date.now() + 3600_000,
    ...overrides,
  };
}

describe("handleAuth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("invokes OAuth flow when not authenticated", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const mockServer = { close: vi.fn() };
    const mockTokens = makeTokenData();
    const mockStartOAuthFlow = vi.fn().mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/auth?test=1",
      waitForCode: Promise.resolve(mockTokens),
      server: mockServer,
    });

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const openUrl = vi.fn();

    const result = await handleAuth({
      fs,
      format: "text",
      write,
      openUrl,
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
      startOAuthFlowFn: mockStartOAuthFlow,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(output.some((msg) => msg.includes("http"))).toBe(true);
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining("accounts.google.com"));
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("invokes OAuth flow and outputs JSON on success", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const mockServer = { close: vi.fn() };
    const mockTokens = makeTokenData();
    const mockStartOAuthFlow = vi.fn().mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/auth?test=1",
      waitForCode: Promise.resolve(mockTokens),
      server: mockServer,
    });

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const openUrl = vi.fn();

    const result = await handleAuth({
      fs,
      format: "json",
      write,
      openUrl,
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
      startOAuthFlowFn: mockStartOAuthFlow,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const jsonOutput = output.find((msg) => msg.includes("authenticated"));
    expect(jsonOutput).toBeDefined();
    const json = JSON.parse(jsonOutput!);
    expect(json.success).toBe(true);
    expect(json.data.authenticated).toBe(true);
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("handles missing client credentials (text)", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const result = await handleAuth({
      fs,
      format: "text",
      write,
      openUrl: vi.fn(),
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(output.some((msg) => msg.includes("No client credentials found"))).toBe(true);
  });

  it("handles missing client credentials (json)", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const result = await handleAuth({
      fs,
      format: "json",
      write,
      openUrl: vi.fn(),
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });

  it("prompts for credentials when text format and no creds and promptFn provided", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const mockServer = { close: vi.fn() };
    const mockTokens = makeTokenData();
    const mockStartOAuthFlow = vi.fn().mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/auth?test=1",
      waitForCode: Promise.resolve(mockTokens),
      server: mockServer,
    });

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const openUrl = vi.fn();
    const promptFn = vi
      .fn<PromptFn>()
      .mockResolvedValueOnce("prompted-client-id")
      .mockResolvedValueOnce("prompted-client-secret");

    const result = await handleAuth({
      fs,
      format: "text",
      write,
      openUrl,
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
      startOAuthFlowFn: mockStartOAuthFlow,
      promptFn,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(promptFn).toHaveBeenCalledTimes(2);
    // OAuth flow should have been called with the prompted credentials
    expect(mockStartOAuthFlow).toHaveBeenCalled();
    const calledCreds = mockStartOAuthFlow.mock.calls[0]![0];
    expect(calledCreds.clientId).toBe("prompted-client-id");
    expect(calledCreds.clientSecret).toBe("prompted-client-secret");
  });

  it("does NOT prompt when JSON format even if promptFn provided", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const fs = makeFsAdapter();
    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };
    const promptFn = vi.fn<PromptFn>();

    const result = await handleAuth({
      fs,
      format: "json",
      write,
      openUrl: vi.fn(),
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
      promptFn,
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(promptFn).not.toHaveBeenCalled();
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });

  it("shows status when already authenticated", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const tokens = makeTokenData();
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";
    const clientPath = "/home/testuser/.config/gcal-cli/client_secret.json";
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath || path === clientPath,
      readFileSync: (path: string) => {
        if (path === clientPath) return clientSecretJson;
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: "user@example.com" }),
    });

    const result = await handleAuth({
      fs,
      format: "text",
      write,
      openUrl: vi.fn(),
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(output.some((msg) => msg.includes("Authenticated"))).toBe(true);
  });
});

describe("handleAuthStatus", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("outputs text format with email and token expiry", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const expiryDate = Date.now() + 3600_000;
    const tokens = makeTokenData({ expiry_date: expiryDate });
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";
    const clientPath = "/home/testuser/.config/gcal-cli/client_secret.json";
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath || path === clientPath,
      readFileSync: (path: string) => {
        if (path === clientPath) return clientSecretJson;
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: "user@example.com" }),
    });

    const result = await handleAuthStatus({
      fs,
      format: "text",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toContain("Authenticated as: user@example.com");
    expect(text).toContain("Token expires:");
  });

  it("outputs JSON with authenticated, email, and expires_at", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const expiryDate = Date.now() + 3600_000;
    const tokens = makeTokenData({ expiry_date: expiryDate });
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";
    const clientPath = "/home/testuser/.config/gcal-cli/client_secret.json";
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath || path === clientPath,
      readFileSync: (path: string) => {
        if (path === clientPath) return clientSecretJson;
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: "user@example.com" }),
    });

    const result = await handleAuthStatus({
      fs,
      format: "json",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(true);
    expect(json.data.authenticated).toBe(true);
    expect(json.data.email).toBe("user@example.com");
    expect(json.data.expires_at).toBe(new Date(expiryDate).toISOString());
  });

  it("refreshes expired token and displays updated email and expiry", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const expiredDate = Date.now() - 3600_000; // 1 hour ago
    const newExpiryDate = Date.now() + 3600_000; // 1 hour from now
    const tokens = makeTokenData({ expiry_date: expiredDate });
    const refreshedTokens = makeTokenData({
      access_token: "refreshed-access-token",
      expiry_date: newExpiryDate,
    });

    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";
    const clientPath = "/home/testuser/.config/gcal-cli/client_secret.json";
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    let savedTokens: string | undefined;
    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath || path === clientPath,
      readFileSync: (path: string) => {
        if (path === clientPath) return clientSecretJson;
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
      writeFileSync: (_path: string, data: string) => {
        savedTokens = data;
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: refreshedTokens.access_token,
              expires_in: 3600,
              token_type: "Bearer",
            }),
        });
      }
      // userinfo endpoint
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ email: "refreshed@example.com" }),
      });
    });

    const result = await handleAuthStatus({
      fs,
      format: "text",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
      cachedTokens: tokens,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toContain("Authenticated as: refreshed@example.com");
    // Should have saved refreshed tokens
    expect(savedTokens).toBeDefined();
    const parsed = JSON.parse(savedTokens!);
    expect(parsed.access_token).toBe("refreshed-access-token");
  });

  it("continues gracefully when token refresh fails", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const expiredDate = Date.now() - 3600_000;
    const tokens = makeTokenData({ expiry_date: expiredDate });

    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";
    const clientPath = "/home/testuser/.config/gcal-cli/client_secret.json";
    const clientSecretJson = JSON.stringify({
      installed: {
        client_id: "test-client-id",
        client_secret: "test-client-secret",
        redirect_uris: ["http://localhost"],
      },
    });

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath || path === clientPath,
      readFileSync: (path: string) => {
        if (path === clientPath) return clientSecretJson;
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve({ ok: false, status: 401 });
      }
      // userinfo with expired token will fail
      return Promise.resolve({
        ok: false,
        status: 401,
      });
    });

    const result = await handleAuthStatus({
      fs,
      format: "text",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
      cachedTokens: tokens,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const text = output.join("\n");
    expect(text).toContain("Authenticated as: unknown");
    expect(text).toContain("Run `gcal auth --logout` then `gcal auth` to re-authenticate");
  });

  it("shows re-auth hint in JSON when email is unavailable", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const tokens = makeTokenData();
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath,
      readFileSync: (path: string) => {
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    const result = await handleAuthStatus({
      fs,
      format: "json",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
      cachedTokens: tokens,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const json = JSON.parse(output.join(""));
    expect(json.data.email).toBeNull();
    expect(json.data.hint).toContain("re-authenticate");
  });

  it("outputs error when not authenticated (text)", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const fs = makeFsAdapter();

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const result = await handleAuthStatus({
      fs,
      format: "text",
      write,
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(output.some((msg) => msg.includes("Not authenticated"))).toBe(true);
  });

  it("outputs error when not authenticated (json)", async () => {
    vi.stubEnv("HOME", "/home/testuser");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");

    const fs = makeFsAdapter();

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const result = await handleAuthStatus({
      fs,
      format: "json",
      write,
      fetchFn: vi.fn() as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.AUTH);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("AUTH_REQUIRED");
  });
});

describe("handleAuthLogout", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes credentials and outputs confirmation (text)", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const tokens = makeTokenData();
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";

    let deletedPath = "";
    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath,
      readFileSync: (path: string) => {
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
      unlinkSync: (path: string) => {
        deletedPath = path;
      },
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await handleAuthLogout({
      fs,
      format: "text",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(deletedPath).toBe(credPath);
    expect(output.some((msg) => msg.includes("Logged out"))).toBe(true);
  });

  it("removes credentials and outputs confirmation (json)", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const tokens = makeTokenData();
    const credPath = "/home/testuser/.config/gcal-cli/credentials.json";

    const fs = makeFsAdapter({
      existsSync: (path: string) => path === credPath,
      readFileSync: (path: string) => {
        if (path === credPath) return JSON.stringify(tokens);
        throw new Error(`File not found: ${path}`);
      },
      unlinkSync: () => {},
    });

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await handleAuthLogout({
      fs,
      format: "json",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(true);
    expect(json.data.logged_out).toBe(true);
  });

  it("handles case when not authenticated (text)", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const fs = makeFsAdapter();

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn();

    const result = await handleAuthLogout({
      fs,
      format: "text",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(output.some((msg) => msg.includes("Not authenticated"))).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles case when not authenticated (json)", async () => {
    vi.stubEnv("HOME", "/home/testuser");

    const fs = makeFsAdapter();

    const output: string[] = [];
    const write = (msg: string) => {
      output.push(msg);
    };

    const mockFetch = vi.fn();

    const result = await handleAuthLogout({
      fs,
      format: "json",
      write,
      fetchFn: mockFetch as unknown as typeof globalThis.fetch,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const json = JSON.parse(output.join(""));
    expect(json.success).toBe(true);
    expect(json.data.logged_out).toBe(false);
    expect(json.data.message).toBe("Not authenticated.");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("createAuthCommand", () => {
  it("creates a commander command named 'auth'", () => {
    const cmd = createAuthCommand();
    expect(cmd.name()).toBe("auth");
  });

  it("has --status option", () => {
    const cmd = createAuthCommand();
    const statusOpt = cmd.options.find((o) => o.long === "--status");
    expect(statusOpt).toBeDefined();
  });

  it("has --logout option", () => {
    const cmd = createAuthCommand();
    const logoutOpt = cmd.options.find((o) => o.long === "--logout");
    expect(logoutOpt).toBeDefined();
  });
});
