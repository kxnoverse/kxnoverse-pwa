import "fake-indexeddb/auto";
import Dexie from "dexie";
/// <reference types="node" />
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDataBackup, importDataBackup } from "./backup";
import { db } from "./db";
import { defaultAppearance } from "../stores/ui-store";

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
    expect(db.verno).toBe(5);
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
    await db.arcadeData.add({ id: "favorites", value: '["2048"]', updatedAt: 104 });
    await db.arcadeData.add({ id: "calculator:history", value: '[{"id":"calc-1","expression":"2+2","result":4,"createdAt":105}]', updatedAt: 105 });
    await db.settings.bulkPut([
      { key: "aiCloudConsent", value: "true" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "focusTimerState", value: "runtime-only" },
      { key: "regionalCalendar:NW:2026:de", value: "cached-data" },
    ]);
    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await blobAsFile(backup).text()) as { data: { settings: Array<{ key: string }>; arcadeData: Array<{ id: string }> } };
    expect(snapshot.data.settings.some((setting) => ["aiCloudConsent", "aiCloudEnabled", "focusTimerState", "regionalCalendar:NW:2026:de"].includes(setting.key))).toBe(false);
    expect(snapshot.data.arcadeData).toContainEqual(expect.objectContaining({ id: "favorites" }));
    expect(snapshot.data.arcadeData).toContainEqual(expect.objectContaining({ id: "calculator:history" }));
    await db.aiAttachments.delete("attachment-one");
    await db.tasks.update("task-one", { title: "Keep this local title" });
    await db.notes.delete("note-one");
    await db.arcadeData.delete("favorites");
    await db.arcadeData.delete("calculator:history");
    localStorage.clear();

    const result = await importDataBackup(blobAsFile(backup));

    expect(result.tasks).toEqual({ added: 0, skipped: 1 });
    expect(result.notes).toEqual({ added: 1, skipped: 0 });
    expect(result.preferences).toEqual({ added: 2, skipped: 0 });
    expect(await db.tasks.get("task-one")).toMatchObject({ title: "Keep this local title" });
    expect(await db.notes.get("note-one")).toMatchObject({ content: "Local note content" });
    expect(result.aiAttachments).toEqual({ added: 1, skipped: 0 });
    expect(result.arcadeData).toEqual({ added: 2, skipped: 0 });
    expect(await db.arcadeData.get("favorites")).toMatchObject({ value: '["2048"]' });
    expect(await db.arcadeData.get("calculator:history")).toMatchObject({
      value: '[{"id":"calc-1","expression":"2+2","result":4,"createdAt":105}]',
    });
    const restoredAttachment = await db.aiAttachments.get("attachment-one");
    expect(restoredAttachment?.blob.type).toBe("image/png");
    expect([...new Uint8Array(await restoredAttachment!.blob.arrayBuffer())]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");
    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#112233");
  });

  it("round-trips productivity data, local files, theme preferences, and all game save records", async () => {
    await db.open();
    await db.subjects.add({ id: "subject", name: "Biology", color: "#347ab4" });
    await db.teachers.add({ id: "teacher", name: "Teacher", subjectIds: ["subject"] });
    await db.timetable.add({
      id: "lesson",
      weekday: 1,
      start: "09:00",
      end: "09:45",
      weekType: "all",
      kind: "lesson",
      subjectId: "subject",
      teacherId: "teacher",
      room: "A1",
    });
    await db.exceptions.add({ id: "day-off", date: "2026-10-26", type: "holiday" });
    await db.settings.add({ key: "schoolState", value: "NW" });
    await db.tasks.add({
      id: "task",
      title: "Study biology",
      description: "",
      dueDate: "2026-10-26",
      priority: "normal",
      category: "Homework",
      tags: [],
      subtasks: [],
      completed: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.calendarEvents.add({
      id: "exam",
      type: "exam",
      title: "Biology exam",
      description: "",
      startAt: "2026-10-26T09:00:00.000Z",
      endAt: "2026-10-26T10:00:00.000Z",
      allDay: false,
      color: "#347ab4",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.notes.add({
      id: "note",
      title: "Cell structure",
      content: "Mitochondria",
      folder: "Biology",
      subjectId: "subject",
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.focusSessions.add({
      id: "focus",
      kind: "focus",
      startedAt: 1,
      endedAt: 2,
      plannedSeconds: 1,
      durationSeconds: 1,
      completed: true,
    });
    await db.files.add({
      id: "file",
      name: "study.txt",
      type: "text/plain",
      size: 5,
      category: "Biology",
      createdAt: 1,
      modifiedAt: 1,
      blob: new Blob(["notes"], { type: "text/plain" }),
    });
    const gameRecords = [
      { id: "best:2048", value: "2048" },
      { id: "chess:unfinished", value: '{"fen":"saved"}' },
      { id: "chess:stats", value: '{"wins":2,"losses":1,"draws":1}' },
      { id: "track:line-rider:track-one", value: '{"name":"Hill","lines":[]}' },
      { id: "save:idle-clicker", value: '{"resources":100}' },
      { id: "calculator:history", value: '[{"expression":"2+2","result":4}]' },
      { id: "save:game:block-stack", value: '{"board":[]}' },
      { id: "save:game:sudoku", value: '{"board":[]}' },
      { id: "stats:minesweeper", value: '{"easy":{"wins":1,"losses":0}}' },
      { id: "stats:pong", value: '{"computer":{"wins":1,"losses":0},"local":{"wins":0,"losses":0}}' },
    ];
    await db.arcadeData.bulkAdd(gameRecords.map((record) => ({ ...record, updatedAt: 1 })));
    localStorage.setItem("kxnodesk-ui", JSON.stringify({
      state: { appearance: { ...defaultAppearance, accent: "#112233" } },
      version: 3,
    }));
    localStorage.setItem("kxnodesk-language", "de");

    const backup = await exportDataBackup();
    const exported = JSON.parse(await blobAsFile(backup).text()) as {
      schemaVersion: number;
      data: Record<string, Array<Record<string, unknown>>>;
      preferences: Record<string, string>;
    };
    expect(exported.schemaVersion).toBe(5);
    expect(exported.data.subjects).toHaveLength(1);
    expect(exported.data.timetable).toHaveLength(1);
    expect(exported.data.exceptions).toHaveLength(1);
    expect(exported.data.tasks).toHaveLength(1);
    expect(exported.data.calendarEvents).toHaveLength(1);
    expect(exported.data.notes).toHaveLength(1);
    expect(exported.data.focusSessions).toHaveLength(1);
    expect(exported.data.files[0].blobData).toBeDefined();
    expect(exported.data.arcadeData.map((record) => record.id)).toEqual(expect.arrayContaining(gameRecords.map((record) => record.id)));
    expect(exported.preferences["kxnodesk-language"]).toBe("de");

    const tables = [
      db.subjects, db.teachers, db.timetable, db.exceptions, db.settings, db.tasks,
      db.calendarEvents, db.notes, db.focusSessions, db.files, db.arcadeData,
    ];
    await Promise.all(tables.map((table) => table.clear()));
    localStorage.clear();
    const restored = await importDataBackup(blobAsFile(backup));

    expect(restored.subjects).toEqual({ added: 1, skipped: 0 });
    expect(restored.timetable).toEqual({ added: 1, skipped: 0 });
    expect(restored.tasks).toEqual({ added: 1, skipped: 0 });
    expect(restored.calendarEvents).toEqual({ added: 1, skipped: 0 });
    expect(restored.notes).toEqual({ added: 1, skipped: 0 });
    expect(restored.focusSessions).toEqual({ added: 1, skipped: 0 });
    expect(restored.files).toEqual({ added: 1, skipped: 0 });
    expect(restored.arcadeData).toEqual({ added: gameRecords.length, skipped: 0 });
    expect((await db.files.get("file"))?.blob.type).toBe("text/plain");
    expect((await db.files.get("file"))?.blob.size).toBe(5);
    expect(await db.settings.get("schoolState")).toEqual({ key: "schoolState", value: "NW" });
    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#112233");
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");
  });

  it("rejects invalid backups before changing existing local records", async () => {
    await db.open();
    await db.tasks.add({
      id: "keep",
      title: "Keep this task",
      description: "",
      dueDate: "2026-10-26",
      priority: "normal",
      category: "Homework",
      tags: [],
      subtasks: [],
      completed: false,
      createdAt: 1,
      updatedAt: 1,
    });
    const invalid = blobAsFile(new Blob([JSON.stringify({
      format: "kxnodesk-local-backup",
      schemaVersion: 5,
      data: {
        subjects: [],
        teachers: [],
        timetable: [],
        exceptions: [],
        settings: [],
        aiPresets: [],
        aiConversations: [],
        aiMessages: [],
        tasks: [{ id: "bad", title: 42 }],
        calendarEvents: [],
        notes: [],
        focusSessions: [],
        files: [],
        aiAttachments: [],
        arcadeData: [],
      },
    })], { type: "application/json" }));

    await expect(importDataBackup(invalid)).rejects.toThrow(/invalid tasks record/);
    expect(await db.tasks.get("keep")).toMatchObject({ title: "Keep this task" });
    expect(await db.tasks.count()).toBe(1);
  });
});
