import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getClientCredentials, AuthError } from "./auth.ts";
import type { AuthFsAdapter } from "./auth.ts";

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
