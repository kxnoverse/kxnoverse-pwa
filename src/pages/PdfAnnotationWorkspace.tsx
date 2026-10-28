import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Highlighter, LoaderCircle,
  MousePointer2, Pencil, Redo2, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PdfAnnotation, PdfProject } from "../data/db";
import { db } from "../data/db";
import { buildAnnotatedPdf, createConvertedDocument, loadPdfJs, normalizePdfPoint, pdfTextItemsToDocumentText } from "../data/docs-pdf";
import { downloadBlob, safeFilename } from "../data/docs-export";

type PdfDocumentProxy = Awaited<ReturnType<import("../data/docs-pdf").PdfJsApi["getDocument"]>["promise"]>;
type Tool = "select" | "text" | "highlight" | "draw";
type Point = { x: number; y: number };
type RenderSize = { width: number; height: number; scale: number };
type DragState = { id: string; start: Point; original: PdfAnnotation };
type Props = {
  project: PdfProject;
  onProjectChange: (project: PdfProject) => Promise<void>;
  onBack: () => void;
  onConverted: (documentId: string) => void;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function colorWithOpacity(color: string, opacity: number): string {
  const parsed = Number.parseInt(color.slice(1), 16);
  return `rgba(${(parsed >> 16) & 255}, ${(parsed >> 8) & 255}, ${parsed & 255}, ${opacity})`;
}

function drawAnnotations(
  canvas: HTMLCanvasElement,
  annotations: PdfAnnotation[],
  page: number,
  selectedId: string,
  scale: number,
  draft?: { type: "highlight" | "draw"; points: Point[]; color: string },
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Number(canvas.dataset.cssWidth ?? 0);
  const height = Number(canvas.dataset.cssHeight ?? 0);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const drawOne = (annotation: PdfAnnotation) => {
    context.save();
    context.strokeStyle = annotation.color;
    context.fillStyle = annotation.color;
    if (annotation.type === "text") {
      context.font = `${annotation.fontSize ? annotation.fontSize * scale : 14}px Arial, sans-serif`;
      context.textBaseline = "top";
      (annotation.text ?? "").split(/\r?\n/).forEach((line, index) => {
        context.fillText(line, annotation.x * width, annotation.y * height + index * 18);
      });
    } else if (annotation.type === "highlight") {
      context.globalAlpha = 0.28;
      context.fillRect(
        annotation.x * width,
        annotation.y * height,
        (annotation.width ?? 0) * width,
        (annotation.height ?? 0) * height,
      );
    } else {
      const points = annotation.points ?? [];
      if (points.length > 1) {
        context.lineWidth = 2.25;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(points[0].x * width, points[0].y * height);
        points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
        context.stroke();
      }
    }
    if (annotation.id === selectedId) {
      const x = annotation.x * width;
      const y = annotation.y * height;
      const boxWidth = annotation.type === "highlight"
        ? (annotation.width ?? 0) * width
        : annotation.type === "text" ? Math.max(42, (annotation.text?.length ?? 0) * 7.5) : 18;
      const boxHeight = annotation.type === "highlight"
        ? (annotation.height ?? 0) * height
        : annotation.type === "text" ? Math.max(22, (annotation.text?.split(/\r?\n/).length ?? 1) * 18) : 18;
      context.setLineDash([4, 3]);
      context.lineWidth = 1;
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8dbfd0";
      context.strokeRect(x - 3, y - 3, boxWidth + 6, boxHeight + 6);
    }
    context.restore();
  };
  annotations.filter((annotation) => annotation.page === page).forEach(drawOne);
  if (draft && draft.points.length) {
    const color = draft.color;
    if (draft.type === "draw" && draft.points.length > 1) {
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 2.25;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(draft.points[0].x * width, draft.points[0].y * height);
      draft.points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
      context.stroke();
      context.restore();
    } else if (draft.type === "highlight" && draft.points.length > 1) {
      const [from, to] = [draft.points[0], draft.points[draft.points.length - 1]];
      context.save();
      context.fillStyle = colorWithOpacity(color, 0.28);
      context.fillRect(from.x * width, from.y * height, (to.x - from.x) * width, (to.y - from.y) * height);
      context.restore();
    }
  }
}

function annotationHit(annotation: PdfAnnotation, point: Point): boolean {
  if (annotation.type === "text") {
    const width = Math.max(0.035, (annotation.text?.length ?? 0) * 0.009);
    return point.x >= annotation.x - 0.01 && point.x <= annotation.x + width &&
      point.y >= annotation.y - 0.01 && point.y <= annotation.y + 0.045;
  }
  if (annotation.type === "highlight") {
    return point.x >= annotation.x && point.x <= annotation.x + (annotation.width ?? 0) &&
      point.y >= annotation.y && point.y <= annotation.y + (annotation.height ?? 0);
  }
  return (annotation.points ?? []).some((segment) => Math.hypot(segment.x - point.x, segment.y - point.y) < 0.025);
}

export function PdfAnnotationWorkspace({ project, onProjectChange, onBack, onConverted }: Props) {
  const { t } = useTranslation();
  const [localProject, setLocalProject] = useState(project);
  const [sourceName, setSourceName] = useState("");
  const [pdf, setPdf] = useState<PdfDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e6bc62");
  const [textDraft, setTextDraft] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [size, setSize] = useState<RenderSize | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ type: "highlight" | "draw"; points: Point[]; color: string }>();
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number }>();
  const pdfCanvas = useRef<HTMLCanvasElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const canvasArea = useRef<HTMLDivElement>(null);
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const drag = useRef<DragState | null>(null);
  const drawing = useRef(false);
  const undoStack = useRef<PdfAnnotation[][]>([]);
  const redoStack = useRef<PdfAnnotation[][]>([]);
  const projectRef = useRef(localProject);
  projectRef.current = localProject;

  useEffect(() => setLocalProject(project), [project]);
  useEffect(() => {
    const element = canvasArea.current;
    if (!element) return;
    const resize = () => setContainerWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loaded: PdfDocumentProxy | null = null;
    setPdf(null);
    setError("");
    setStatus(t("docs.pdfLoading"));
    void (async () => {
      const original = await db.files.get(project.sourceFileId);
      if (!original || original.type !== "application/pdf") throw new Error(t("docs.pdfMissingOriginal"));
      setSourceName(original.name);
      const pdfjs = await loadPdfJs();
      loaded = await pdfjs.getDocument({ data: new Uint8Array(await original.blob.arrayBuffer()) }).promise;
      if (!active) {
        await loaded.destroy();
        return;
      }
      if (loaded.numPages !== project.pageCount) throw new Error(t("docs.pdfInvalid"));
      setPdf(loaded);
      setPage((current) => Math.min(current, loaded!.numPages));
      setStatus(t("docs.pdfReady", { count: loaded.numPages }));
    })().catch((reason: unknown) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : t("docs.pdfOpenError"));
        setStatus("");
      }
    });
    return () => {
      active = false;
      renderTask.current?.cancel();
      if (loaded) void loaded.destroy();
    };
  }, [project.id, project.sourceFileId, project.pageCount, t]);

  useEffect(() => {
    let active = true;
    renderTask.current?.cancel();
    setSize(null);
    const canvas = pdfCanvas.current;
    if (!pdf || !canvas || containerWidth <= 0) return () => { active = false; };
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(1.4, Math.max(0.2, (containerWidth - 48) / base.width)) * zoom;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ width: viewport.width, height: viewport.height, scale });
      const task = pdfPage.render({
        canvasContext: canvas.getContext("2d")!,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      renderTask.current = task;
      await task.promise;
      if (active) {
        pdfPage.cleanup();
        setStatus(t("docs.pdfReady", { count: pdf.numPages }));
      }
    })().catch((reason: unknown) => {
      if (active && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
        setError(reason instanceof Error ? reason.message : t("docs.pdfRenderError"));
      }
    });
    return () => {
      active = false;
      renderTask.current?.cancel();
    };
  }, [pdf, page, zoom, containerWidth, t]);

  useEffect(() => {
    const canvas = annotationCanvas.current;
    if (!canvas || !size) return;
    canvas.dataset.cssWidth = String(size.width);
    canvas.dataset.cssHeight = String(size.height);
    const annotations = localProject.annotations.map((annotation) => {
      if (annotation.id !== selectedId || !dragPreview) return annotation;
      const dx = dragPreview.x - (drag.current?.start.x ?? dragPreview.x);
      const dy = dragPreview.y - (drag.current?.start.y ?? dragPreview.y);
      const original = drag.current?.original;
      if (!original || original.id !== annotation.id) return annotation;
      if (original.type === "draw") {
        return {
          ...annotation,
          x: clamp(original.x + dx),
          y: clamp(original.y + dy),
          points: original.points?.map((point) => ({ x: clamp(point.x + dx), y: clamp(point.y + dy) })),
        };
      }
      return { ...annotation, x: clamp(original.x + dx), y: clamp(original.y + dy) };
    });
    drawAnnotations(canvas, annotations, page, selectedId, size.scale, draft);
  }, [localProject.annotations, page, selectedId, size, draft, dragPreview]);

  const pageAnnotations = useMemo(
    () => localProject.annotations.filter((annotation) => annotation.page === page),
    [localProject.annotations, page],
  );
  const selectedAnnotation = localProject.annotations.find((annotation) => annotation.id === selectedId);

  async function persist(next: PdfProject) {
    setLocalProject(next);
    setStatus(t("docs.pdfSaving"));
    setError("");
    try {
      await onProjectChange(next);
      setStatus(t("docs.pdfReady", { count: next.pageCount }));
    } catch {
      setError(t("docs.pdfSaveError"));
      setStatus("");
    }
  }

  function commitAnnotations(annotations: PdfAnnotation[], nextSelection = selectedId) {
    const previous = projectRef.current;
    undoStack.current.push(previous.annotations);
    redoStack.current = [];
    setSelectedId(nextSelection);
    void persist({ ...previous, annotations, updatedAt: Date.now() });
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(projectRef.current.annotations);
    void persist({ ...projectRef.current, annotations: previous, updatedAt: Date.now() });
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(projectRef.current.annotations);
    void persist({ ...projectRef.current, annotations: next, updatedAt: Date.now() });
  }

  function position(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return normalizePdfPoint(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height);
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!size) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = position(event);
    if (tool === "select") {
      const hit = [...pageAnnotations].reverse().find((annotation) => annotationHit(annotation, point));
      setSelectedId(hit?.id ?? "");
      if (hit) {
        drag.current = { id: hit.id, start: point, original: hit };
        setDragPreview(point);
      }
      return;
    }
    if (tool === "text") {
      const text = textDraft.trim();
      if (!text) {
        setError(t("docs.pdfEnterText"));
        return;
      }
      const annotation: PdfAnnotation = {
        id: crypto.randomUUID(), page, type: "text", color, x: point.x, y: point.y, text,
        fontSize: Math.max(1, Math.min(200, 14 / size.scale)),
      };
      commitAnnotations([...projectRef.current.annotations, annotation], annotation.id);
      setTextDraft("");
      return;
    }
    drawing.current = true;
    setDraft({ type: tool, points: [point], color });
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = position(event);
    if (drag.current) {
      setDragPreview(point);
      return;
    }
    if (!drawing.current) return;
    setDraft((current) => current && ({ ...current, points: [...current.points, point] }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = position(event);
    if (drag.current) {
      const current = drag.current;
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      const annotations = projectRef.current.annotations.map((annotation) => {
        if (annotation.id !== current.id) return annotation;
        if (current.original.type === "draw") {
          return {
            ...annotation,
            x: clamp(current.original.x + dx),
            y: clamp(current.original.y + dy),
            points: current.original.points?.map((entry) => ({ x: clamp(entry.x + dx), y: clamp(entry.y + dy) })),
          };
        }
        return { ...annotation, x: clamp(current.original.x + dx), y: clamp(current.original.y + dy) };
      });
      drag.current = null;
      setDragPreview(undefined);
      commitAnnotations(annotations, current.id);
      return;
    }
    if (!drawing.current || !draft) return;
    drawing.current = false;
    const points = [...draft.points, point];
    const annotation: PdfAnnotation = draft.type === "highlight"
      ? {
          id: crypto.randomUUID(), page, type: "highlight", color: draft.color,
          x: Math.min(points[0].x, point.x), y: Math.min(points[0].y, point.y),
          width: Math.abs(point.x - points[0].x), height: Math.abs(point.y - points[0].y),
        }
      : { id: crypto.randomUUID(), page, type: "draw", color: draft.color, x: points[0].x, y: points[0].y, points };
    setDraft(undefined);
    if (draft.type === "draw" && points.length < 2) return;
    if (draft.type === "highlight" && ((annotation.width ?? 0) < 0.004 || (annotation.height ?? 0) < 0.004)) return;
    commitAnnotations([...projectRef.current.annotations, annotation], annotation.id);
  }

  async function exportPdf() {
    setBusy(true);
    setError("");
    try {
      const blob = await buildAnnotatedPdf(localProject);
      downloadBlob(blob, `${safeFilename(localProject.title)}-annotated.pdf`);
      setStatus(t("docs.pdfExported"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("docs.pdfExportError"));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function convertToText() {
    if (!window.confirm(t("docs.pdfConvertWarning"))) return;
    setBusy(true);
    setError("");
    setStatus(t("docs.pdfConverting"));
    try {
      const original = await db.files.get(localProject.sourceFileId);
      if (!original) throw new Error(t("docs.pdfMissingOriginal"));
      const pdfjs = await loadPdfJs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await original.blob.arrayBuffer()) }).promise;
      const pageText: string[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const pdfPage = await pdf.getPage(pageNumber);
          const text = await pdfPage.getTextContent();
          const items = text.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } =>
            "str" in item && "transform" in item && "width" in item
          );
          pageText.push(pdfTextItemsToDocumentText(items));
          pdfPage.cleanup();
        }
      } finally {
        await pdf.destroy();
      }
      const text = pageText.filter(Boolean).join("\n\n");
      if (!text.trim()) throw new Error(t("docs.pdfOcrRequired"));
      const id = await createConvertedDocument(`${localProject.title} — ${t("docs.pdfConverted")}`, text);
      onConverted(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("docs.pdfConvertError"));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const tools: Array<{ id: Tool; icon: typeof MousePointer2; label: string }> = [
    { id: "select", icon: MousePointer2, label: t("docs.pdfSelect") },
    { id: "text", icon: Type, label: t("docs.pdfText") },
    { id: "highlight", icon: Highlighter, label: t("docs.pdfHighlight") },
    { id: "draw", icon: Pencil, label: t("docs.pdfDraw") },
  ];

  return (
    <section className="pdf-workspace" aria-label={t("docs.pdfWorkspace")}>
      <header className="pdf-workspace__header">
        <button className="docs-icon-button" type="button" aria-label={t("docs.pdfBack")} onClick={onBack}><ArrowLeft size={16} /></button>
        <div className="pdf-workspace__identity">
          <FileText size={16} aria-hidden="true" />
          <div>
            <input
              aria-label={t("docs.pdfProjectTitle")}
              value={localProject.title}
              onChange={(event) => {
                const title = event.target.value.slice(0, 160);
                setLocalProject((current) => ({ ...current, title }));
              }}
              onBlur={() => {
                if (localProject.title.trim()) void persist({ ...localProject, title: localProject.title.trim(), updatedAt: Date.now() });
              }}
            />
            <span>{sourceName}</span>
          </div>
        </div>
        <div className="pdf-workspace__status" role="status">{status}</div>
        <div className="pdf-workspace__header-actions">
          <button type="button" className="docs-icon-button" aria-label={t("docs.pdfConvert")} title={t("docs.pdfConvert")} disabled={busy} onClick={() => void convertToText()}><FileText size={15} /></button>
          <button type="button" className="pdf-workspace__export" disabled={busy} onClick={() => void exportPdf()}><Download size={14} />{t("docs.pdfExport")}</button>
        </div>
      </header>
      <div className="pdf-workspace__toolbar" role="toolbar" aria-label={t("docs.pdfTools")}>
        <div className="pdf-workspace__tool-group">
          {tools.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" aria-label={label} aria-pressed={tool === id} className={tool === id ? "is-active" : ""} onClick={() => setTool(id)}>
              <Icon size={15} /><span>{label}</span>
            </button>
          ))}
        </div>
        {tool === "text" && <input className="pdf-workspace__text-input" aria-label={t("docs.pdfAnnotationText")} placeholder={t("docs.pdfAnnotationText")} value={textDraft} onChange={(event) => setTextDraft(event.target.value)} />}
        <label className="pdf-workspace__color" title={t("docs.pdfInkColor")}><span>{t("docs.pdfInk")}</span><input aria-label={t("docs.pdfInkColor")} type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <div className="pdf-workspace__tool-group pdf-workspace__history">
          <button type="button" aria-label={t("docs.undo")} disabled={!undoStack.current.length} onClick={undo}><Undo2 size={15} /></button>
          <button type="button" aria-label={t("docs.redo")} disabled={!redoStack.current.length} onClick={redo}><Redo2 size={15} /></button>
          <button type="button" aria-label={t("docs.pdfDeleteAnnotation")} disabled={!selectedAnnotation} onClick={() => commitAnnotations(projectRef.current.annotations.filter((annotation) => annotation.id !== selectedId), "")}><Trash2 size={15} /></button>
        </div>
        {selectedAnnotation?.type === "text" && (
          <input
            className="pdf-workspace__text-input pdf-workspace__text-input--edit"
            aria-label={t("docs.pdfEditAnnotation")}
            value={selectedAnnotation.text ?? ""}
            onChange={(event) => commitAnnotations(projectRef.current.annotations.map((annotation) =>
              annotation.id === selectedAnnotation.id ? { ...annotation, text: event.target.value } : annotation
            ))}
          />
        )}
        <div className="pdf-workspace__zoom">
          <button type="button" aria-label={t("docs.pdfZoomOut")} onClick={() => setZoom((current) => Math.max(0.6, Math.round((current - 0.1) * 10) / 10))}><ZoomOut size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label={t("docs.pdfZoomIn")} onClick={() => setZoom((current) => Math.min(1.8, Math.round((current + 0.1) * 10) / 10))}><ZoomIn size={14} /></button>
        </div>
      </div>
      <p className="pdf-workspace__hint">{t("docs.pdfPrivacyHint")}</p>
      <div className="pdf-workspace__body">
        <div className="pdf-workspace__stage" ref={canvasArea}>
          {error && <div className="pdf-workspace__error" role="alert">{error}</div>}
          {!pdf && !error && <div className="pdf-workspace__loading" role="status"><LoaderCircle size={18} />{status}</div>}
          <div className="pdf-workspace__sheet" style={size ? { width: size.width, height: size.height } : undefined}>
            <canvas ref={pdfCanvas} aria-label={t("docs.pdfPage", { page, count: localProject.pageCount })} />
            <canvas
              ref={annotationCanvas}
              className={`pdf-workspace__annotation-layer pdf-workspace__annotation-layer--${tool}`}
              aria-label={t("docs.pdfAnnotationCanvas")}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={pointerUp}
            />
          </div>
        </div>
        <aside className="pdf-workspace__page-panel">
          <span>{t("docs.pdfPages")}</span>
          <div className="pdf-workspace__page-controls">
            <button type="button" aria-label={t("docs.pdfPreviousPage")} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /></button>
            <span>{page} / {localProject.pageCount}</span>
            <button type="button" aria-label={t("docs.pdfNextPage")} disabled={page >= localProject.pageCount} onClick={() => setPage((current) => Math.min(localProject.pageCount, current + 1))}><ChevronRight size={15} /></button>
          </div>
          <div className="pdf-workspace__annotation-count">{t("docs.pdfAnnotationCount", { count: pageAnnotations.length })}</div>
          <button className="pdf-workspace__convert-link" type="button" disabled={busy} onClick={() => void convertToText()}>{t("docs.pdfConvert")}</button>
        </aside>
      </div>
      {error && <p className="pdf-workspace__error-bar" role="alert">{error}</p>}
    </section>
  );
}
