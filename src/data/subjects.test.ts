import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSchoolDocument, isSchoolDocument } from "./docs";
import { db, type PdfProject, type SchoolTask } from "./db";
import { isPdfProject } from "./docs-pdf";
import { createSubject, deleteSubject, matchesSubject, renameSubject } from "./subjects";

describe("local subjects", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("creates and renames a subject without changing its stable ID", async () => {
    const subject = await createSubject("  Biology  ");
    await renameSubject(subject.id, "Life science");

    expect(await db.subjects.get(subject.id)).toMatchObject({ id: subject.id, name: "Life science" });
    await expect(renameSubject(subject.id, "  ")).rejects.toThrow("invalid-subject");
  });

  it("removes a subject from assigned local records while preserving their content", async () => {
    const subject = await createSubject("Biology");
    const task: SchoolTask = {
      id: "task-1", title: "Read", description: "Chapter 2", dueDate: "2025-03-10",
      priority: "normal", subjectId: subject.id, category: "Homework", tags: [], subtasks: [],
      completed: false, createdAt: 1, updatedAt: 1,
    };
    const document = { ...createSchoolDocument("Lab notes", 1), subjectId: subject.id };
    const project: PdfProject = {
      id: "pdf-1", title: "Worksheet", sourceFileId: "file-1", pageCount: 1,
      subjectId: subject.id, createdAt: 1, updatedAt: 1, annotations: [],
    };
    await db.tasks.add(task);
    await db.notes.add({
      id: "note-1", title: "Notes", content: "Remember this", folder: "Biology",
      subjectId: subject.id, pinned: false, createdAt: 1, updatedAt: 1,
    });
    await db.documents.add(document);
    await db.pdfProjects.add(project);

    await deleteSubject(subject.id);

    expect(await db.subjects.get(subject.id)).toBeUndefined();
    expect(await db.tasks.get(task.id)).toMatchObject({ title: "Read", completed: false });
    expect((await db.tasks.get(task.id))?.subjectId).toBeUndefined();
    expect(await db.notes.get("note-1")).toMatchObject({ content: "Remember this" });
    expect((await db.notes.get("note-1"))?.subjectId).toBeUndefined();
    expect(await db.documents.get(document.id)).toMatchObject({ title: "Lab notes" });
    expect((await db.documents.get(document.id))?.subjectId).toBeUndefined();
    expect(await db.pdfProjects.get(project.id)).toMatchObject({ title: "Worksheet" });
    expect((await db.pdfProjects.get(project.id))?.subjectId).toBeUndefined();
    expect(matchesSubject(undefined, "__no_subject__")).toBe(true);
    expect(matchesSubject(undefined, "")).toBe(true);
    expect(matchesSubject("other", subject.id)).toBe(false);
  });

  it("protects subjects still used by a timetable entry", async () => {
    const subject = await createSubject("Physics");
    await db.timetable.add({
      id: "lesson-1", subjectId: subject.id, weekday: 1, start: "09:00", end: "10:00",
      weekType: "all", kind: "lesson",
    });

    await expect(deleteSubject(subject.id)).rejects.toThrow("subject-in-use");
    expect(await db.subjects.get(subject.id)).toBeDefined();
  });

  it("accepts legacy records without subject metadata and new records with it", () => {
    const document = createSchoolDocument("Old document", 1);
    const project: PdfProject = {
      id: "pdf-1", title: "Old PDF", sourceFileId: "file-1", pageCount: 1,
      createdAt: 1, updatedAt: 1, annotations: [],
    };

    expect(isSchoolDocument(document)).toBe(true);
    expect(isSchoolDocument({ ...document, subjectId: "subject-1" })).toBe(true);
    expect(isSchoolDocument({ ...document, subjectId: 12 })).toBe(false);
    expect(isPdfProject(project)).toBe(true);
    expect(isPdfProject({ ...project, subjectId: "subject-1" })).toBe(true);
    expect(isPdfProject({ ...project, subjectId: false })).toBe(false);
  });
});
