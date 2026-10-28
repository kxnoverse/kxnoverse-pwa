import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import { createDocument, saveDocument } from "../data/docs";
import { importPdfProject } from "../data/docs-pdf";
import { createDocumentPrintFrame } from "../data/docs-print";
import { i18n, i18nReady } from "../i18n";
import { DocsPage } from "./DocsPage";

vi.mock("../data/docs-pdf", () => ({
  importPdfProject: vi.fn(),
  updatePdfProject: vi.fn(),
}));

vi.mock("./PdfAnnotationWorkspace", () => ({
  PdfAnnotationWorkspace: ({ project }: { project: { title: string } }) => (
    <section aria-label="PDF annotation workspace">{project.title}</section>
  ),
}));

function renderDocsPage() {
  return render(<MemoryRouter><DocsPage /></MemoryRouter>);
}

describe("Kxno Docs editor", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    localStorage.clear();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
    Object.defineProperty(HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value: () => [{ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }],
    });
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [{ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    });
    db.close();
    await db.delete();
    await db.open();
    vi.mocked(importPdfProject).mockReset();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
    Reflect.deleteProperty(document, "elementFromPoint");
    Reflect.deleteProperty(HTMLElement.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  });

  it("autosaves editor changes locally and reloads the saved content", async () => {
    const document = await createDocument("Revision");
    const user = userEvent.setup();
    const view = renderDocsPage();
    const editor = await screen.findByRole("textbox", { name: "Document editor" });
    await user.type(editor, "Photosynthesis notes");

    await waitFor(async () => {
      expect((await db.documentContents.get(document.id))?.plainText).toBe("Photosynthesis notes");
    }, { timeout: 5000 });
    view.unmount();

    const persisted = await db.documentContents.get(document.id);
    expect(persisted?.plainText).toBe("Photosynthesis notes");
    expect(persisted?.content).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Photosynthesis notes" }] }],
    });
    renderDocsPage();
    expect(await screen.findByRole("textbox", { name: "Document editor" })).toHaveTextContent("Photosynthesis notes");
  });

  it("keeps dark paper preview visual-only and leaves stored formatting unchanged", async () => {
    const docRecord = await createDocument("Styled");
    const content = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "Important", marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#b42318" } }] }],
      }],
    };
    await saveDocument(docRecord, content);
    const user = userEvent.setup();
    renderDocsPage();
    const toggle = await screen.findByRole("button", { name: "Dark paper preview" });

    await user.click(toggle);
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).toBeInTheDocument();
    expect(await db.documentContents.get(docRecord.id)).toMatchObject({ content });

    await user.click(screen.getByRole("button", { name: "Normal paper" }));
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).not.toBeInTheDocument();
    expect(await db.documentContents.get(docRecord.id)).toMatchObject({ content });
  });

  it("provides A4 print settings independent of the selected paper preview", async () => {
    const docRecord = await createDocument("Print layout");
    await db.documents.update(docRecord.id, {
      orientation: "landscape",
      margins: { top: 16, right: 18, bottom: 20, left: 22 },
    });
    const user = userEvent.setup();
    renderDocsPage();
    await screen.findByRole("textbox", { name: "Document editor" });
    const pageStyle = globalThis.document.querySelector(".docs-paper style")?.textContent ?? "";
    expect(pageStyle).toContain("@page { size: A4 landscape; margin: 16mm 18mm 20mm 22mm");

    await user.click(screen.getByRole("button", { name: "Dark paper preview" }));
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).toBeInTheDocument();
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain(".docs-page-viewport--dark .docs-paper");
    expect(css).toContain("background: #fff !important");
  });

  it("keeps the document list, search and selected document when collapsing the sidebar", async () => {
    const first = await createDocument("Biology");
    await createDocument("History");
    const user = userEvent.setup();
    renderDocsPage();
    expect(await screen.findByRole("textbox", { name: "Document editor" })).toBeInTheDocument();

    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveTextContent("Docs");
    const search = within(sidebar).getByRole("textbox", { name: "Search documents" });
    await user.type(search, "Biol");
    await user.click(screen.getByRole("button", { name: /Biology/ }));
    const collapse = within(sidebar).getByRole("button", { name: "Collapse document list" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    await user.click(collapse);

    expect(screen.getByRole("button", { name: "Expand document list" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("textbox", { name: "Document editor" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand document list" }));
    expect(screen.getByRole("textbox", { name: "Search documents" })).toHaveValue("Biol");
    expect(screen.getByRole("button", { name: /Biology/ })).toHaveAttribute("aria-current", "page");
    expect(await db.documents.get(first.id)).toBeDefined();
  });

  it("opens a newly imported PDF instead of restoring the prior document route", async () => {
    const existing = await createDocument("Existing document");
    const project = {
      id: "pdf-project-check",
      title: "Imported worksheet",
      sourceFileId: "pdf-source-check",
      pageCount: 1,
      createdAt: 1,
      updatedAt: 1,
      annotations: [],
    };
    await db.files.add({
      id: project.sourceFileId,
      name: "worksheet.pdf",
      type: "application/pdf",
      size: 5,
      category: "docs-pdf-original",
      createdAt: 1,
      modifiedAt: 1,
      blob: new Blob(["%PDF-"]),
    });
    await db.pdfProjects.add(project);
    vi.mocked(importPdfProject).mockResolvedValue(project);
    render(<MemoryRouter initialEntries={[`/docs?document=${existing.id}`]}><DocsPage /></MemoryRouter>);
    await screen.findByRole("textbox", { name: "Document editor" });

    const input = screen.getByLabelText("Import PDF", { selector: "input" });
    fireEvent.change(input, { target: { files: [new File(["%PDF-"], "worksheet.pdf", { type: "application/pdf" })] } });

    expect(await screen.findByRole("region", { name: "PDF annotation workspace" })).toHaveTextContent("Imported worksheet");
    expect(screen.queryByRole("textbox", { name: "Document editor" })).not.toBeInTheDocument();
    expect(await db.documents.count()).toBe(1);
    expect(await db.pdfProjects.count()).toBe(1);
    expect(screen.queryByRole("button", { name: /convert/i })).not.toBeInTheDocument();
  });

  it("creates an isolated print view with only document content and configured page formatting", async () => {
    const docRecord = await createDocument("Print specimen");
    await db.documents.update(docRecord.id, {
      orientation: "landscape",
      margins: { top: 16, right: 18, bottom: 20, left: 22 },
    });
    const source = globalThis.document.createElement("div");
    source.className = "docs-prose ProseMirror-focused";
    source.setAttribute("contenteditable", "true");
    source.innerHTML = '<h1>Study title</h1><p><strong>Only this text</strong></p><div data-doc-page-break=""><span>Page break</span></div><div class="docs-image-node"><img alt="diagram"><input type="range"></div>';
    const frame = createDocumentPrintFrame(source, {
      ...docRecord,
      orientation: "landscape",
      margins: { top: 16, right: 18, bottom: 20, left: 22 },
    });
    const output = frame.contentDocument!;
    expect(output.body.textContent).toContain("Study title");
    expect(output.body.textContent).toContain("Only this text");
    expect(output.body.textContent).not.toContain("Page break");
    expect(output.querySelector("input")).not.toBeInTheDocument();
    expect(output.querySelector("[contenteditable]")).not.toBeInTheDocument();
    expect(output.querySelector("style")?.textContent).toContain("@page { size: A4 landscape; margin: 16mm 18mm 20mm 22mm");
    expect(output.title).toBe("");
    frame.remove();
  });

  it("opens a new local document from the empty state", async () => {
    const user = userEvent.setup();
    renderDocsPage();
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);
    expect(await screen.findByRole("textbox", { name: "Document editor" })).toBeInTheDocument();
    expect(await db.documents.count()).toBe(1);
    expect(await db.documentContents.count()).toBe(1);
  });

  it("deletes the selected document without leaving a stale load error", async () => {
    await createDocument("Temporary");
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDocsPage();
    await screen.findByRole("textbox", { name: "Document editor" });
    await user.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(async () => {
      expect(await db.documents.count()).toBe(0);
    });
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
