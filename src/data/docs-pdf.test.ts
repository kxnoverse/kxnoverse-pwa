import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  buildAnnotatedPdf,
  createConvertedDocument,
  importPdfProject,
  isPdfProject,
  MAX_PDF_BYTES,
  pdfTextItemsToDocumentText,
  storePdfProject,
  updatePdfProject,
} from "./docs-pdf";
import { readBlobAsArrayBuffer } from "./blob-utils";

describe("local PDF projects", () => {
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

  async function createPdfFile(name = "worksheet.pdf"): Promise<File> {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    pdf.addPage([612, 792]);
    return new File([await pdf.save()], name, { type: "application/pdf" });
  }

  it("stores an independent original Blob and a separate annotation project", async () => {
    const file = await createPdfFile();
    const originalBytes = new Uint8Array(await readBlobAsArrayBuffer(file));
    const project = await storePdfProject(file, 2);

    expect(await db.files.get(project.sourceFileId)).toMatchObject({
      name: "worksheet.pdf",
      type: "application/pdf",
      category: "docs-pdf-original",
    });
    expect(await db.pdfProjects.get(project.id)).toMatchObject({
      sourceFileId: project.sourceFileId,
      pageCount: 2,
      annotations: [],
    });
    const storedOriginal = (await db.files.get(project.sourceFileId))!;
    expect(storedOriginal.blob).not.toBeInstanceOf(NodeFile);
    expect([...new Uint8Array(await readBlobAsArrayBuffer(storedOriginal.blob))]).toEqual([...originalBytes]);
    expect(isPdfProject({ ...project, annotations: [{ ...project.annotations, id: "" }] })).toBe(false);
  });

  it("rejects empty, non-PDF, and oversized imports before parsing or storing them", async () => {
    const emptyPdf = new File([], "empty.pdf", { type: "application/pdf" });
    const nonPdf = new File(["not a PDF"], "notes.txt", { type: "text/plain" });
    const oversizedPdf = new File(["data"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(oversizedPdf, "size", { value: MAX_PDF_BYTES + 1 });

    await expect(importPdfProject(emptyPdf)).rejects.toThrow("non-empty PDF");
    await expect(importPdfProject(nonPdf)).rejects.toThrow("non-empty PDF");
    await expect(importPdfProject(oversizedPdf)).rejects.toThrow("40 MB");
    expect(await db.files.count()).toBe(0);
    expect(await db.pdfProjects.count()).toBe(0);
  });

  it("persists editable annotations and exports a new PDF while preserving the original", async () => {
    const file = await createPdfFile();
    const originalBytes = new Uint8Array(await readBlobAsArrayBuffer(file));
    const project = await storePdfProject(file, 2);
    const annotated = {
      ...project,
      annotations: [
        { id: "text", page: 1, type: "text" as const, color: "#222222", x: 0.12, y: 0.16, text: "My answer" },
        { id: "highlight", page: 2, type: "highlight" as const, color: "#e6bc62", x: 0.1, y: 0.2, width: 0.4, height: 0.03 },
        { id: "draw", page: 2, type: "draw" as const, color: "#8dbfd0", x: 0.2, y: 0.3, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.35 }] },
      ],
    };
    await updatePdfProject(annotated);

    const saved = await db.pdfProjects.get(project.id);
    expect(saved?.annotations).toEqual(annotated.annotations);
    const exported = await buildAnnotatedPdf(saved!);
    expect(exported.type).toBe("application/pdf");
    const exportedPdf = await PDFDocument.load(new Uint8Array(await exported.arrayBuffer()));
    expect(exportedPdf.getPageCount()).toBe(2);
    expect([...new Uint8Array(await readBlobAsArrayBuffer((await db.files.get(project.sourceFileId))!.blob))]).toEqual([...originalBytes]);
    expect([...new Uint8Array(await exported.arrayBuffer())]).not.toEqual([...originalBytes]);
  });

  it("reconstructs readable text lines and paragraph spacing without claiming exact layout", () => {
    const text = pdfTextItemsToDocumentText([
      { str: "Second", transform: [1, 0, 0, 1, 80, 705], width: 30 },
      { str: "first", transform: [1, 0, 0, 1, 30, 720], width: 20 },
      { str: "line", transform: [1, 0, 0, 1, 55, 720], width: 20 },
      { str: "New paragraph", transform: [1, 0, 0, 1, 30, 670], width: 80 },
    ]);
    expect(text).toBe("first line\nSecond\n\nNew paragraph");
  });

  it("creates an editable text document from selectable text and rejects empty OCR-dependent input", async () => {
    const documentId = await createConvertedDocument("Converted worksheet", "Heading\n\nFirst paragraph.\nSecond line.");
    expect(await db.documentContents.get(documentId)).toMatchObject({
      plainText: "Heading\nFirst paragraph.\nSecond line.",
    });
    await expect(createConvertedDocument("Scanned", " \n ")).rejects.toThrow("No selectable text was found");
  });
});
