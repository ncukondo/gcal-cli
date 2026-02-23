import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AuthFsAdapter, TokenData } from "../lib/auth.ts";
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

    const expiryDate = new Date("2026-01-23T12:00:00Z").getTime();
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

    const expiryDate = new Date("2026-01-23T12:00:00Z").getTime();
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
    expect(json.data.expires_at).toBe("2026-01-23T12:00:00.000Z");
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
