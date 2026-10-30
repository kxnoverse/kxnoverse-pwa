import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { unzipSync, strFromU8 } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type SchoolDocument } from "./db";
import { buildDocx, exportDocumentText } from "./docs-export";

const documentInfo: SchoolDocument = {
  id: "export-test",
  title: "Biology / Review",
  createdAt: 1,
  updatedAt: 1,
  paperSize: "A4",
  orientation: "landscape",
  margins: { top: 18, right: 20, bottom: 18, left: 20 },
  header: "Cell biology",
  footer: "Study copy",
};

const exportContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Cell structure" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Mitochondria", marks: [{ type: "bold" }] },
        { type: "text", text: " produce energy." },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Membrane" }] }] }],
    },
    {
      type: "table",
      content: [{
        type: "tableRow",
        content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Nucleus" }] }] }],
      }],
    },
    { type: "pageBreak" },
  ],
};

describe("document exports", () => {
  beforeEach(async () => {
    vi.stubGlobal("Blob", NodeBlob);
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    vi.unstubAllGlobals();
  });

  it("creates a readable plain-text export with document content", async () => {
    const blob = exportDocumentText("Biology", exportContent);
    expect(blob.type).toBe("text/plain;charset=utf-8");
    expect(await blob.text()).toContain("Biology\n");
    expect(await blob.text()).toContain("Cell structure\nMitochondria produce energy.");
    expect(await blob.text()).toContain("Membrane");
    expect(await blob.text()).toContain("Nucleus");
  });

  it("creates a real editable DOCX with expected content, formatting, tables, and page settings", async () => {
    const blob = await buildDocx(documentInfo, exportContent);
    expect(blob.size).toBeGreaterThan(0);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = strFromU8(files["word/document.xml"]);
    const relationshipsXml = strFromU8(files["word/_rels/document.xml.rels"]);
    expect(documentXml).toContain("Cell structure");
    expect(documentXml).toContain("Mitochondria");
    expect(documentXml).toContain("<w:b");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("Nucleus");
    expect(documentXml).toContain("<w:br w:type=\"page\"/>");
    expect(documentXml).toContain("<w:pgSz");
    expect(documentXml).toContain("orient=\"landscape\"");
    expect(documentXml).toContain("<w:pgMar");
    expect(documentXml).toContain("headerReference");
    expect(documentXml).toContain("footerReference");
    expect(documentXml).not.toContain("Page");
    expect(documentXml).not.toContain("w:instrText");
    expect(relationshipsXml).toContain("header");
    expect(relationshipsXml).toContain("footer");
  });

  it("uses the Docs font metrics and does not inject a footer or page number", async () => {
    const blob = await buildDocx({ ...documentInfo, header: "", footer: "" }, {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
        { type: "paragraph", content: [{ type: "text", text: "Default body text" }] },
        { type: "paragraph", content: [{ type: "text", text: "Sized text", marks: [{ type: "textStyle", attrs: { fontSize: "16" } }] }] },
      ],
    });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = strFromU8(files["word/document.xml"]);
    const stylesXml = strFromU8(files["word/styles.xml"]);
    const relationshipsXml = strFromU8(files["word/_rels/document.xml.rels"]);
    expect(documentXml).toContain("Default body text");
    expect(documentXml).toContain("<w:sz w:val=\"24\"");
    expect(documentXml).not.toContain("footerReference");
    expect(documentXml).not.toContain("w:instrText");
    expect(stylesXml).toContain("Arial");
    expect(stylesXml).toContain("<w:sz w:val=\"18\"");
    expect(stylesXml).toContain("<w:sz w:val=\"36\"");
    expect(relationshipsXml).not.toContain("footer");
  });

  it("exports widget content and supported widget styling into editable DOCX", async () => {
    const blob = await buildDocx({ ...documentInfo, header: "", footer: "" }, {
      type: "doc",
      content: [{
        type: "documentWidget",
        attrs: {
          kind: "callout",
          positioned: true,
          x: 72,
          y: 80,
          width: 70,
          fontSize: 16,
          spacing: 12,
          textColor: "#223344",
          backgroundColor: "#eaf2f8",
          borderColor: "#6688aa",
        },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Widget content" }] }],
      }],
    });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = strFromU8(files["word/document.xml"]);

    expect(documentXml).toContain("Widget content");
    expect(documentXml).toContain('w:fill="EAF2F8"');
    expect(documentXml).toContain('w:color="6688AA"');
    expect(documentXml).toContain('w:val="223344"');
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).not.toContain("Widget library");
  });

  it("rejects a DOCX export when a referenced image is missing instead of silently dropping it", async () => {
    await expect(buildDocx(documentInfo, {
      type: "doc",
      content: [{ type: "documentImage", attrs: { assetId: "missing" } }],
    })).rejects.toThrow("A document image is missing from local storage.");
  });
});
