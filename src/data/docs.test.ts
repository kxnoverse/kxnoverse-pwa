import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createDocument, deleteDocument, duplicateDocument, saveDocument } from "./docs";

describe("document persistence", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("creates, saves, duplicates, and deletes document records without changing metadata", async () => {
    const document = await createDocument("Biology");
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Cell structure" }] }],
    };
    await saveDocument(document, content, 200);

    expect(await db.documents.get(document.id)).toMatchObject({ title: "Biology", updatedAt: 200 });
    expect(await db.documentContents.get(document.id)).toMatchObject({
      content,
      plainText: "Cell structure",
    });

    const copy = await duplicateDocument(document.id, "(copy)");
    expect(copy).toMatchObject({ title: "Biology (copy)", paperSize: "A4", orientation: "portrait" });
    expect(await db.documentContents.get(copy.id)).toMatchObject({ content, plainText: "Cell structure" });

    await deleteDocument(document.id);
    expect(await db.documents.get(document.id)).toBeUndefined();
    expect(await db.documentContents.get(document.id)).toBeUndefined();
    expect(await db.documentContents.get(copy.id)).toMatchObject({ plainText: "Cell structure" });
  });

  it("preserves shared image assets and removes an asset only after its last document is deleted", async () => {
    const original = await createDocument("With image");
    const imageContent = {
      type: "doc",
      content: [{ type: "documentImage", attrs: { assetId: "shared-image" } }],
    };
    await saveDocument(original, imageContent);
    await db.documentImages.add({
      id: "shared-image",
      name: "diagram.png",
      type: "image/png",
      size: 3,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      createdAt: 1,
    });
    const copy = await duplicateDocument(original.id, "(copy)");

    await deleteDocument(original.id);
    expect(await db.documentImages.get("shared-image")).toBeDefined();
    await deleteDocument(copy.id);
    expect(await db.documentImages.get("shared-image")).toBeUndefined();
  });

  it("keeps the stored document settings when saving editor content", async () => {
    const document = await createDocument("History");
    await db.documents.update(document.id, {
      orientation: "landscape",
      margins: { top: 20, right: 18, bottom: 20, left: 18 },
      header: "Class notes",
    });
    await saveDocument(document, { type: "doc", content: [{ type: "paragraph" }] }, 300);
    expect(await db.documents.get(document.id)).toMatchObject({
      orientation: "landscape",
      margins: { top: 20, right: 18, bottom: 20, left: 18 },
      header: "Class notes",
      updatedAt: 300,
    });
  });
});
