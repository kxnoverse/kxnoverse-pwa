import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCodePreviewDocument,
  checkCodeLesson,
  CODE_LESSONS,
  createCodeProject,
  duplicateCodeProject,
  initializeCodeLab,
  saveCodeLabProgress,
  saveCodeProject,
} from "./code-lab";
import { db } from "./db";

describe("Code Lab local learning and projects", () => {
  beforeEach(async () => {
    await db.open();
    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
  });

  afterEach(async () => {
    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
  });

  it("initializes a starter and progress once, then preserves an intentionally empty project list", async () => {
    const first = await initializeCodeLab();
    expect(first.projects).toHaveLength(1);
    expect(first.progress.currentLessonId).toBe(CODE_LESSONS[0].id);

    await db.codeProjects.delete(first.projects[0].id);
    const reopened = await initializeCodeLab();
    expect(reopened.projects).toEqual([]);
    expect(reopened.progress).toEqual(first.progress);
  });

  it("saves, duplicates, renames, and reopens independent projects", async () => {
    const original = await createCodeProject("Practice");
    const edited = await saveCodeProject({ ...original, html: "<h1>Updated</h1>" });
    const copy = await duplicateCodeProject(edited);

    expect(copy).toMatchObject({ name: "Practice copy", html: "<h1>Updated</h1>" });
    expect(copy.id).not.toBe(edited.id);
    await saveCodeProject({ ...copy, name: "Renamed" });

    expect(await db.codeProjects.get(edited.id)).toMatchObject({ name: "Practice", html: "<h1>Updated</h1>" });
    expect(await db.codeProjects.get(copy.id)).toMatchObject({ name: "Renamed", html: "<h1>Updated</h1>" });
  });

  it("persists lesson snippets and completion state for reopening", async () => {
    const { progress } = await initializeCodeLab();
    const lessonCode = {
      "first-page": {
        html: "<!doctype html><h1>My first page</h1>",
        css: "",
        javascript: "",
      },
    };
    const updated = await saveCodeLabProgress({
      ...progress,
      completedLessonIds: ["first-page"],
      currentLessonId: "headings-and-paragraphs",
      lessonCode,
    });

    expect(await db.codeLabProgress.get("default")).toMatchObject({
      currentLessonId: "headings-and-paragraphs",
      completedLessonIds: ["first-page"],
      lessonCode,
      updatedAt: updated.updatedAt,
    });
  });

  it("checks each beginner task without exposing its completed solution up front", () => {
    expect(CODE_LESSONS[0].starter.html).not.toMatch(/<h1\b[^>]*>[^<]+<\/h1>/i);
    expect(checkCodeLesson("first-page", CODE_LESSONS[0].starter)).toBe(false);
    expect(checkCodeLesson("first-page", {
      ...CODE_LESSONS[0].starter,
      html: "<!doctype html><html><body><h1>Started</h1></body></html>",
    })).toBe(true);
    expect(checkCodeLesson("headings-and-paragraphs", {
      html: "<h1>Title</h1><p>Text</p>",
      css: "",
      javascript: "",
    })).toBe(true);
    expect(checkCodeLesson("css-colors-and-type", {
      html: "",
      css: "body { color: #222; font-family: sans-serif; }",
      javascript: "",
    })).toBe(true);
    expect(checkCodeLesson("buttons-and-containers", {
      html: '<div class="card"><button>Go</button></div>',
      css: ".card { padding: 8px; } button { color: black; }",
      javascript: "",
    })).toBe(true);
    expect(checkCodeLesson("first-interaction", {
      html: "<button>Go</button><p></p>",
      css: "",
      javascript: "button.addEventListener('click', () => { p.textContent = 'Done'; });",
    })).toBe(true);
  });

  it("builds a restricted sandbox preview and escapes script closing tags", () => {
    const preview = buildCodePreviewDocument(
      "<h1>Preview</h1>",
      "h1 { color: black; }",
      "const value = '</script><script>parent.document.body.innerHTML=\"bad\"</script>';",
    );
    expect(preview).toContain("default-src 'none'");
    expect(preview).toContain("connect-src 'none'");
    expect(preview).toContain("<\\/script>");
    expect(preview).not.toContain("allow-same-origin");
  });
});
