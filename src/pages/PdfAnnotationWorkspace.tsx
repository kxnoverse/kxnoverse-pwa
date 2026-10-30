import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, FileText, Grip, Highlighter, LoaderCircle,
  MousePointer2, Pencil, Redo2, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PdfAnnotation, PdfProject, Subject } from "../data/db";
import { db } from "../data/db";
import { buildAnnotatedPdf, loadPdfJs, normalizePdfPoint } from "../data/docs-pdf";
import { downloadBlob, safeFilename } from "../data/docs-export";

type PdfDocumentProxy = Awaited<ReturnType<import("../data/docs-pdf").PdfJsApi["getDocument"]>["promise"]>;
type Tool = "select" | "highlight" | "draw";
type Point = { x: number; y: number };
type RenderSize = { width: number; height: number; scale: number };
type DragState = { id: string; start: Point; original: PdfAnnotation; moveHandle?: boolean };
type Props = {
  project: PdfProject;
  subjects: Subject[];
  onProjectChange: (project: PdfProject) => Promise<void>;
  onBack: () => void;
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
  showText = true,
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
      const maxWidth = (annotation.width ?? Math.max(0.05, 1 - annotation.x)) * width;
      let lineIndex = 0;
      (annotation.text ?? "").split(/\r?\n/).forEach((paragraph) => {
        let line = "";
        paragraph.split(/\s+/).forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (line && context.measureText(next).width > maxWidth) {
            context.fillText(line, annotation.x * width, annotation.y * height + lineIndex * (annotation.fontSize ?? 14) * scale * 1.3);
            lineIndex += 1;
            line = word;
          } else {
            line = next;
          }
        });
        if (line) {
          context.fillText(line, annotation.x * width, annotation.y * height + lineIndex * (annotation.fontSize ?? 14) * scale * 1.3);
          lineIndex += 1;
        }
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
    if (annotation.id === selectedId && annotation.type !== "text") {
      const x = annotation.x * width;
      const y = annotation.y * height;
      const boxWidth = annotation.type === "highlight"
        ? (annotation.width ?? 0) * width
        : 18;
      const boxHeight = annotation.type === "highlight"
        ? (annotation.height ?? 0) * height
        : 18;
      context.setLineDash([4, 3]);
      context.lineWidth = 1;
      context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8dbfd0";
      context.strokeRect(x - 3, y - 3, boxWidth + 6, boxHeight + 6);
    }
    context.restore();
  };
  annotations.filter((annotation) => annotation.page === page && (showText || annotation.type !== "text")).forEach(drawOne);
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

function measureTextBoxWidth(text: string, fontSize: number, scale: number, pageWidth: number, x: number): number {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return Math.min(pageWidth * (1 - x), fontSize * scale * 3 + 8);
  context.font = `${fontSize * scale}px Arial, sans-serif`;
  const textWidth = Math.max(
    context.measureText("00000").width,
    ...text.split(/\r?\n/).map((line) => context.measureText(line).width),
  );
  return Math.min(pageWidth * (1 - x), textWidth + 8);
}

function annotationHit(annotation: PdfAnnotation, point: Point): boolean {
  if (annotation.type === "text") {
    const width = Math.max(annotation.width ?? 0, 0.035, (annotation.text?.length ?? 0) * 0.009);
    return point.x >= annotation.x - 0.01 && point.x <= annotation.x + width &&
      point.y >= annotation.y - 0.01 && point.y <= annotation.y + Math.max(annotation.height ?? 0, 0.045);
  }
  if (annotation.type === "highlight") {
    return point.x >= annotation.x && point.x <= annotation.x + (annotation.width ?? 0) &&
      point.y >= annotation.y && point.y <= annotation.y + (annotation.height ?? 0);
  }
  return (annotation.points ?? []).some((segment) => Math.hypot(segment.x - point.x, segment.y - point.y) < 0.025);
}

export function PdfAnnotationWorkspace({ project, subjects, onProjectChange, onBack }: Props) {
  const { t } = useTranslation();
  const [localProject, setLocalProject] = useState(project);
  const [sourceName, setSourceName] = useState("");
  const [pdf, setPdf] = useState<PdfDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#000000");
  const [selectedId, setSelectedId] = useState("");
  const [editingTextId, setEditingTextId] = useState("");
  const [placingTextBox, setPlacingTextBox] = useState(false);
  const [size, setSize] = useState<RenderSize | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ type: "highlight" | "draw"; points: Point[]; color: string }>();
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number }>();
  const pdfCanvas = useRef<HTMLCanvasElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const textBoxRef = useRef<HTMLInputElement>(null);
  const canvasArea = useRef<HTMLDivElement>(null);
  const renderTask = useRef<{ cancel: () => void } | null>(null);
  const drag = useRef<DragState | null>(null);
  const drawing = useRef(false);
  const undoStack = useRef<PdfAnnotation[][]>([]);
  const redoStack = useRef<PdfAnnotation[][]>([]);
  const projectRef = useRef(localProject);
  projectRef.current = localProject;

  useEffect(() => {
    setLocalProject(project);
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (editingTextId) textBoxRef.current?.focus();
  }, [editingTextId]);
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
    drawAnnotations(canvas, annotations, page, selectedId, size.scale, !placingTextBox, draft);
  }, [localProject.annotations, page, selectedId, size, draft, dragPreview, placingTextBox]);

  const pageAnnotations = useMemo(
    () => localProject.annotations.filter((annotation) => annotation.page === page),
    [localProject.annotations, page],
  );
  const latestPageTextId = [...pageAnnotations].reverse().find((annotation) => annotation.type === "text")?.id;
  const selectedAnnotation = localProject.annotations.find((annotation) => annotation.id === selectedId);

  async function persist(next: PdfProject) {
    projectRef.current = next;
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

  function position(event: ReactPointerEvent<HTMLElement>): Point {
    const canvas = annotationCanvas.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return normalizePdfPoint(event.clientX - bounds.left, event.clientY - bounds.top, bounds.width, bounds.height);
  }

  function pointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!size) return;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const point = position(event);
    if (event.currentTarget !== annotationCanvas.current) {
      const annotationId = event.currentTarget.dataset.annotationId;
      const annotation = pageAnnotations.find((item) => item.id === annotationId);
      if (!annotation || annotation.type !== "text") return;
      setSelectedId(annotation.id);
      setEditingTextId("");
      drag.current = { id: annotation.id, start: point, original: annotation, moveHandle: true };
      setDragPreview(point);
      return;
    }
    if (placingTextBox) {
      const hit = [...pageAnnotations].reverse().find((annotation) =>
        annotation.type === "text" && annotationHit(annotation, point)
      );
      if (hit) {
        setSelectedId(hit.id);
        setEditingTextId("");
        drag.current = { id: hit.id, start: point, original: hit };
        setDragPreview(point);
        return;
      }
      const annotation: PdfAnnotation = {
        id: crypto.randomUUID(),
        page,
        type: "text",
        color,
        x: Math.min(point.x, 0.95),
        y: Math.min(point.y, 0.96),
        fontSize: Math.max(1, Math.min(200, 12 / size.scale)),
        text: "",
      };
      annotation.width = measureTextBoxWidth(
        "",
        annotation.fontSize ?? 12,
        size.scale,
        size.width,
        annotation.x,
      ) / size.width;
      setEditingTextId(annotation.id);
      commitAnnotations([...projectRef.current.annotations, annotation], annotation.id);
      return;
    }
    if (tool === "select") {
      setEditingTextId("");
      const hit = [...pageAnnotations].reverse().find((annotation) => annotationHit(annotation, point));
      setSelectedId(hit?.id ?? "");
      if (hit) {
        drag.current = { id: hit.id, start: point, original: hit };
        setDragPreview(point);
      }
      return;
    }
    drawing.current = true;
    setDraft({ type: tool, points: [point], color });
  }

  function pointerMove(event: ReactPointerEvent<HTMLElement>) {
    const point = position(event);
    if (drag.current) {
      setDragPreview(point);
      return;
    }
    if (!drawing.current) return;
    setDraft((current) => current && ({ ...current, points: [...current.points, point] }));
  }

  function pointerUp(event: ReactPointerEvent<HTMLElement>) {
    const point = position(event);
    if (drag.current) {
      const current = drag.current;
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      const annotations = projectRef.current.annotations.map((annotation) => {
        if (annotation.id !== current.id) return annotation;
        if (Math.hypot(dx, dy) < 0.003) return annotation;
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
      if (Math.hypot(dx, dy) < 0.003) {
        if (current.original.type === "text" && !current.moveHandle) setEditingTextId(current.id);
        return;
      }
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

  const tools: Array<{ id: Tool; icon: typeof MousePointer2; label: string }> = [
    { id: "select", icon: MousePointer2, label: t("docs.pdfSelect") },
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
        <label className="pdf-workspace__subject">
          <span>{t("docs.subject")}</span>
          <select
            aria-label={t("docs.subject")}
            value={localProject.subjectId ?? ""}
            onChange={(event) => {
              const next = { ...localProject, subjectId: event.target.value || undefined, updatedAt: Date.now() };
              setLocalProject(next);
              void persist(next);
            }}
          >
            <option value="">{t("docs.noSubject")}</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        <div className="pdf-workspace__status" role="status">{status}</div>
        <div className="pdf-workspace__header-actions">
          <button type="button" className="pdf-workspace__export" disabled={busy} onClick={() => void exportPdf()}><Download size={14} />{t("docs.pdfExport")}</button>
        </div>
      </header>
      <div className="pdf-workspace__toolbar" role="toolbar" aria-label={t("docs.pdfTools")}>
        <div className="pdf-workspace__tool-group">
          <button
            type="button"
            aria-label={t("docs.pdfTextSelect")}
            aria-pressed={placingTextBox}
            className={placingTextBox ? "is-active" : ""}
            onClick={() => {
              setEditingTextId("");
              setTool("select");
              setPlacingTextBox(true);
            }}
          >
            <Type size={15} /><span>{t("docs.pdfTextSelect")}</span>
          </button>
          {tools.filter(({ id }) => id !== "select").map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" aria-label={label} aria-pressed={tool === id} className={tool === id ? "is-active" : ""} onClick={() => {
              setEditingTextId("");
              setPlacingTextBox(false);
              setTool(id);
            }}>
              <Icon size={15} /><span>{label}</span>
            </button>
          ))}
        </div>
        <label className="pdf-workspace__color" title={t("docs.pdfInkColor")}><span>{t("docs.pdfInk")}</span><input aria-label={t("docs.pdfInkColor")} type="color" value={color} onChange={(event) => {
          const nextColor = event.target.value;
          setColor(nextColor);
          if (selectedAnnotation) {
            commitAnnotations(projectRef.current.annotations.map((annotation) =>
              annotation.id === selectedAnnotation.id ? { ...annotation, color: nextColor } : annotation
            ));
            setEditingTextId("");
          }
        }} /></label>
        <div className="pdf-workspace__tool-group pdf-workspace__history">
          <button type="button" aria-label={t("docs.undo")} disabled={!undoStack.current.length} onClick={undo}><Undo2 size={15} /></button>
          <button type="button" aria-label={t("docs.redo")} disabled={!redoStack.current.length} onClick={redo}><Redo2 size={15} /></button>
          <button type="button" aria-label={t("docs.pdfDeleteAnnotation")} disabled={!selectedAnnotation} onClick={() => commitAnnotations(projectRef.current.annotations.filter((annotation) => annotation.id !== selectedId), "")}><Trash2 size={15} /></button>
        </div>
        <div className="pdf-workspace__zoom">
          <button type="button" aria-label={t("docs.pdfZoomOut")} onClick={() => setZoom((current) => Math.max(0.6, Math.round((current - 0.1) * 10) / 10))}><ZoomOut size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label={t("docs.pdfZoomIn")} onClick={() => setZoom((current) => Math.min(1.8, Math.round((current + 0.1) * 10) / 10))}><ZoomIn size={14} /></button>
        </div>
      </div>
      <p className="pdf-workspace__hint">{placingTextBox ? t("docs.pdfPlaceTextBox") : t("docs.pdfPrivacyHint")}</p>
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
            {placingTextBox && size && pageAnnotations.filter((annotation) =>
              annotation.type === "text" && annotation.id !== editingTextId
            ).map((annotation) => {
              const measuredWidth = measureTextBoxWidth(
                annotation.text ?? "",
                annotation.fontSize ?? 12,
                size.scale,
                size.width,
                annotation.x,
              );
              const width = Math.min(
                Math.max(annotation.width ?? 0, measuredWidth / size.width),
                1 - annotation.x,
              );
              const fontSize = (annotation.fontSize ?? 12) * size.scale;
              return (
                <div
                  key={annotation.id}
                  className="pdf-workspace__saved-text-box"
                  aria-label={t("docs.pdfTextBoxPage", { page })}
                  style={{
                    left: `${annotation.x * size.width}px`,
                    top: `${annotation.y * size.height}px`,
                    width: `${width * size.width}px`,
                    height: `${Math.max(24, fontSize * 1.3 + 4)}px`,
                    fontSize: `${fontSize}px`,
                    lineHeight: `${fontSize * 1.3}px`,
                    color: annotation.color,
                  }}
                >
                  {annotation.text}
                </div>
              );
            })}
            {placingTextBox && size && pageAnnotations.filter((annotation) =>
              annotation.type === "text" && annotation.id === latestPageTextId
            ).map((annotation) => (
              <button
                key={annotation.id}
                type="button"
                className="pdf-workspace__move-handle"
                aria-label={t("docs.pdfMoveTextBox", { page })}
                title={t("docs.pdfMoveTextBox", { page })}
                data-annotation-id={annotation.id}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                style={{ left: `${annotation.x * size.width}px`, top: `${annotation.y * size.height}px` }}
              >
                <Grip size={9} aria-hidden="true" />
              </button>
            ))}
            {size && localProject.annotations.filter((annotation) =>
              annotation.page === page && annotation.type === "text" && annotation.id === editingTextId
            ).map((annotation) => (
              <input
                key={annotation.id}
                ref={textBoxRef}
                className="pdf-workspace__text-box"
                aria-label={t("docs.pdfTextBoxPage", { page })}
                placeholder={t("docs.pdfTextBoxPlaceholder")}
                type="text"
                value={annotation.text ?? ""}
                onChange={(event) => {
                  const text = event.target.value.split(/\r?\n/, 1)[0];
                  event.currentTarget.value = text;
                  const width = measureTextBoxWidth(text, annotation.fontSize ?? 12, size.scale, size.width, annotation.x);
                  commitAnnotations(projectRef.current.annotations.map((item) =>
                    item.id === annotation.id ? { ...item, text, width: width / size.width } : item
                  ));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setEditingTextId("");
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{
                  left: `${annotation.x * size.width}px`,
                  top: `${annotation.y * size.height}px`,
                  width: `${Math.min(
                    Math.max(
                      annotation.width ?? 0,
                      measureTextBoxWidth(
                        annotation.text ?? "",
                        annotation.fontSize ?? 12,
                        size.scale,
                        size.width,
                        annotation.x,
                      ) / size.width,
                    ),
                    1 - annotation.x,
                  ) * size.width}px`,
                  height: `${Math.max(24, (annotation.fontSize ?? 12) * size.scale * 1.3 + 4)}px`,
                  fontSize: `${(annotation.fontSize ?? 12) * size.scale}px`,
                  lineHeight: `${(annotation.fontSize ?? 12) * size.scale * 1.3}px`,
                  color: annotation.color,
                }}
              />
            ))}
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
        </aside>
      </div>
      {error && <p className="pdf-workspace__error-bar" role="alert">{error}</p>}
    </section>
  );
}
