import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import {
  buildAnnotatedPdf,
  createConvertedDocument,
  importPdfProject,
  isPdfProject,
  MAX_PDF_BYTES,
  normalizePdfPoint,
  pdfPagePoint,
  pdfTextItemsToDocumentText,
  storePdfProject,
  updatePdfProject,
} from "./docs-pdf";
import { readBlobAsArrayBuffer } from "./blob-utils";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({ numPages: 2, destroy: vi.fn(async () => undefined) }),
  }),
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/test-pdf-worker.mjs" }));

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
    expect(await db.documents.count()).toBe(0);
    expect(await db.documentContents.count()).toBe(0);
    expect(isPdfProject({ ...project, annotations: [{ ...project.annotations, id: "" }] })).toBe(false);
  });

  it("imports the original PDF directly without creating a converted text document", async () => {
    const project = await importPdfProject(await createPdfFile("native.pdf"));

    expect(await db.pdfProjects.get(project.id)).toMatchObject({
      sourceFileId: project.sourceFileId,
      pageCount: 2,
      annotations: [],
    });
    expect(await db.files.get(project.sourceFileId)).toMatchObject({
      name: "native.pdf",
      type: "application/pdf",
      category: "docs-pdf-original",
    });
    expect(await db.documents.count()).toBe(0);
    expect(await db.documentContents.count()).toBe(0);
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
        { id: "text", page: 1, type: "text" as const, color: "#222222", x: 0.12, y: 0.16, width: 0.4, text: "My answer" },
        { id: "highlight", page: 2, type: "highlight" as const, color: "#e6bc62", x: 0.1, y: 0.2, width: 0.4, height: 0.03 },
        { id: "draw", page: 2, type: "draw" as const, color: "#8dbfd0", x: 0.2, y: 0.3, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.35 }] },
      ],
    };
    await updatePdfProject(annotated);

    db.close();
    await db.open();
    const saved = await db.pdfProjects.get(project.id);
    expect(saved?.annotations).toEqual(annotated.annotations);
    const exported = await buildAnnotatedPdf(saved!);
    expect(exported.type).toBe("application/pdf");
    const exportedPdf = await PDFDocument.load(new Uint8Array(await exported.arrayBuffer()));
    expect(exportedPdf.getPageCount()).toBe(2);
    const pageContents = exportedPdf.getPage(0).node.Contents();
    const streamRefs = pageContents instanceof PDFArray ? pageContents.asArray() : [pageContents];
    const pageStreamText = streamRefs.map((reference) => {
      if (!reference) return "";
      const stream = exportedPdf.context.lookup(reference);
      return stream instanceof PDFRawStream ? inflateSync(stream.contents).toString("latin1") : "";
    }).join("\n");
    expect(pageStreamText).toContain(Buffer.from("My answer").toString("hex").toUpperCase());
    expect(pageStreamText).toContain("73.44 653.28");
    expect([...new Uint8Array(await readBlobAsArrayBuffer((await db.files.get(project.sourceFileId))!.blob))]).toEqual([...originalBytes]);
    expect([...new Uint8Array(await exported.arrayBuffer())]).not.toEqual([...originalBytes]);
  });

  it("keeps pointer coordinates zoom-independent and maps them to PDF page space", () => {
    const atFitScale = normalizePdfPoint(250, 400, 500, 800);
    const atDoubleScale = normalizePdfPoint(500, 800, 1000, 1600);
    expect(atDoubleScale).toEqual(atFitScale);
    expect(pdfPagePoint(atFitScale.x, atFitScale.y, 612, 792)).toEqual({ x: 306, y: 396 });
    expect(pdfPagePoint(atFitScale.x, atFitScale.y, 900, 600)).toEqual({ x: 450, y: 300 });
    expect(() => normalizePdfPoint(0, 0, 0, 100)).toThrow("dimensions are invalid");
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
