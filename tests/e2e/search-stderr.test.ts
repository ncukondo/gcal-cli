import { describe, it, expect } from "vitest";
import { runCli, hasCredentials } from "./helpers.ts";

const creds = hasCredentials();

describe.runIf(creds)("E2E: search stderr feedback", () => {
  it("gcal search outputs search range and hint to stderr", async () => {
    const result = await runCli("search", "test");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/Searching: \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
    expect(result.stderr).toContain(
      "Tip: Use --days <n> or --from/--to to change the search range.",
    );
  });

  it("gcal search --days -30 outputs past 30 days search range to stderr", async () => {
    const result = await runCli("search", "test", "--days", "-30");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/Searching: \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
    // Hint should NOT appear when --days is explicitly specified
    expect(result.stderr).not.toContain("Tip:");
  });
});
