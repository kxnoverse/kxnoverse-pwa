import { createId, db, type SchoolDocument, type SchoolDocumentContent } from "./db";

export const EMPTY_DOCUMENT_CONTENT: Record<string, unknown> = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export const DEFAULT_DOCUMENT_MARGINS = { top: 25, right: 25, bottom: 25, left: 25 };

export function extractDocumentText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { type?: unknown; text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  const children = Array.isArray(node.content) ? node.content.map(extractDocumentText) : [];
  if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") return children.join("") + "\n";
  if (node.type === "hardBreak" || node.type === "pageBreak") return "\n";
  if (node.type === "tableRow") return children.join("\t") + "\n";
  return children.join("");
}

export function countDocumentWords(text: string): number {
  return text.trim().match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function createSchoolDocument(title: string, now = Date.now()): SchoolDocument {
  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    paperSize: "A4",
    orientation: "portrait",
    margins: { ...DEFAULT_DOCUMENT_MARGINS },
    header: "",
    footer: "",
  };
}

export async function createDocument(title: string): Promise<SchoolDocument> {
  const document = createSchoolDocument(title);
  const content: SchoolDocumentContent = {
    id: document.id,
    content: structuredClone(EMPTY_DOCUMENT_CONTENT),
    plainText: "",
  };
  await db.transaction("rw", db.documents, db.documentContents, async () => {
    await db.documents.add(document);
    await db.documentContents.add(content);
  });
  return document;
}

export async function saveDocument(
  document: SchoolDocument,
  content: Record<string, unknown>,
  updatedAt = Date.now(),
): Promise<void> {
  const nextContent: SchoolDocumentContent = {
    id: document.id,
    content: structuredClone(content),
    plainText: extractDocumentText(content).trim(),
  };
  await db.transaction("rw", db.documents, db.documentContents, async () => {
    const storedDocument = await db.documents.get(document.id);
    if (!storedDocument) throw new Error("The document no longer exists.");
    await db.documents.put({ ...storedDocument, updatedAt });
    await db.documentContents.put(nextContent);
  });
}

export async function duplicateDocument(documentId: string, copySuffix: string): Promise<SchoolDocument> {
  const original = await db.documents.get(documentId);
  const originalContent = await db.documentContents.get(documentId);
  if (!original || !originalContent) throw new Error("The document could not be duplicated because it no longer exists.");
  const now = Date.now();
  const duplicate: SchoolDocument = {
    ...original,
    id: createId(),
    title: `${original.title} ${copySuffix}`.slice(0, 160),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction("rw", db.documents, db.documentContents, async () => {
    await db.documents.add(duplicate);
    await db.documentContents.add({
      ...originalContent,
      id: duplicate.id,
      content: structuredClone(originalContent.content),
    });
  });
  return duplicate;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await db.transaction("rw", db.documents, db.documentContents, db.documentImages, async () => {
    await db.documents.delete(documentId);
    await db.documentContents.delete(documentId);
    const remaining = await db.documentContents.toArray();
    const referencedAssets = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const node = value as { type?: unknown; attrs?: { assetId?: unknown }; content?: unknown };
      if (node.type === "documentImage" && typeof node.attrs?.assetId === "string") {
        referencedAssets.add(node.attrs.assetId);
      }
      if (Array.isArray(node.content)) node.content.forEach(visit);
    };
    remaining.forEach((record) => visit(record.content));
    const storedImages = await db.documentImages.toCollection().primaryKeys();
    const orphanedImages = storedImages.filter((id) => !referencedAssets.has(String(id)));
    await db.documentImages.bulkDelete(orphanedImages);
  });
}

export function isSchoolDocument(value: unknown): value is SchoolDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<SchoolDocument>;
  const margins = document.margins;
  return typeof document.id === "string" && document.id.length > 0 &&
    typeof document.title === "string" &&
    typeof document.createdAt === "number" && Number.isFinite(document.createdAt) &&
    typeof document.updatedAt === "number" && Number.isFinite(document.updatedAt) &&
    document.paperSize === "A4" &&
    (document.orientation === "portrait" || document.orientation === "landscape") &&
    Boolean(margins && ["top", "right", "bottom", "left"].every((key) =>
      Number.isFinite(margins[key as keyof typeof margins]) &&
      margins[key as keyof typeof margins] >= 10 &&
      margins[key as keyof typeof margins] <= 40
    )) &&
    typeof document.header === "string" && typeof document.footer === "string";
}

export function isDocumentContent(value: unknown): value is SchoolDocumentContent {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SchoolDocumentContent>;
  return typeof record.id === "string" &&
    Boolean(record.content && typeof record.content === "object" && record.content.type === "doc") &&
    typeof record.plainText === "string";
}
