import { createId, db, type LocalFile, type PdfAnnotation, type PdfProject } from "./db";
import { readBlobAsArrayBuffer } from "./blob-utils";
import { createDocument, saveDocument } from "./docs";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;
const PDF_MIME = "application/pdf";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
};

export type PdfJsApi = typeof import("pdfjs-dist");

export async function loadPdfJs(): Promise<PdfJsApi> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export function pdfTextItemsToDocumentText(items: PdfTextItem[]): string {
  const lines: Array<{ y: number; pieces: Array<{ x: number; text: string }> }> = [];
  for (const item of items.filter((entry) => entry.str.trim())) {
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 3);
    if (!line) {
      line = { y, pieces: [] };
      lines.push(line);
    }
    line.pieces.push({ x, text: item.str });
  }
  const ordered = lines.sort((first, second) => second.y - first.y).map((line) => ({
    y: line.y,
    text: line.pieces.sort((first, second) => first.x - second.x)
      .map((piece) => piece.text).join(" ").replace(/\s+/g, " ").trim(),
  }));
  const gaps = ordered.slice(1).map((line, index) => ordered[index].y - line.y).filter((gap) => gap > 0).sort((a, b) => a - b);
  const typicalGap = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : 12;
  const paragraphGap = Math.max(20, typicalGap * 1.7);
  const paragraphs: string[] = [];
  let current: string[] = [];
  ordered.forEach((line, index) => {
    if (index && ordered[index - 1].y - line.y > paragraphGap) {
      paragraphs.push(current.join("\n"));
      current = [];
    }
    if (line.text) current.push(line.text);
  });
  if (current.length) paragraphs.push(current.join("\n"));
  return paragraphs.join("\n\n").trim();
}

export async function inspectPdf(file: File): Promise<{ pageCount: number }> {
  if ((file.type !== PDF_MIME && !file.name.toLowerCase().endsWith(".pdf")) || file.size <= 0 || file.size > MAX_PDF_BYTES) {
    throw new Error("Choose a non-empty PDF no larger than 40 MB.");
  }
  const pdfjs = await loadPdfJs();
  const loading = pdfjs.getDocument({ data: new Uint8Array(await readBlobAsArrayBuffer(file)) });
  const pdf = await loading.promise;
  try {
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1) {
      throw new Error("The PDF does not contain any pages.");
    }
    return { pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}

export async function storePdfProject(file: File, pageCount: number): Promise<PdfProject> {
  if ((file.type !== PDF_MIME && !file.name.toLowerCase().endsWith(".pdf")) || file.size <= 0 || file.size > MAX_PDF_BYTES) {
    throw new Error("Choose a non-empty PDF no larger than 40 MB.");
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("The PDF page count is invalid.");
  const id = createId();
  const now = Date.now();
  const sourceFile: LocalFile = {
    id: createId(),
    name: file.name,
    type: PDF_MIME,
    size: file.size,
    category: "docs-pdf-original",
    createdAt: now,
    modifiedAt: now,
    blob: new Blob([await readBlobAsArrayBuffer(file)], { type: PDF_MIME }),
  };
  const project: PdfProject = {
    id,
    title: file.name.replace(/\.pdf$/i, "").slice(0, 160) || "Imported PDF",
    sourceFileId: sourceFile.id,
    pageCount,
    createdAt: now,
    updatedAt: now,
    annotations: [],
  };
  await db.transaction("rw", db.files, db.pdfProjects, async () => {
    await db.files.add(sourceFile);
    await db.pdfProjects.add(project);
  });
  return project;
}

export async function importPdfProject(file: File): Promise<PdfProject> {
  const inspection = await inspectPdf(file);
  return storePdfProject(file, inspection.pageCount);
}

export async function updatePdfProject(project: PdfProject): Promise<void> {
  await db.transaction("rw", db.pdfProjects, db.files, async () => {
    const [existingProject, original] = await Promise.all([
      db.pdfProjects.get(project.id),
      db.files.get(project.sourceFileId),
    ]);
    if (!existingProject || !original || original.type !== PDF_MIME) {
      throw new Error("The PDF project or its original file is missing.");
    }
    await db.pdfProjects.put({ ...project, updatedAt: Date.now() });
  });
}

export function isPdfProject(value: unknown): value is PdfProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<PdfProject>;
  return typeof project.id === "string" && project.id.length > 0 &&
    typeof project.title === "string" && project.title.length > 0 &&
    typeof project.sourceFileId === "string" && project.sourceFileId.length > 0 &&
    Number.isInteger(project.pageCount) && (project.pageCount ?? 0) > 0 &&
    typeof project.createdAt === "number" && Number.isFinite(project.createdAt) &&
    typeof project.updatedAt === "number" && Number.isFinite(project.updatedAt) &&
    Array.isArray(project.annotations) && project.annotations.every(isPdfAnnotation);
}

function isPdfAnnotation(value: unknown): value is PdfAnnotation {
  if (!value || typeof value !== "object") return false;
  const annotation = value as Partial<PdfAnnotation>;
  return typeof annotation.id === "string" && Number.isInteger(annotation.page) && (annotation.page ?? 0) > 0 &&
    ["text", "highlight", "draw"].includes(String(annotation.type)) &&
    typeof annotation.color === "string" && /^#[\da-f]{6}$/i.test(annotation.color) &&
    [annotation.x, annotation.y].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1) &&
    (annotation.width === undefined || (Number.isFinite(annotation.width) && annotation.width >= 0 && annotation.width <= 1)) &&
    (annotation.height === undefined || (Number.isFinite(annotation.height) && annotation.height >= 0 && annotation.height <= 1)) &&
    (annotation.text === undefined || typeof annotation.text === "string") &&
    (annotation.points === undefined || (Array.isArray(annotation.points) && annotation.points.every((point) =>
      Number.isFinite(point.x) && point.x >= 0 && point.x <= 1 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
    )));
}

export async function buildAnnotatedPdf(project: PdfProject): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const source = await db.files.get(project.sourceFileId);
  if (!source || source.type !== PDF_MIME) throw new Error("The original PDF is missing from local storage.");
  const bytes = new Uint8Array(await readBlobAsArrayBuffer(source.blob));
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const annotation of project.annotations) {
    const page = pdf.getPage(annotation.page - 1);
    if (!page) throw new Error(`An annotation references missing page ${annotation.page}.`);
    const { width, height } = page.getSize();
    const color = rgb(
      parseInt(annotation.color.slice(1, 3), 16) / 255,
      parseInt(annotation.color.slice(3, 5), 16) / 255,
      parseInt(annotation.color.slice(5, 7), 16) / 255,
    );
    if (annotation.type === "text" && annotation.text) {
      const fontSize = Math.max(8, Math.min(36, 12 / Math.max(0.1, annotation.width ?? 1)));
      const lines = annotation.text.split(/\r?\n/);
      lines.forEach((line, index) => page.drawText(line, {
        x: annotation.x * width,
        y: height - annotation.y * height - fontSize * (index + 1),
        size: fontSize,
        font,
        color,
        maxWidth: width * Math.max(0.05, 1 - annotation.x),
      }));
    } else if (annotation.type === "highlight") {
      page.drawRectangle({
        x: annotation.x * width,
        y: height - (annotation.y + (annotation.height ?? 0)) * height,
        width: Math.max(1, (annotation.width ?? 0) * width),
        height: Math.max(1, (annotation.height ?? 0) * height),
        color,
        opacity: 0.28,
        borderOpacity: 0,
      });
    } else if (annotation.type === "draw" && annotation.points && annotation.points.length > 1) {
      for (let index = 1; index < annotation.points.length; index += 1) {
        const from = annotation.points[index - 1];
        const to = annotation.points[index];
        page.drawLine({
          start: { x: from.x * width, y: height - from.y * height },
          end: { x: to.x * width, y: height - to.y * height },
          thickness: 2,
          color,
        });
      }
    }
  }
  return new Blob([await pdf.save()], { type: PDF_MIME });
}

export async function createConvertedDocument(title: string, text: string): Promise<string> {
  const paragraphs = text.trim().split(/\n{2,}/).filter(Boolean);
  if (!paragraphs.length) throw new Error("No selectable text was found. Scanned PDFs need OCR, which is not included.");
  const document = await createDocument(title);
  await saveDocument(document, {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index) => [
        ...(index ? [{ type: "hardBreak" }] : []),
        ...(line ? [{ type: "text", text: line }] : []),
      ]),
    })),
  });
  return document.id;
}
