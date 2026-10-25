import "fake-indexeddb/auto";
import Dexie from "dexie";
/// <reference types="node" />
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDataBackup, importDataBackup } from "./backup";
import { db } from "./db";

function blobAsFile(blob: Blob): File {
  return {
    size: blob.size,
    text: () => blob.text(),
  } as File;
}

describe("local data safety", () => {
  beforeEach(async () => {
    vi.stubGlobal("Blob", NodeBlob);
    localStorage.clear();
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("preserves existing v2 rows while adding later object stores", async () => {
    const legacy = new Dexie("KxnoDesk");
    legacy.version(1).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
    });
    legacy.version(2).stores({
      subjects: "id, name",
      teachers: "id, name",
      timetable: "id, weekday, subjectId, teacherId, weekType",
      exceptions: "id, date, type, entryId",
      settings: "key",
      aiPresets: "id, name",
      aiConversations: "id, updatedAt",
      aiMessages: "id, conversationId, createdAt",
    });
    await legacy.table("subjects").add({ id: "preserved-subject", name: "Local subject", color: "#8190a0" });
    await legacy.table("settings").add({ key: "profileName", value: "Local profile" });
    legacy.close();

    await db.open();

    expect(await db.subjects.get("preserved-subject")).toMatchObject({ name: "Local subject", color: "#8190a0" });
    expect(await db.settings.get("profileName")).toEqual({ key: "profileName", value: "Local profile" });
    expect(await db.tasks.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
    expect(await db.aiAttachments.count()).toBe(0);
    expect(db.verno).toBe(4);
  });

  it("exports data and merges without overwriting colliding local records", async () => {
    await db.open();
    localStorage.setItem("kxnodesk-language", "de");
    localStorage.setItem("kxnodesk-ui", JSON.stringify({ state: { appearance: { accent: "#112233" } }, version: 3 }));
    await db.tasks.add({
      id: "task-one",
      title: "Original title",
      description: "",
      dueDate: "2026-06-01",
      priority: "normal",
      category: "Homework",
      tags: [],
      subtasks: [],
      completed: false,
      createdAt: 100,
      updatedAt: 100,
    });
    await db.notes.add({
      id: "note-one",
      title: "Backup note",
      content: "Local note content",
      folder: "General",
      pinned: false,
      createdAt: 101,
      updatedAt: 101,
    });
    await db.aiConversations.add({ id: "conversation-one", title: "Attachment conversation", updatedAt: 102, presetId: "study-assistant" });
    await db.aiMessages.add({
      id: "message-one",
      conversationId: "conversation-one",
      role: "user",
      content: "Explain this image",
      createdAt: 102,
    });
    await db.aiAttachments.add({
      id: "attachment-one",
      messageId: "message-one",
      name: "diagram.png",
      mimeType: "image/png",
      size: 8,
      blob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }),
      createdAt: 103,
    });
    await db.settings.bulkPut([
      { key: "aiCloudConsent", value: "true" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "focusTimerState", value: "runtime-only" },
    ]);
    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await blobAsFile(backup).text()) as { data: { settings: Array<{ key: string }> } };
    expect(snapshot.data.settings.some((setting) => ["aiCloudConsent", "aiCloudEnabled", "focusTimerState"].includes(setting.key))).toBe(false);
    await db.aiAttachments.delete("attachment-one");
    await db.tasks.update("task-one", { title: "Keep this local title" });
    await db.notes.delete("note-one");
    localStorage.clear();

    const result = await importDataBackup(blobAsFile(backup));

    expect(result.tasks).toEqual({ added: 0, skipped: 1 });
    expect(result.notes).toEqual({ added: 1, skipped: 0 });
    expect(result.preferences).toEqual({ added: 2, skipped: 0 });
    expect(await db.tasks.get("task-one")).toMatchObject({ title: "Keep this local title" });
    expect(await db.notes.get("note-one")).toMatchObject({ content: "Local note content" });
    expect(result.aiAttachments).toEqual({ added: 1, skipped: 0 });
    const restoredAttachment = await db.aiAttachments.get("attachment-one");
    expect(restoredAttachment?.blob.type).toBe("image/png");
    expect([...new Uint8Array(await restoredAttachment!.blob.arrayBuffer())]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");
    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#112233");
  });
});
