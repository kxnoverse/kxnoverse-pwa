import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type PdfProject } from "../data/db";
import { i18n, i18nReady } from "../i18n";
import { PdfAnnotationWorkspace } from "./PdfAnnotationWorkspace";

const pdfMocks = vi.hoisted(() => ({
  loadPdfJs: vi.fn(),
  buildAnnotatedPdf: vi.fn(),
}));

vi.mock("../data/docs-pdf", async (importOriginal) => ({
  ...await importOriginal<typeof import("../data/docs-pdf")>(),
  loadPdfJs: pdfMocks.loadPdfJs,
  buildAnnotatedPdf: pdfMocks.buildAnnotatedPdf,
}));

vi.mock("../data/docs-export", () => ({
  downloadBlob: vi.fn(),
  safeFilename: (value: string) => value,
}));

const canvasContext = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
  setLineDash: vi.fn(),
} as unknown as CanvasRenderingContext2D;

const project: PdfProject = {
  id: "pdf-project",
  title: "Worksheet",
  sourceFileId: "pdf-source",
  pageCount: 2,
  createdAt: 1,
  updatedAt: 1,
  annotations: [],
};

function installPdfMocks() {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    cleanup: vi.fn(),
  };
  const pdf = {
    numPages: 2,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(async () => undefined),
  };
  pdfMocks.loadPdfJs.mockResolvedValue({
    getDocument: () => ({ promise: Promise.resolve(pdf) }),
  });
  pdfMocks.buildAnnotatedPdf.mockResolvedValue(new Blob(["annotated"], { type: "application/pdf" }));
}

describe("PDF annotation workspace text boxes", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    db.close();
    await db.delete();
    await db.open();
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal("PointerEvent", MouseEvent);
    installPdfMocks();
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(element: Element) {
        Object.defineProperty(element, "clientWidth", { configurable: true, value: 900 });
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const element = this as HTMLElement;
      return {
        x: 100,
        y: 50,
        left: 100,
        top: 50,
        width: Number.parseFloat(element.style.width) || 612,
        height: Number.parseFloat(element.style.height) || 792,
        right: 100 + (Number.parseFloat(element.style.width) || 612),
        bottom: 50 + (Number.parseFloat(element.style.height) || 792),
        toJSON: () => ({}),
      };
    });
    await db.files.add({
      id: project.sourceFileId,
      name: "worksheet.pdf",
      type: "application/pdf",
      size: 5,
      category: "docs-pdf-original",
      createdAt: 1,
      modifiedAt: 1,
      blob: new Blob(["%PDF-"], { type: "application/pdf" }),
    });
    await db.pdfProjects.add(project);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLCanvasElement.prototype, "setPointerCapture");
    db.close();
    await db.delete();
  });

  it("places and saves a text box directly on the original PDF, then restores it after reopening", async () => {
    const saveProject = async (next: PdfProject) => {
      await db.pdfProjects.put({ ...next, updatedAt: Date.now() });
    };
    const firstView = render(
      <PdfAnnotationWorkspace project={project} subjects={[]} onProjectChange={saveProject} onBack={vi.fn()} />,
    );
    const addTextBox = await screen.findByRole("button", { name: "Text / select" });
    const annotationCanvas = await screen.findByLabelText("Editable PDF annotations");
    await waitFor(() => {
      const error = screen.queryAllByRole("alert")[0];
      if (error) throw new Error(error.textContent || "PDF failed to load.");
      expect((annotationCanvas as HTMLCanvasElement).style.width).not.toBe("");
    });

    expect(screen.queryByRole("button", { name: /convert/i })).not.toBeInTheDocument();
    fireEvent.click(addTextBox);
    expect(screen.getByText("Click the PDF page to place the text box.")).toBeInTheDocument();
    const bounds = annotationCanvas.getBoundingClientRect();
    fireEvent.pointerDown(annotationCanvas, {
      pointerId: 1,
      clientX: bounds.left + bounds.width * 0.25,
      clientY: bounds.top + bounds.height * 0.3,
    });

    const editor = await screen.findByRole("textbox", { name: "Text box on PDF page 1" });
    expect(editor).toBeInTheDocument();
    const initialWidth = Number.parseFloat((editor as HTMLInputElement).style.width);
    expect(initialWidth).toBeGreaterThan(25);
    expect(initialWidth).toBeLessThan(100);
    expect(editor).toHaveAttribute("type", "text");
    fireEvent.change(editor, { target: { value: "Answer on the original page" } });
    expect(Number.parseFloat((editor as HTMLInputElement).style.width)).toBeGreaterThan(initialWidth);
    await waitFor(async () => {
      expect((await db.pdfProjects.get(project.id))?.annotations[0]).toMatchObject({
        type: "text",
        color: "#000000",
        page: 1,
        text: "Answer on the original page",
        x: 0.25,
        y: 0.3,
      });
    });
    expect(await db.documents.count()).toBe(0);
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "Text box on PDF page 1" })).not.toBeInTheDocument();
    const persistedAnnotation = (await db.pdfProjects.get(project.id))!.annotations[0];
    fireEvent.pointerDown(annotationCanvas, {
      pointerId: 5,
      clientX: bounds.left + bounds.width * (persistedAnnotation.x + 0.01),
      clientY: bounds.top + bounds.height * (persistedAnnotation.y + 0.01),
    });
    fireEvent.pointerMove(annotationCanvas, {
      pointerId: 5,
      clientX: bounds.left + bounds.width * (persistedAnnotation.x + 0.06),
      clientY: bounds.top + bounds.height * (persistedAnnotation.y + 0.04),
    });
    fireEvent.pointerUp(annotationCanvas, {
      pointerId: 5,
      clientX: bounds.left + bounds.width * (persistedAnnotation.x + 0.06),
      clientY: bounds.top + bounds.height * (persistedAnnotation.y + 0.04),
    });
    await waitFor(async () => {
      expect((await db.pdfProjects.get(project.id))?.annotations[0]).toMatchObject({
        x: expect.closeTo(persistedAnnotation.x + 0.05, 2),
        y: expect.closeTo(persistedAnnotation.y + 0.03, 2),
      });
    });
    const movedAnnotation = (await db.pdfProjects.get(project.id))!.annotations[0];
    fireEvent.pointerDown(annotationCanvas, {
      pointerId: 2,
      clientX: bounds.left + bounds.width * (movedAnnotation.x + 0.01),
      clientY: bounds.top + bounds.height * (movedAnnotation.y + 0.01),
    });
    fireEvent.pointerUp(annotationCanvas, {
      pointerId: 2,
      clientX: bounds.left + bounds.width * (movedAnnotation.x + 0.01),
      clientY: bounds.top + bounds.height * (movedAnnotation.y + 0.01),
    });
    expect(await screen.findByRole("textbox", { name: "Text box on PDF page 1" })).toHaveValue("Answer on the original page");

    const positionBeforeZoom = Number.parseFloat((screen.getByRole("textbox", { name: "Text box on PDF page 1" }) as HTMLInputElement).style.left);
    await screen.findByRole("button", { name: "Zoom in" }).then((button) => fireEvent.click(button));
    await waitFor(() => {
      expect(Number.parseFloat((screen.getByRole("textbox", { name: "Text box on PDF page 1" }) as HTMLInputElement).style.left))
        .toBeGreaterThan(positionBeforeZoom);
    });

    fireEvent.change(screen.getByLabelText("Annotation color"), { target: { value: "#123456" } });
    await waitFor(async () => {
      expect((await db.pdfProjects.get(project.id))?.annotations[0].color).toBe("#123456");
    });
    expect(screen.queryByRole("textbox", { name: "Text box on PDF page 1" })).not.toBeInTheDocument();

    fireEvent.click(addTextBox);
    const moveHandle = screen.getByRole("button", { name: "Move text box on PDF page 1" });
    const moveStart = (await db.pdfProjects.get(project.id))!.annotations[0];
    const moveBounds = annotationCanvas.getBoundingClientRect();
    fireEvent.pointerDown(moveHandle, {
      pointerId: 4,
      clientX: moveBounds.left + moveBounds.width * moveStart.x,
      clientY: moveBounds.top + moveBounds.height * moveStart.y,
    });
    fireEvent.pointerMove(moveHandle, {
      pointerId: 4,
      clientX: moveBounds.left + moveBounds.width * (moveStart.x + 0.05),
      clientY: moveBounds.top + moveBounds.height * (moveStart.y + 0.03),
    });
    fireEvent.pointerUp(moveHandle, {
      pointerId: 4,
      clientX: moveBounds.left + moveBounds.width * (moveStart.x + 0.05),
      clientY: moveBounds.top + moveBounds.height * (moveStart.y + 0.03),
    });
    await waitFor(async () => {
      expect((await db.pdfProjects.get(project.id))?.annotations[0]).toMatchObject({
        x: expect.closeTo(moveStart.x + 0.05, 2),
        y: expect.closeTo(moveStart.y + 0.03, 2),
      });
    });

    firstView.unmount();
    const reopenedProject = (await db.pdfProjects.get(project.id))!;
    render(
      <PdfAnnotationWorkspace project={reopenedProject} subjects={[]} onProjectChange={saveProject} onBack={vi.fn()} />,
    );
    const reopenedCanvas = await screen.findByLabelText("Editable PDF annotations");
    await waitFor(() => expect((reopenedCanvas as HTMLCanvasElement).style.width).not.toBe(""));
    const reopenedBounds = reopenedCanvas.getBoundingClientRect();
    fireEvent.pointerDown(reopenedCanvas, {
      pointerId: 3,
      clientX: reopenedBounds.left + reopenedBounds.width * reopenedProject.annotations[0].x,
      clientY: reopenedBounds.top + reopenedBounds.height * reopenedProject.annotations[0].y,
    });
    fireEvent.pointerUp(reopenedCanvas, {
      pointerId: 3,
      clientX: reopenedBounds.left + reopenedBounds.width * reopenedProject.annotations[0].x,
      clientY: reopenedBounds.top + reopenedBounds.height * reopenedProject.annotations[0].y,
    });
    expect(await screen.findByRole("textbox", { name: "Text box on PDF page 1" }))
      .toHaveValue("Answer on the original page");
  });
});
