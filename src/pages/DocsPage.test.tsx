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

function renderDocsPage(initialEntry = "/docs") {
  return render(<MemoryRouter initialEntries={[initialEntry]}><DocsPage /></MemoryRouter>);
}

function findDocumentEditor() {
  return screen.findByRole("textbox", { name: "Document editor" }, { timeout: 5000 });
}

describe("Kxno Docs editor", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    vi.stubGlobal("PointerEvent", class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    });
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
    vi.unstubAllGlobals();
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
    const view = renderDocsPage(`/docs?document=${document.id}`);
    const editor = await findDocumentEditor();
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
    expect(await findDocumentEditor()).toHaveTextContent("Photosynthesis notes");
  });

  it("inserts an editable diagram into a document and persists edits to its nodes", async () => {
    const docRecord = await createDocument("Process notes");
    const user = userEvent.setup();
    renderDocsPage();
    await findDocumentEditor();

    await user.click(screen.getByRole("button", { name: "Insert diagram" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Insert diagram" }));

    const editButton = await screen.findByRole("button", { name: "Edit diagram" });
    await user.click(editButton);
    const editDialog = await screen.findByRole("dialog");
    await user.click(within(editDialog).getByRole("button", { name: "Start node" }));
    await user.clear(within(editDialog).getByLabelText("Label"));
    await user.type(within(editDialog).getByLabelText("Label"), "Read the brief");
    await user.click(within(editDialog).getByRole("button", { name: "Update in document" }));

    await waitFor(async () => {
      const saved = await db.documentContents.get(docRecord.id);
      expect(JSON.stringify(saved?.content)).toContain("Read the brief");
    }, { timeout: 5000 });
    expect(screen.getByRole("button", { name: "Edit diagram" })).toBeInTheDocument();
  });

  it("opens the existing assistant with the current document and saved conversation history", async () => {
    const docRecord = await createDocument("Revision");
    await saveDocument(docRecord, {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Photosynthesis notes" }] }],
    });
    await db.aiConversations.add({
      id: "docs-assistant-history",
      title: "Biology review",
      updatedAt: 123,
      presetId: "study-assistant",
    });
    await db.aiMessages.add({
      id: "docs-assistant-message",
      conversationId: "docs-assistant-history",
      role: "user",
      content: "Explain chlorophyll",
      createdAt: 123,
    });
    const user = userEvent.setup();
    renderDocsPage(`/docs?document=${docRecord.id}`);
    await findDocumentEditor();

    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(await screen.findByRole("checkbox", { name: "Include current document" }, { timeout: 5000 })).toBeChecked();
    expect(await screen.findByText("Biology review", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("Explain chlorophyll", {}, { timeout: 5000 })).toBeInTheDocument();
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
    await findDocumentEditor();
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
    expect(await findDocumentEditor()).toBeInTheDocument();

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
    await findDocumentEditor();

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
    expect(await findDocumentEditor()).toBeInTheDocument();
    expect(await db.documents.count()).toBe(1);
    expect(await db.documentContents.count()).toBe(1);
  });

  it("deletes the selected document without leaving a stale load error", async () => {
    await createDocument("Temporary");
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDocsPage();
    await findDocumentEditor();
    await user.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(async () => {
      expect(await db.documents.count()).toBe(0);
    });
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("switches between the Documents, Notes, and Tasks sections", async () => {
    const user = userEvent.setup();
    renderDocsPage();

    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Documents" }));
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
  });

  it("filters notes by a subject or by no subject", async () => {
    const subject = { id: "history", name: "History", color: "#8da9c0" };
    await db.subjects.add(subject);
    await db.notes.bulkAdd([
      { id: "assigned", title: "Assigned note", content: "", folder: "History", subjectId: subject.id, pinned: false, createdAt: 1, updatedAt: 1 },
      { id: "unassigned", title: "Unassigned note", content: "", folder: "Inbox", pinned: false, createdAt: 2, updatedAt: 2 },
    ]);
    const user = userEvent.setup();
    renderDocsPage("/docs?section=notes");

    const filter = await screen.findByRole("combobox", { name: "Filter by subject" });
    await waitFor(() => expect(filter.querySelector(`option[value="${subject.id}"]`)).not.toBeNull());
    await user.selectOptions(filter, subject.id);
    expect(await screen.findByRole("button", { name: /Assigned note/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unassigned note/ })).not.toBeInTheDocument();
    await user.selectOptions(filter, "__no_subject__");
    expect(await screen.findByRole("button", { name: /Unassigned note/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assigned note/ })).not.toBeInTheDocument();
  });

  it("filters tasks by the same subject selector while preserving task status", async () => {
    const subject = { id: "science", name: "Science", color: "#8da9c0" };
    await db.subjects.add(subject);
    await db.tasks.bulkAdd([
      { id: "assigned", title: "Assigned task", description: "", dueDate: "2099-12-01", priority: "normal", subjectId: subject.id, category: "Homework", tags: [], subtasks: [], completed: false, createdAt: 1, updatedAt: 1 },
      { id: "unassigned", title: "Unassigned task", description: "", dueDate: "2099-12-02", priority: "high", category: "Homework", tags: [], subtasks: [], completed: true, createdAt: 2, updatedAt: 2 },
    ]);
    const user = userEvent.setup();
    renderDocsPage("/docs?section=tasks");

    const filter = await screen.findByRole("combobox", { name: "Filter by subject" });
    await waitFor(() => expect(filter.querySelector(`option[value="${subject.id}"]`)).not.toBeNull());
    await user.selectOptions(filter, subject.id);
    expect(await screen.findByRole("button", { name: "Assigned task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unassigned task" })).not.toBeInTheDocument();
  });

  it("assigns an existing Docs document to a subject without replacing it", async () => {
    const document = await createDocument("Subject document");
    await db.subjects.add({ id: "chemistry", name: "Chemistry", color: "#8da9c0" });
    const user = userEvent.setup();
    renderDocsPage();

    const subjectSelect = await screen.findByRole("combobox", { name: "Subject" });
    await user.selectOptions(subjectSelect, "chemistry");
    await waitFor(async () => expect((await db.documents.get(document.id))?.subjectId).toBe("chemistry"));
    expect(await db.documentContents.get(document.id)).toMatchObject({ id: document.id, plainText: "" });
  });

  it("creates and renames subjects in the unified Docs area", async () => {
    const user = userEvent.setup();
    renderDocsPage();
    await user.click(screen.getByRole("button", { name: "Manage subjects" }));
    await user.type(screen.getByRole("textbox", { name: "New subject" }), "Chemistry");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    expect(await db.subjects.where("name").equals("Chemistry").count()).toBe(1);

    await user.clear(screen.getByRole("textbox", { name: "Rename Chemistry" }));
    await user.type(screen.getByRole("textbox", { name: "Rename Chemistry" }), "Chemistry II");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.subjects.where("name").equals("Chemistry II").count()).toBe(1);
  });

  it("redirects legacy template section links to Documents without changing stored templates", async () => {
    await db.docsTemplates.add({
      id: "legacy-template",
      name: "Saved template",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      createdAt: 1,
      updatedAt: 1,
    });
    const user = userEvent.setup();
    renderDocsPage("/docs?section=templates");

    expect(await screen.findByRole("button", { name: "Documents" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Templates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Templates" })).not.toBeInTheDocument();
    expect(await db.docsTemplates.get("legacy-template")).toMatchObject({ name: "Saved template" });
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
  });

  it("supports snapping, dragging, resizing, styling, and persistence for document widgets", async () => {
    const documentRecord = await createDocument("Existing notes");
    const user = userEvent.setup();
    const view = renderDocsPage(`/docs?document=${documentRecord.id}`);
    await findDocumentEditor();

    await user.click(screen.getByText("Widgets"));
    const addCallout = screen.getByRole("button", { name: "Callout" });
    expect(addCallout).toHaveAttribute("draggable", "true");
    await user.click(addCallout);

    const widget = globalThis.document.querySelector<HTMLElement>(".docs-widget--callout");
    await user.click(widget!.querySelector(".docs-widget__drag")!);
    expect(await screen.findByRole("slider", { name: "Widget width" })).toBeInTheDocument();
    const dragHandle = widget!.querySelector<HTMLElement>(".docs-widget__drag")!;
    fireEvent.pointerDown(dragHandle, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(dragHandle, { pointerId: 1, clientX: 23, clientY: 34 });
    fireEvent.pointerUp(dragHandle, { pointerId: 1, clientX: 23, clientY: 34 });
    fireEvent.change(screen.getByRole("slider", { name: "Widget width" }), { target: { value: "75" } });
    fireEvent.change(within(globalThis.document.querySelector(".docs-widget__controls")!).getByLabelText("Text color"), { target: { value: "#123456" } });
    await user.click(screen.getByRole("checkbox", { name: "Show alignment grid" }));
    expect(globalThis.document.querySelector(".docs-paper--grid")).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.documentContents.get(documentRecord.id))?.content).toMatchObject({
        type: "doc",
        content: expect.arrayContaining([expect.objectContaining({
          type: "documentWidget",
          attrs: expect.objectContaining({ kind: "callout", positioned: true, x: 16, y: 32, width: 75, textColor: "#123456" }),
        })]),
      });
    }, { timeout: 5000 });
    view.unmount();

    renderDocsPage(`/docs?document=${documentRecord.id}`);
    await findDocumentEditor();
    expect(globalThis.document.querySelector(".docs-widget--callout")).toHaveClass("docs-widget--positioned");
    expect(await db.documentContents.get(documentRecord.id)).toMatchObject({
      content: { content: expect.arrayContaining([expect.objectContaining({ attrs: expect.objectContaining({ x: 16, y: 32, width: 75 }) })]) },
    });
    const reopenedWidget = globalThis.document.querySelector<HTMLElement>(".docs-widget--callout")!;
    await user.type(reopenedWidget.querySelector(".docs-widget__content")!, "Saved widget text");
    await waitFor(async () => {
      expect((await db.documentContents.get(documentRecord.id))?.plainText).toContain("Saved widget text");
    }, { timeout: 5000 });
    await user.click(reopenedWidget.querySelector(".docs-widget__drag")!);
    await user.click(screen.getByRole("button", { name: "Remove widget" }));
    await waitFor(async () => {
      expect((await db.documentContents.get(documentRecord.id))?.content)
        .not.toMatchObject({ content: expect.arrayContaining([expect.objectContaining({ type: "documentWidget" })]) });
    }, { timeout: 5000 });
  });
});
