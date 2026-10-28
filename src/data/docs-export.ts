import type { ImageRun, Paragraph, ParagraphChild, Table, TableCell, TableRow } from "docx";
import { db, type SchoolDocument } from "./db";
import { extractDocumentText } from "./docs";

type DocxLibrary = typeof import("docx");
type JsonNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: JsonNode[];
};

function node(value: unknown): JsonNode {
  return value && typeof value === "object" ? value as JsonNode : {};
}

function alignment(value: unknown, library: DocxLibrary) {
  if (value === "center") return library.AlignmentType.CENTER;
  if (value === "right") return library.AlignmentType.RIGHT;
  if (value === "justify") return library.AlignmentType.JUSTIFIED;
  return library.AlignmentType.LEFT;
}

async function inlineChildren(children: JsonNode[], library: DocxLibrary): Promise<ParagraphChild[]> {
  const result: ParagraphChild[] = [];
  for (const child of children) {
    if (child.type === "text") {
      const marks = child.marks ?? [];
      const textStyle = marks.find((mark) => mark.type === "textStyle")?.attrs ?? {};
      const colorMark = marks.find((mark) => mark.type === "textStyle")?.attrs?.color;
      const highlight = marks.find((mark) => mark.type === "highlight")?.attrs?.color;
      const link = marks.find((mark) => mark.type === "link")?.attrs?.href;
      const run = new library.TextRun({
        text: child.text ?? "",
        bold: marks.some((mark) => mark.type === "bold"),
        italics: marks.some((mark) => mark.type === "italic"),
        underline: marks.some((mark) => mark.type === "underline") ? { color: "000000" } : undefined,
        strike: marks.some((mark) => mark.type === "strike"),
        color: typeof colorMark === "string" ? colorMark.replace(/^#/, "") : undefined,
        shading: typeof highlight === "string" ? { fill: highlight.replace(/^#/, "") } : undefined,
        font: typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : undefined,
        size: Number(textStyle.fontSize) ? Math.round(Number(textStyle.fontSize) * 1.5) : undefined,
      });
      result.push(typeof link === "string" && /^https?:\/\//i.test(link)
        ? new library.ExternalHyperlink({ link, children: [run] })
        : run);
    } else if (child.type === "hardBreak") {
      result.push(new library.TextRun({ break: 1 }));
    }
  }
  return result;
}

async function imageRun(item: JsonNode, library: DocxLibrary): Promise<ImageRun> {
  const assetId = String(item.attrs?.assetId ?? "");
  const image = await db.documentImages.get(assetId);
  if (!image) throw new Error("A document image is missing from local storage.");
  const type = image.type === "image/jpeg" ? "jpg" : image.type.replace("image/", "");
  if (!["png", "jpg", "gif", "bmp"].includes(type)) {
    throw new Error(`The image format ${image.type} cannot be embedded in DOCX.`);
  }
  return new library.ImageRun({
    data: new Uint8Array(await image.blob.arrayBuffer()),
    type: type as "png" | "jpg" | "gif" | "bmp",
    transformation: {
      width: Math.max(1, Number(item.attrs?.width) || 420),
      height: Math.max(1, Number(item.attrs?.height) || 300),
    },
    altText: { description: String(item.attrs?.alt ?? image.name) },
  });
}

async function renderBlocks(children: JsonNode[], library: DocxLibrary, list?: "bullet" | "number"): Promise<Array<Paragraph | Table>> {
  const result: Array<Paragraph | Table> = [];
  for (const child of children) {
    const content = child.content ?? [];
    if (child.type === "paragraph" || child.type === "heading" || child.type === "listItem") {
      const attrs = child.attrs ?? {};
      const heading = child.type === "heading"
        ? (Number(attrs.level) === 1 ? library.HeadingLevel.HEADING_1 : Number(attrs.level) === 2 ? library.HeadingLevel.HEADING_2 : library.HeadingLevel.HEADING_3)
        : undefined;
      const runs = await inlineChildren(content, library);
      result.push(new library.Paragraph({
        children: runs.length ? runs : [new library.TextRun("")],
        heading,
        alignment: alignment(attrs.textAlign, library),
        bullet: list === "bullet" ? { level: 0 } : undefined,
        numbering: list === "number" ? { reference: "docs-numbered", level: 0 } : undefined,
        indent: Number(attrs.indent) ? { left: Number(attrs.indent) * 360 } : undefined,
        spacing: {
          after: attrs.paragraphSpacing === undefined ? 120 : Math.max(0, Number(attrs.paragraphSpacing) * 15),
          line: Math.round((Number(attrs.lineSpacing) || 1.15) * 240),
        },
      }));
      if (child.type === "listItem") {
        const nested = await renderBlocks(content, library, list);
        result.splice(result.length - 1, 1, ...nested);
      }
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      result.push(...await renderBlocks(content, library, child.type === "bulletList" ? "bullet" : "number"));
    } else if (child.type === "table") {
      const rows: TableRow[] = [];
      for (const row of content) {
        const cells: TableCell[] = [];
        for (const cell of row.content ?? []) {
          const paragraphs = await renderBlocks(cell.content ?? [], library);
          cells.push(new library.TableCell({
            children: paragraphs.length ? paragraphs.filter((item): item is Paragraph => item instanceof library.Paragraph) : [new library.Paragraph("")],
            width: { size: 100 / Math.max(1, (row.content ?? []).length), type: library.WidthType.PERCENTAGE },
          }));
        }
        rows.push(new library.TableRow({ children: cells }));
      }
      if (rows.length) result.push(new library.Table({ rows, width: { size: 100, type: library.WidthType.PERCENTAGE } }));
    } else if (child.type === "documentImage") {
      result.push(new library.Paragraph({ children: [await imageRun(child, library)] }));
    } else if (child.type === "pageBreak") {
      result.push(new library.Paragraph({ children: [new library.PageBreak()] }));
    }
  }
  return result;
}

export async function buildDocx(documentInfo: SchoolDocument, contentValue: unknown): Promise<Blob> {
  const library = await import("docx");
  const content = node(contentValue);
  const blocks = await renderBlocks(content.content ?? [], library);
  const pageSize = documentInfo.orientation === "landscape"
    ? { width: 16838, height: 11906 }
    : { width: 11906, height: 16838 };
  const header = documentInfo.header ? { default: new library.Header({ children: [new library.Paragraph(documentInfo.header)] }) } : undefined;
  const footer = documentInfo.footer
    ? { default: new library.Footer({ children: [new library.Paragraph(documentInfo.footer)] }) }
    : undefined;
  const doc = new library.Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 18 }, paragraph: { spacing: { after: 120, line: 276 } } },
        heading1: { run: { font: "Arial", size: 36, bold: true } },
        heading2: { run: { font: "Arial", size: 30, bold: true } },
        heading3: { run: { font: "Arial", size: 24, bold: true } },
      },
    },
    numbering: {
      config: [{
        reference: "docs-numbered",
        levels: [{
          level: 0,
          format: "decimal",
          text: "%1.",
          alignment: library.AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 260 } } },
        }],
      }],
    },
    sections: [{
      headers: header,
      footers: footer,
      properties: {
        page: {
          size: { ...pageSize, orientation: documentInfo.orientation === "landscape" ? library.PageOrientation.LANDSCAPE : library.PageOrientation.PORTRAIT },
          margin: {
            top: documentInfo.margins.top * 56.7,
            right: documentInfo.margins.right * 56.7,
            bottom: documentInfo.margins.bottom * 56.7,
            left: documentInfo.margins.left * 56.7,
          },
        },
      },
      children: blocks.length ? blocks : [new library.Paragraph("")],
    }],
  });
  const file = await library.Packer.toBlob(doc);
  if (!file.size) throw new Error("The DOCX export was empty.");
  return file;
}

export async function exportDocumentDocx(documentInfo: SchoolDocument, content: Record<string, unknown>): Promise<void> {
  const blob = await buildDocx(documentInfo, content);
  downloadBlob(blob, `${safeFilename(documentInfo.title)}.docx`);
}

export function exportDocumentText(title: string, content: Record<string, unknown>): Blob {
  const text = extractDocumentText(content).trim();
  return new Blob([`${title}\n${"=".repeat(Math.max(4, title.length))}\n\n${text}\n`], { type: "text/plain;charset=utf-8" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 100) || "Document";
}

export function documentPlainText(content: Record<string, unknown>): string {
  return extractDocumentText(content).trim();
}
