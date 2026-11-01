import "fake-indexeddb/auto";
import Dexie from "dexie";
/// <reference types="node" />
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDataBackup, importDataBackup } from "./backup";
import { db } from "./db";
import { createSchoolDocument } from "./docs";
import { createDiagramProject } from "./diagrams";
import { createPresentationProject } from "./presentations";
import { defaultAppearance } from "../stores/ui-store";
import { i18nReady } from "../i18n";

function blobAsFile(blob: Blob): File {
  return {
    size: blob.size,
    text: () => blob.text(),
  } as File;
}

describe("local data safety", () => {
  beforeEach(async () => {
    await i18nReady;
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
    expect(await db.workspace.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
    expect(await db.documentImages.count()).toBe(0);
    expect(await db.pdfProjects.count()).toBe(0);
    expect(await db.docsTemplates.count()).toBe(0);
    expect(db.verno).toBe(15);
  });

  it("backs up daily check-ins and accepts backups created before check-ins existed", async () => {
    await db.open();
    const checkin = {
      id: "2026-10-31",
      date: "2026-10-31",
      sleepHours: 7.5,
      mood: null,
      customMoodId: "curious-id",
      plans: "Finish the history project",
      updatedAt: 123,
    };
    const feelings = [{ id: "curious-id", name: "Curious", emoji: "✨" }];
    await db.dailyCheckins.put(checkin);
    await db.settings.put({ key: "calendarCheckinFeelings", value: JSON.stringify(feelings) });

    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await backup.text()) as {
      schemaVersion: number;
      data: Record<string, Array<Record<string, unknown>>>;
    };
    expect(snapshot.schemaVersion).toBe(15);
    expect(snapshot.data.dailyCheckins).toEqual([checkin]);

    await db.dailyCheckins.clear();
    const restored = await importDataBackup(blobAsFile(backup));
    expect(restored.dailyCheckins).toEqual({ added: 1, skipped: 0 });
    expect(await db.dailyCheckins.get(checkin.id)).toEqual(checkin);
    expect(await db.settings.get("calendarCheckinFeelings")).toEqual({
      key: "calendarCheckinFeelings",
      value: JSON.stringify(feelings),
    });

    await db.dailyCheckins.clear();
    await db.settings.delete("calendarCheckinFeelings");
    snapshot.schemaVersion = 12;
    delete snapshot.data.dailyCheckins;
    delete snapshot.data.diagramProjects;
    delete snapshot.data.presentations;
    const legacy = blobAsFile(new Blob([JSON.stringify(snapshot)], { type: "application/json" }));
    const legacyResult = await importDataBackup(legacy);
    expect(legacyResult.dailyCheckins).toEqual({ added: 0, skipped: 0 });
    expect(await db.dailyCheckins.count()).toBe(0);

    snapshot.schemaVersion = 13;
    snapshot.data.dailyCheckins = [{ ...checkin, id: "2026-02-30", date: "2026-02-30" }];
    const invalidDateBackup = blobAsFile(new Blob([JSON.stringify(snapshot)], { type: "application/json" }));
    await expect(importDataBackup(invalidDateBackup)).rejects.toThrow("The backup contains an invalid daily check-in.");
  });

  it("round-trips saved diagrams and presentation image blobs", async () => {
    await db.open();
    const diagram = createDiagramProject("Study flow");
    const presentation = createPresentationProject("northstar");
    const imageBytes = [137, 80, 78, 71, 13, 10, 26, 10];
    presentation.slides[0].elements.push({
      id: "cover-image",
      kind: "image",
      x: 700,
      y: 80,
      width: 220,
      height: 140,
      blob: new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
      mimeType: "image/png",
      imageName: "cover.png",
    });
    await db.diagramProjects.put(diagram);
    await db.presentations.put(presentation);

    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await backup.text()) as {
      data: {
        presentations: Array<{ slides: Array<{ elements: Array<{ blobData?: string }> }> }>;
      };
    };
    expect(snapshot.data.presentations[0].slides[0].elements.some((element) => element.blobData)).toBe(true);

    await db.diagramProjects.clear();
    await db.presentations.clear();
    const restored = await importDataBackup(blobAsFile(backup));

    expect(restored.diagramProjects).toEqual({ added: 1, skipped: 0 });
    expect(restored.presentations).toEqual({ added: 1, skipped: 0 });
    expect(await db.diagramProjects.get(diagram.id)).toMatchObject({ name: "Study flow" });
    const restoredPresentation = await db.presentations.get(presentation.id);
    const restoredImage = restoredPresentation?.slides[0].elements.find((element) => element.id === "cover-image");
    expect(restoredImage?.blob?.type).toBe("image/png");
    expect([...new Uint8Array(await restoredImage!.blob!.arrayBuffer())]).toEqual(imageBytes);
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
      { key: "aiCloudConsentEndpoint", value: "https://worker.example.test" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "focusTimerState", value: "runtime-only" },
      { key: "regionalCalendar:NW:2026:de", value: "cached-data" },
    ]);
    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await blobAsFile(backup).text()) as { data: { settings: Array<{ key: string }>; arcadeData: Array<{ id: string }> } };
    expect(snapshot.data.settings.some((setting) => ["aiCloudConsent", "aiCloudConsentEndpoint", "aiCloudEnabled", "focusTimerState", "regionalCalendar:NW:2026:de"].includes(setting.key))).toBe(false);
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
      subjectId: "subject",
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
    await db.workspace.add({
      id: "default",
      state: {
        elements: [
          {
            id: "workspace-text",
            kind: "text",
            x: 120,
            y: 80,
            width: 280,
            height: 200,
            borderColor: "#347ab4",
            title: "Revision notes",
            content: "Review chapter 4",
          },
          {
            id: "workspace-document",
            kind: "document",
            x: 460,
            y: 80,
            width: 340,
            height: 250,
            borderColor: "#347ab4",
            title: "Biology report",
            content: "",
            documentId: "document-one",
          },
        ],
        connections: [],
        viewport: { x: 12, y: 20, zoom: 1.2 },
      },
      updatedAt: 1,
    });
    await db.documents.add({
      id: "document-one",
      title: "Biology report",
      subjectId: "subject",
      createdAt: 10,
      updatedAt: 11,
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25, right: 25, bottom: 25, left: 25 },
      header: "Biology",
      footer: "Schoolwork",
    });
    await db.documentContents.add({
      id: "document-one",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cells" }] }] },
      plainText: "Cells",
    });
    await db.documentImages.add({
      id: "image-one",
      name: "cell.png",
      type: "image/png",
      size: 8,
      blob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }),
      createdAt: 12,
    });
    await db.files.add({
      id: "pdf-original-one",
      name: "worksheet.pdf",
      type: "application/pdf",
      size: 8,
      category: "docs-pdf-original",
      createdAt: 13,
      modifiedAt: 13,
      blob: new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])], { type: "application/pdf" }),
    });
    await db.pdfProjects.add({
      id: "pdf-project-one",
      title: "Worksheet",
      subjectId: "subject",
      sourceFileId: "pdf-original-one",
      pageCount: 2,
      createdAt: 13,
      updatedAt: 13,
      annotations: [{ id: "annotation-one", page: 1, type: "text", color: "#222222", x: 0.1, y: 0.2, text: "Answer" }],
    });
    await db.docsTemplates.add({
      id: "template-one",
      name: "Study layout",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Review" }] }] },
      createdAt: 14,
      updatedAt: 14,
    });
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
    expect(exported.schemaVersion).toBe(15);
    expect(exported.data.subjects).toHaveLength(1);
    expect(exported.data.timetable).toHaveLength(1);
    expect(exported.data.exceptions).toHaveLength(1);
    expect(exported.data.tasks).toHaveLength(1);
    expect(exported.data.calendarEvents).toHaveLength(1);
    expect(exported.data.notes).toHaveLength(1);
    expect(exported.data.focusSessions).toHaveLength(1);
    expect(exported.data.files[0].blobData).toBeDefined();
    expect(exported.data.workspace).toHaveLength(1);
    expect(exported.data.documents).toHaveLength(1);
    expect(exported.data.documentContents).toHaveLength(1);
    expect(exported.data.documentImages[0].blobData).toBeDefined();
    expect(exported.data.pdfProjects).toHaveLength(1);
    expect(exported.data.docsTemplates).toHaveLength(1);
    expect(exported.data.codeProjects).toHaveLength(0);
    expect(exported.data.codeLabProgress).toHaveLength(0);
    expect(exported.data.arcadeData.map((record) => record.id)).toEqual(expect.arrayContaining(gameRecords.map((record) => record.id)));
    expect(exported.preferences["kxnodesk-language"]).toBe("de");

    const tables = [
      db.subjects, db.teachers, db.timetable, db.exceptions, db.settings, db.tasks,
      db.calendarEvents, db.notes, db.focusSessions, db.files, db.arcadeData,
      db.workspace,
      db.documents, db.documentContents, db.documentImages,
      db.pdfProjects,
      db.docsTemplates,
      db.codeProjects, db.codeLabProgress,
      db.codeGardenState,
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
    expect(restored.files).toEqual({ added: 2, skipped: 0 });
    expect(restored.arcadeData).toEqual({ added: gameRecords.length, skipped: 0 });
    expect(restored.workspace).toEqual({ added: 1, skipped: 0 });
    expect(await db.workspace.get("default")).toMatchObject({
      state: {
        elements: [
          expect.objectContaining({ title: "Revision notes", content: "Review chapter 4" }),
          expect.objectContaining({ kind: "document", documentId: "document-one" }),
        ],
        viewport: { x: 12, y: 20, zoom: 1.2 },
      },
    });
    expect(restored.documents).toEqual({ added: 1, skipped: 0 });
    expect(restored.documentContents).toEqual({ added: 1, skipped: 0 });
    expect(restored.documentImages).toEqual({ added: 1, skipped: 0 });
    expect(restored.pdfProjects).toEqual({ added: 1, skipped: 0 });
    expect(restored.docsTemplates).toEqual({ added: 1, skipped: 0 });
    expect(restored.codeProjects).toEqual({ added: 0, skipped: 0 });
    expect(restored.codeLabProgress).toEqual({ added: 0, skipped: 0 });
    expect(await db.docsTemplates.get("template-one")).toMatchObject({
      name: "Study layout",
      content: { type: "doc" },
    });
    expect(await db.pdfProjects.get("pdf-project-one")).toMatchObject({
      sourceFileId: "pdf-original-one",
      subjectId: "subject",
      annotations: [{ text: "Answer", page: 1 }],
    });
    expect((await db.files.get("pdf-original-one"))?.blob.type).toBe("application/pdf");
    expect((await db.documentImages.get("image-one"))?.blob.size).toBe(8);
    expect(await db.documentContents.get("document-one")).toMatchObject({ plainText: "Cells" });
    expect((await db.files.get("file"))?.blob.type).toBe("text/plain");
    expect((await db.files.get("file"))?.blob.size).toBe(5);
    expect(await db.settings.get("schoolState")).toEqual({ key: "schoolState", value: "NW" });
    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#112233");
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");
  });

  it("imports older document backups without subject metadata", async () => {
    await db.open();
    await db.documents.add(createSchoolDocument("Legacy document", 1));
    const backup = await exportDataBackup();
    const parsed = JSON.parse(await blobAsFile(backup).text()) as {
      format: string;
      schemaVersion: number;
      data: Record<string, Array<Record<string, unknown>>>;
      preferences: Record<string, string>;
    };
    delete parsed.data.documents[0].subjectId;
    parsed.schemaVersion = 8;
    delete parsed.data.docsTemplates;

    await db.documents.clear();
    const restored = await importDataBackup(blobAsFile(new Blob([JSON.stringify(parsed)], { type: "application/json" })));

    expect(restored.documents).toEqual({ added: 1, skipped: 0 });
    expect(await db.documents.get(parsed.data.documents[0].id as string)).toMatchObject({ title: "Legacy document" });
    expect((await db.documents.get(parsed.data.documents[0].id as string))?.subjectId).toBeUndefined();
  });

  it("round-trips Code Lab and Code Garden progress while accepting schema 9 backups", async () => {
    await db.open();
    const project = {
      id: "code-project",
      name: "Local practice",
      html: "<h1>Local</h1>",
      css: "h1 { color: black; }",
      javascript: "",
      createdAt: 10,
      updatedAt: 11,
    };
    const progress = {
      id: "default" as const,
      currentLessonId: "headings-and-paragraphs",
      completedLessonIds: ["first-page"],
      lessonCode: { "first-page": { html: "<h1>Local</h1>", css: "", javascript: "" } },
      updatedAt: 12,
    };
    const garden = {
      id: "default" as const,
      activeMissionId: "solar-relay",
      completedMissionIds: ["first-harvest", "repeat-the-row", "read-the-ground", "garden-routine", "seed-cycle"],
      resources: { plants: 4, wood: 2, stone: 1, seeds: 3, energy: 15 },
      upgrades: ["storehouse", "solar-coil"],
      programs: { "solar-relay": "wait()" },
      bestResults: {
        "solar-relay": { instructions: 9, harvested: 4, collected: 0, energyConsumed: 4, energyGenerated: 2 },
      },
      updatedAt: 13,
    };
    await db.codeProjects.add(project);
    await db.codeLabProgress.add(progress);
    await db.codeGardenState.add(garden);

    const backup = await exportDataBackup();
    const snapshot = JSON.parse(await blobAsFile(backup).text()) as {
      schemaVersion: number;
      data: Record<string, Array<Record<string, unknown>>>;
    };
    expect(snapshot.schemaVersion).toBe(15);
    expect(snapshot.data.codeProjects).toEqual([project]);
    expect(snapshot.data.codeLabProgress).toEqual([progress]);
    expect(snapshot.data.codeGardenState).toEqual([garden]);

    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
    await db.codeGardenState.clear();
    const restored = await importDataBackup(blobAsFile(backup));
    expect(restored.codeProjects).toEqual({ added: 1, skipped: 0 });
    expect(restored.codeLabProgress).toEqual({ added: 1, skipped: 0 });
    expect(restored.codeGardenState).toEqual({ added: 1, skipped: 0 });
    expect(await db.codeProjects.get(project.id)).toEqual(project);
    expect(await db.codeLabProgress.get("default")).toEqual(progress);
    expect(await db.codeGardenState.get("default")).toEqual(garden);

    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
    await db.codeGardenState.clear();
    snapshot.schemaVersion = 9;
    delete snapshot.data.codeProjects;
    delete snapshot.data.codeLabProgress;
    delete snapshot.data.codeGardenState;
    const legacy = blobAsFile(new Blob([JSON.stringify(snapshot)], { type: "application/json" }));
    const legacyResult = await importDataBackup(legacy);
    expect(legacyResult.codeProjects).toEqual({ added: 0, skipped: 0 });
    expect(legacyResult.codeLabProgress).toEqual({ added: 0, skipped: 0 });
    expect(legacyResult.codeGardenState).toEqual({ added: 0, skipped: 0 });
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
      schemaVersion: 6,
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
