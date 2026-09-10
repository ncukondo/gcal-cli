import { describe, it, expect } from "vitest";
import { runCli, runCliJson, hasCredentials, E2E_TIMEOUT } from "./helpers.ts";

const creds = hasCredentials();

interface TaskListJson {
  success: boolean;
  data: { tasks: { due: string | null }[]; count: number };
}

describe.runIf(creds)(
  "E2E: tasks list date shortcuts",
  () => {
    it("tasks list --today -f json returns only tasks due today", async () => {
      // Pin the timezone so "today" is computed the same way here and in the CLI.
      const today = new Date().toISOString().slice(0, 10);
      const { json, result } = await runCliJson("--tz", "UTC", "tasks", "list", "--today");
      expect(result.exitCode).toBe(0);
      const output = json as TaskListJson;
      expect(output.success).toBe(true);
      expect(Array.isArray(output.data.tasks)).toBe(true);
      expect(output.data.count).toBe(output.data.tasks.length);
      // Zero tasks is fine; whatever is returned must be due today.
      for (const task of output.data.tasks) {
        expect(task.due).toBe(today);
      }
    });

    it("tasks list --overdue -f json returns only tasks due today or earlier", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { json, result } = await runCliJson("--tz", "UTC", "tasks", "list", "--overdue");
      expect(result.exitCode).toBe(0);
      const output = json as TaskListJson;
      expect(output.success).toBe(true);
      for (const task of output.data.tasks) {
        expect(task.due).not.toBeNull();
        expect(task.due! <= today).toBe(true);
      }
    });

    it("tasks list --today --due-before is rejected as a conflict", async () => {
      const result = await runCli("tasks", "list", "--today", "--due-before", "2026-01-01");
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("cannot be used with");
    });

    it("tasks list --days 0 is rejected", async () => {
      const result = await runCli("tasks", "list", "--days", "0");
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("--days must be a positive integer");
    });
  },
  E2E_TIMEOUT,
);
