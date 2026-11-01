import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  createPresentationProject, deletePresentationProject, duplicatePresentationProject,
  exportPresentationPptx, importPresentationPptx, isPresentationProject, loadPresentationProjects,
  savePresentationProject,
} from "./presentations";

describe("presentation projects", () => {
  beforeEach(async () => {
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("File", NodeFile);
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    vi.unstubAllGlobals();
  });

  it("creates polished templates and saves editable projects locally", async () => {
    const project = createPresentationProject("fieldnotes");
    const saved = await savePresentationProject(project);

    expect(saved.slides.length).toBeGreaterThan(1);
    expect(saved.slides[0].elements.some((element) => element.kind === "text")).toBe(true);
    expect(await loadPresentationProjects()).toMatchObject([{ id: project.id, templateId: "fieldnotes" }]);

    const copy = duplicatePresentationProject(saved, "copy");
    expect(copy.id).not.toBe(saved.id);
    expect(copy.slides[0].id).not.toBe(saved.slides[0].id);
    await savePresentationProject(copy);
    await deletePresentationProject(saved.id);

    expect(await db.presentations.get(saved.id)).toBeUndefined();
    expect(await db.presentations.get(copy.id)).toMatchObject({ name: "Fieldnotes copy" });
  });

  it("exports and reimports editable slide text, colors, shapes, and images", async () => {
    const project = createPresentationProject("signal");
    const imageBytes = [137, 80, 78, 71, 13, 10, 26, 10];
    project.slides[0].elements.splice(1, 0, {
      id: "cover-image",
      kind: "image",
      x: 760,
      y: 80,
      width: 120,
      height: 100,
      blob: new Blob([new Uint8Array(imageBytes)], { type: "image/png" }),
      mimeType: "image/png",
      imageName: "cover.png",
    });
    expect(isPresentationProject(project)).toBe(true);

    const exported = await exportPresentationPptx(project);
    const imported = await importPresentationPptx(new File([exported], "signal.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }));

    expect(imported.slides).toHaveLength(project.slides.length);
    expect(imported.slides.some((item) => item.elements.some((element) => element.text?.includes("Build.")))).toBe(true);
    expect(imported.slides[0].elements[1]?.kind).toBe("image");
    const importedImage = imported.slides[0].elements.find((element) => element.kind === "image");
    expect(importedImage?.mimeType).toBe("image/png");
    expect([...new Uint8Array(await importedImage!.blob!.arrayBuffer())]).toEqual(imageBytes);
    await savePresentationProject(imported);
    const reopened = await loadPresentationProjects();
    expect(reopened[0]).toMatchObject({ name: "signal" });
    expect(reopened[0].slides[0].title).toBe(imported.slides[0].title);
  });
});
