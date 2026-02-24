import { describe, it, expect, afterAll } from "vitest";
import {
  runCli,
  runCliJson,
  testEventTitle,
  todayAt,
  TestCleanup,
  hasCredentials,
} from "./helpers.ts";

describe.runIf(hasCredentials())("E2E: CRUD lifecycle", () => {
  const cleanup = new TestCleanup();

  afterAll(async () => {
    await cleanup.deleteAll();
  });

  const title = testEventTitle("CRUD");
  const updatedTitle = `${title} Updated`;
  let eventId: string;

  it("add creates a real event and returns event ID", async () => {
    const start = todayAt(14);
    const end = todayAt(15);

    const { json, result } = await runCliJson(
      "add",
      "--title",
      title,
      "--start",
      start,
      "--end",
      end,
    );

    expect(result.exitCode).toBe(0);

    const data = json as {
      success: boolean;
      data: { event: { id: string; title: string }; message: string };
    };
    expect(data.success).toBe(true);
    expect(data.data.message).toBe("Event created");
    expect(data.data.event.title).toBe(title);
    expect(data.data.event.id).toBeTruthy();

    eventId = data.data.event.id;
    cleanup.track(eventId);
  });

  it("show displays the created event", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("show", eventId);

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { event: { id: string; title: string } } };
    expect(data.success).toBe(true);
    expect(data.data.event.id).toBe(eventId);
    expect(data.data.event.title).toBe(title);
  });

  it("show displays the created event in text format", async () => {
    expect(eventId).toBeTruthy();

    const result = await runCli("show", eventId);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(title);
  });

  it("list --today includes the created event", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("list", "--today");

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { events: { id: string; title: string }[] } };
    expect(data.success).toBe(true);

    const found = data.data.events.find((e) => e.id === eventId);
    expect(found).toBeTruthy();
    expect(found!.title).toBe(title);
  });

  it("search finds the created event by title", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("search", title);

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { events: { id: string; title: string }[] } };
    expect(data.success).toBe(true);

    const found = data.data.events.find((e) => e.id === eventId);
    expect(found).toBeTruthy();
    expect(found!.title).toBe(title);
  });

  it("update modifies the event title", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("update", eventId, "--title", updatedTitle);

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { event: { id: string; title: string } } };
    expect(data.success).toBe(true);
    expect(data.data.event.title).toBe(updatedTitle);
  });

  it("show reflects the update", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("show", eventId);

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { event: { id: string; title: string } } };
    expect(data.success).toBe(true);
    expect(data.data.event.title).toBe(updatedTitle);
  });

  it("delete removes the event", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("delete", eventId);

    expect(result.exitCode).toBe(0);

    const data = json as { success: boolean; data: { deleted_id: string } };
    expect(data.success).toBe(true);
    expect(data.data.deleted_id).toBe(eventId);
  });

  it("show returns NOT_FOUND after deletion", async () => {
    expect(eventId).toBeTruthy();

    const { json, result } = await runCliJson("show", eventId);

    expect(result.exitCode).not.toBe(0);

    const data = json as { success: boolean; error: { code: string } };
    expect(data.success).toBe(false);
    expect(data.error.code).toBe("NOT_FOUND");
  });
});
