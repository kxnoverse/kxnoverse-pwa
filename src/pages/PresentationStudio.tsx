import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDown, ArrowRight, ArrowUp, Copy, Download, FileUp, ImagePlus, Plus,
  Presentation, RectangleHorizontal, Save, Trash2, Type, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { createId, db, type PresentationElement, type PresentationProject, type PresentationShape, type PresentationSlide } from "../data/db";
import { downloadBlob, safeFilename } from "../data/docs-export";
import {
  createPresentationProject, deletePresentationProject, duplicatePresentationProject, exportPresentationPptx,
  importPresentationPptx, isPresentationProject, PRESENTATION_HEIGHT, PRESENTATION_TEMPLATES,
  PRESENTATION_WIDTH, savePresentationProject,
} from "../data/presentations";

type DragState = {
  id: string;
  startX: number;
  startY: number;
  elementX: number;
  elementY: number;
  canvasWidth: number;
  canvasHeight: number;
};

function SlideImage({ element }: { element: PresentationElement }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!element.blob) return;
    const url = URL.createObjectURL(element.blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [element.blob]);
  return src ? <img alt={element.imageName ?? ""} src={src} draggable={false} /> : null;
}

function elementLabel(element: PresentationElement, index: number, fallback: string): string {
  const text = element.text?.trim();
  return text ? text.slice(0, 36) : `${fallback} ${index + 1}`;
}

export function PresentationStudio() {
  const { t } = useTranslation();
  const projects = useLiveQuery(() => db.presentations.orderBy("updatedAt").reverse().toArray(), [], []);
  const [project, setProject] = useState<PresentationProject | null>(null);
  const [activeSlideId, setActiveSlideId] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("");
  const [templateDraft, setTemplateDraft] = useState<(typeof PRESENTATION_TEMPLATES)[number]["id"]>("northstar");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const projectRef = useRef<PresentationProject | null>(null);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const activeSlide = project?.slides.find((item) => item.id === activeSlideId) ?? project?.slides[0] ?? null;
  const selectedElement = activeSlide?.elements.find((item) => item.id === selectedElementId) ?? null;
  const template = useMemo(() => PRESENTATION_TEMPLATES.find((item) => item.id === project?.templateId), [project?.templateId]);

  useEffect(() => {
    if (project || !projects.length) return;
    const first = projects.find(isPresentationProject);
    if (!first) return;
    const opened = structuredClone(first);
    projectRef.current = opened;
    setProject(opened);
    setActiveSlideId(opened.slides[0]?.id ?? "");
  }, [project, projects]);

  useEffect(() => {
    if (!project || !dirtyRef.current) return;
    const revision = revisionRef.current;
    const snapshot = structuredClone(project);
    const timer = window.setTimeout(() => {
      void savePresentationProject(snapshot).then(() => {
        if (revisionRef.current === revision) {
          dirtyRef.current = false;
          setSaveState("saved");
          setError("");
        }
      }).catch(() => {
        if (revisionRef.current === revision) {
          setSaveState("error");
          setError(t("presentation.saveError"));
        }
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [project, t]);

  useEffect(() => () => {
    const pending = projectRef.current;
    if (!pending || !dirtyRef.current) return;
    void savePresentationProject(pending).catch((reason: unknown) => {
      console.error("Failed to save the presentation while leaving the editor.", reason);
    });
  }, []);

  function markProjectChanged(next: PresentationProject) {
    const normalized = { ...next, updatedAt: Date.now() };
    projectRef.current = normalized;
    dirtyRef.current = true;
    revisionRef.current += 1;
    setSaveState("saving");
    setError("");
    setProject(normalized);
  }

  function updateProject(change: (current: PresentationProject) => PresentationProject) {
    const current = projectRef.current;
    if (!current) return;
    const next = change(current);
    if (next !== current) markProjectChanged(next);
  }

  function updateActiveSlide(change: (current: PresentationSlide) => PresentationSlide) {
    if (!activeSlide) return;
    updateProject((current) => ({
      ...current,
      slides: current.slides.map((item) => item.id === activeSlide.id ? change(item) : item),
    }));
  }

  async function createProject(templateId: (typeof PRESENTATION_TEMPLATES)[number]["id"]) {
    const created = { ...createPresentationProject(templateId), name: t(`presentation.templates.${templateId}`) };
    try {
      const saved = await savePresentationProject(created);
      projectRef.current = saved;
      dirtyRef.current = false;
      revisionRef.current += 1;
      setProject(saved);
      setActiveSlideId(saved.slides[0]?.id ?? "");
      setSelectedElementId("");
      setSaveState("saved");
      setError("");
    } catch {
      setError(t("presentation.saveError"));
    }
  }

  async function saveNow() {
    const current = projectRef.current;
    if (!current) return;
    try {
      const saved = await savePresentationProject(current);
      projectRef.current = saved;
      dirtyRef.current = false;
      revisionRef.current += 1;
      setProject(saved);
      setSaveState("saved");
      setError("");
    } catch {
      setSaveState("error");
      setError(t("presentation.saveError"));
    }
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsImporting(true);
    setImportStatus("");
    setError("");
    try {
      const imported = await importPresentationPptx(file);
      const saved = await savePresentationProject(imported);
      projectRef.current = saved;
      dirtyRef.current = false;
      revisionRef.current += 1;
      setProject(saved);
      setActiveSlideId(saved.slides[0]?.id ?? "");
      setSelectedElementId("");
      setImportStatus(t("presentation.importSuccess", { count: saved.slides.length }));
      setSaveState("saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("presentation.importError"));
    } finally {
      setIsImporting(false);
    }
  }

  async function exportProject() {
    if (!project) return;
    try {
      const file = await exportPresentationPptx(project);
      downloadBlob(file, `${safeFilename(project.name || t("presentation.untitled"))}.pptx`);
      setError("");
    } catch {
      setError(t("presentation.exportError"));
    }
  }

  async function duplicateProject() {
    if (!project) return;
    const copy = duplicatePresentationProject(project, t("docs.copySuffix"));
    try {
      const saved = await savePresentationProject(copy);
      projectRef.current = saved;
      dirtyRef.current = false;
      revisionRef.current += 1;
      setProject(saved);
      setActiveSlideId(saved.slides[0]?.id ?? "");
      setSelectedElementId("");
      setSaveState("saved");
    } catch {
      setError(t("presentation.saveError"));
    }
  }

  async function removeProject() {
    if (!project || !window.confirm(t("presentation.deleteProjectConfirm", { name: project.name }))) return;
    try {
      revisionRef.current += 1;
      await deletePresentationProject(project.id);
      projectRef.current = null;
      dirtyRef.current = false;
      setProject(null);
      setActiveSlideId("");
      setSelectedElementId("");
      setSaveState("saved");
      setError("");
    } catch {
      setError(t("presentation.deleteError"));
    }
  }

  function openProject(id: string) {
    const saved = projects.find((item) => item.id === id);
    if (!saved || !isPresentationProject(saved)) return;
    if (dirtyRef.current && !window.confirm(t("presentation.discardConfirm"))) return;
    revisionRef.current += 1;
    const opened = structuredClone(saved);
    projectRef.current = opened;
    dirtyRef.current = false;
    setProject(opened);
    setActiveSlideId(opened.slides[0]?.id ?? "");
    setSelectedElementId("");
    setSaveState("saved");
    setError("");
  }

  function addSlide() {
    if (!project) return;
    const next: PresentationSlide = {
      id: createId(),
      title: t("presentation.newSlide"),
      background: activeSlide?.background ?? "#FFFFFF",
      layout: "blank",
      elements: [{
        id: createId(), kind: "text", x: 80, y: 80, width: 820, height: 100,
        text: t("presentation.newSlide"), color: "#17212B", fontSize: 36, bold: true, fontFamily: "Arial",
      }],
    };
    updateProject((current) => ({ ...current, slides: [...current.slides, next] }));
    setActiveSlideId(next.id);
    setSelectedElementId("");
  }

  function duplicateSlide() {
    if (!activeSlide) return;
    const copy: PresentationSlide = {
      ...structuredClone(activeSlide),
      id: createId(),
      title: `${activeSlide.title} ${t("docs.copySuffix")}`,
      elements: activeSlide.elements.map((item) => ({ ...item, id: createId() })),
    };
    updateProject((current) => {
      const index = current.slides.findIndex((item) => item.id === activeSlide.id);
      const slides = [...current.slides];
      slides.splice(index + 1, 0, copy);
      return { ...current, slides };
    });
    setActiveSlideId(copy.id);
    setSelectedElementId("");
  }

  function deleteSlide() {
    if (!project || !activeSlide || project.slides.length <= 1) return;
    if (!window.confirm(t("presentation.deleteSlideConfirm", { name: activeSlide.title }))) return;
    const index = project.slides.findIndex((item) => item.id === activeSlide.id);
    const nextSlide = project.slides[index - 1] ?? project.slides[index + 1];
    updateProject((current) => ({ ...current, slides: current.slides.filter((item) => item.id !== activeSlide.id) }));
    setActiveSlideId(nextSlide?.id ?? "");
    setSelectedElementId("");
  }

  function moveSlide(delta: -1 | 1) {
    if (!project || !activeSlide) return;
    const index = project.slides.findIndex((item) => item.id === activeSlide.id);
    const target = index + delta;
    if (target < 0 || target >= project.slides.length) return;
    updateProject((current) => {
      const slides = [...current.slides];
      [slides[index], slides[target]] = [slides[target], slides[index]];
      return { ...current, slides };
    });
  }

  function addElement(kind: "text" | "shape") {
    if (!activeSlide) return;
    const element: PresentationElement = kind === "text"
      ? { id: createId(), kind, x: 120, y: 150, width: 440, height: 80, text: t("presentation.textPlaceholder"), color: "#17212B", fontSize: 32, fontFamily: "Arial" }
      : { id: createId(), kind, x: 170, y: 175, width: 240, height: 150, text: "", shape: "rectangle", fill: "#B8F4D6", color: "#17212B", fontSize: 20 };
    updateActiveSlide((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
  }

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeSlide) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError(t("presentation.imageError"));
      return;
    }
    const element: PresentationElement = {
      id: createId(),
      kind: "image",
      x: 170,
      y: 130,
      width: 500,
      height: 280,
      blob: file,
      mimeType: file.type as "image/png" | "image/jpeg",
      imageName: file.name,
    };
    updateActiveSlide((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedElementId(element.id);
    setError("");
  }

  function updateElement(updates: Partial<PresentationElement>) {
    if (!selectedElement) return;
    updateActiveSlide((current) => ({
      ...current,
      elements: current.elements.map((item) => item.id === selectedElement.id ? { ...item, ...updates } : item),
    }));
  }

  function removeElement() {
    if (!selectedElement) return;
    updateActiveSlide((current) => ({
      ...current,
      elements: current.elements.filter((item) => item.id !== selectedElement.id),
    }));
    setSelectedElementId("");
  }

  function startMove(event: ReactPointerEvent<HTMLButtonElement>, element: PresentationElement) {
    if (event.button !== 0 || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedElementId(element.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const bounds = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: element.id,
      startX: event.clientX,
      startY: event.clientY,
      elementX: element.x,
      elementY: element.y,
      canvasWidth: Math.max(1, bounds.width),
      canvasHeight: Math.max(1, bounds.height),
    };
  }

  function moveElement(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const current = projectRef.current;
    if (!drag || !current) return;
    const x = Math.max(0, Math.min(PRESENTATION_WIDTH - 1,
      drag.elementX + (event.clientX - drag.startX) / drag.canvasWidth * PRESENTATION_WIDTH));
    const y = Math.max(0, Math.min(PRESENTATION_HEIGHT - 1,
      drag.elementY + (event.clientY - drag.startY) / drag.canvasHeight * PRESENTATION_HEIGHT));
    const next = {
      ...current,
      slides: current.slides.map((item) => item.id !== activeSlide?.id ? item : {
        ...item,
        elements: item.elements.map((element) => element.id === drag.id ? {
          ...element,
          x: Math.min(PRESENTATION_WIDTH - element.width, x),
          y: Math.min(PRESENTATION_HEIGHT - element.height, y),
        } : element),
      }),
    };
    projectRef.current = next;
    setProject(next);
  }

  function finishMove() {
    if (!dragRef.current) return;
    dragRef.current = null;
    const current = projectRef.current;
    if (current) markProjectChanged(current);
  }

  function renderElement(element: PresentationElement, index: number) {
    const selected = element.id === selectedElementId;
    const style: React.CSSProperties = {
      left: `${element.x / PRESENTATION_WIDTH * 100}%`,
      top: `${element.y / PRESENTATION_HEIGHT * 100}%`,
      width: `${element.width / PRESENTATION_WIDTH * 100}%`,
      height: `${element.height / PRESENTATION_HEIGHT * 100}%`,
      color: element.color ?? "#17212B",
      background: element.fill && element.fill !== "transparent" ? element.fill : "transparent",
      borderRadius: element.shape === "circle" ? "50%" : element.shape === "rounded" ? "12px" : 0,
      fontFamily: element.fontFamily ?? "Arial",
      fontSize: `${(element.fontSize ?? 20) / 10}cqw`,
      fontWeight: element.bold ? 700 : 400,
      outline: selected ? "2px solid var(--accent)" : "1px solid transparent",
    };
    return (
      <button
        key={element.id}
        type="button"
        className={`presentation-stage__element presentation-stage__element--${element.kind}${element.shape === "line" ? " is-line" : ""}`}
        aria-label={elementLabel(element, index, t(`presentation.${element.kind}`))}
        aria-pressed={selected}
        onPointerDown={(event) => startMove(event, element)}
        onPointerMove={moveElement}
        onPointerUp={finishMove}
        onPointerCancel={finishMove}
        onClick={() => setSelectedElementId(element.id)}
        style={style}
      >
        {element.kind === "image" ? <SlideImage element={element} /> : element.text}
      </button>
    );
  }

  return (
    <section className="presentation-studio" aria-label={t("presentation.title")}>
      <header className="presentation-studio__header">
        <div className="presentation-studio__heading">
          <Presentation size={20} />
          <div><h1>{t("presentation.title")}</h1><p>{t("presentation.subtitle")}</p></div>
        </div>
        <div className="presentation-studio__actions">
          {project && <span className={`presentation-studio__save presentation-studio__save--${saveState}`} role="status">{t(`presentation.${saveState}`)}</span>}
          <label className="presentation-studio__template-select">
            <span>{t("presentation.newFromTemplate")}</span>
            <select value={templateDraft} onChange={(event) => setTemplateDraft(event.target.value as typeof templateDraft)}>
              {PRESENTATION_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" className="presentation-button presentation-button--quiet" onClick={() => void createProject(templateDraft)}><Plus size={15} />{t("presentation.new")}</button>
          <button type="button" className="presentation-button presentation-button--quiet" disabled={isImporting} onClick={() => importRef.current?.click()}><FileUp size={15} />{isImporting ? t("presentation.importing") : t("presentation.import")}</button>
          <input ref={importRef} className="visually-hidden" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" aria-label={t("presentation.import")} onChange={(event) => void importProject(event)} />
        </div>
      </header>

      {importStatus && <p className="presentation-studio__notice" role="status">{importStatus}</p>}
      {error && <p className="presentation-studio__error" role="alert">{error}</p>}

      <div className="presentation-studio__workspace">
        <aside className="presentation-studio__sidebar" aria-label={t("presentation.projectsAndSlides")}>
          <section className="presentation-studio__project-list">
            <h2>{t("presentation.projects")}</h2>
            {projects.filter(isPresentationProject).map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === project?.id ? "is-active" : ""}
                aria-current={item.id === project?.id ? "page" : undefined}
                onClick={() => openProject(item.id)}
              >
                <Presentation size={14} /><span>{item.name}</span><small>{item.slides.length}</small>
              </button>
            ))}
            {!projects.length && <p>{t("presentation.noProjects")}</p>}
          </section>
          {project && (
            <section className="presentation-studio__slide-list">
              <div><h2>{t("presentation.slides")}</h2><button type="button" aria-label={t("presentation.addSlide")} onClick={addSlide}><Plus size={15} /></button></div>
              {project.slides.map((item, index) => (
                <div className={`presentation-slide-row${item.id === activeSlide?.id ? " is-active" : ""}`} key={item.id}>
                  <span className="presentation-slide-row__thumbnail" style={{ background: item.background }} aria-hidden="true">
                    {item.elements.slice(0, 7).map((element) => (
                      <i
                        key={element.id}
                        style={{
                          left: `${element.x / PRESENTATION_WIDTH * 100}%`,
                          top: `${element.y / PRESENTATION_HEIGHT * 100}%`,
                          width: `${element.width / PRESENTATION_WIDTH * 100}%`,
                          height: `${element.height / PRESENTATION_HEIGHT * 100}%`,
                          borderRadius: element.shape === "circle" ? "50%" : element.shape === "rounded" ? "3px" : 0,
                          background: element.kind === "text"
                            ? element.color ?? "#17212B"
                            : element.kind === "image" ? "#AAB6C2" : element.fill ?? "#B8F4D6",
                        }}
                      />
                    ))}
                  </span>
                  <button type="button" className="presentation-slide-row__open" onClick={() => {
                    setActiveSlideId(item.id);
                    setSelectedElementId("");
                  }}>
                    <span className="presentation-slide-row__number">{String(index + 1).padStart(2, "0")}</span>
                    <span>{item.title || t("presentation.untitledSlide")}</span>
                  </button>
                  <button type="button" aria-label={t("presentation.moveSlideUp")} disabled={index === 0} onClick={() => {
                    if (item.id === activeSlide?.id) moveSlide(-1);
                    else {
                      const opened = project.slides.findIndex((slideItem) => slideItem.id === item.id);
                      const target = opened - 1;
                      if (target < 0) return;
                      updateProject((current) => {
                        const slides = [...current.slides];
                        [slides[opened], slides[target]] = [slides[target], slides[opened]];
                        return { ...current, slides };
                      });
                    }
                  }}><ArrowUp size={13} /></button>
                  <button type="button" aria-label={t("presentation.moveSlideDown")} disabled={index === project.slides.length - 1} onClick={() => {
                    if (item.id === activeSlide?.id) moveSlide(1);
                    else {
                      const opened = project.slides.findIndex((slideItem) => slideItem.id === item.id);
                      const target = opened + 1;
                      if (target >= project.slides.length) return;
                      updateProject((current) => {
                        const slides = [...current.slides];
                        [slides[opened], slides[target]] = [slides[target], slides[opened]];
                        return { ...current, slides };
                      });
                    }
                  }}><ArrowDown size={13} /></button>
                </div>
              ))}
            </section>
          )}
        </aside>

        {project && activeSlide ? (
          <>
            <main className="presentation-studio__main">
              <div className="presentation-studio__deckbar">
                <input
                  aria-label={t("presentation.projectName")}
                  maxLength={120}
                  value={project.name}
                  onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value }))}
                  onBlur={(event) => {
                    const name = event.currentTarget.value.trim() || t("presentation.untitled");
                    updateProject((current) => ({ ...current, name }));
                  }}
                />
                <input
                  className="presentation-studio__slide-title"
                  aria-label={t("presentation.slideTitle")}
                  maxLength={160}
                  value={activeSlide.title}
                  onChange={(event) => updateActiveSlide((current) => ({ ...current, title: event.target.value }))}
                />
                <span>{template ? t(`presentation.templates.${template.id}`) : t("presentation.imported")}</span>
                <div>
                  <button type="button" aria-label={t("presentation.addText")} onClick={() => addElement("text")}><Type size={15} /></button>
                  <button type="button" aria-label={t("presentation.addShape")} onClick={() => addElement("shape")}><RectangleHorizontal size={15} /></button>
                  <button type="button" aria-label={t("presentation.addImage")} onClick={() => imageRef.current?.click()}><ImagePlus size={15} /></button>
                  <input ref={imageRef} className="visually-hidden" type="file" accept="image/png,image/jpeg" aria-label={t("presentation.addImage")} onChange={(event) => void addImage(event)} />
                  <span className="presentation-studio__divider" />
                  <button type="button" aria-label={t("presentation.duplicateSlide")} onClick={duplicateSlide}><Copy size={15} /></button>
                  <button type="button" aria-label={t("presentation.deleteSlide")} disabled={project.slides.length <= 1} onClick={deleteSlide}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="presentation-studio__canvas-scroll">
                <div
                  ref={canvasRef}
                  className="presentation-stage"
                  aria-label={t("presentation.slideCanvas", { index: project.slides.findIndex((item) => item.id === activeSlide.id) + 1 })}
                  style={{ background: activeSlide.background }}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) setSelectedElementId("");
                  }}
                >
                  {activeSlide.elements.map(renderElement)}
                </div>
              </div>
              <footer className="presentation-studio__statusbar">
                <span>{t("presentation.slideCount", { current: project.slides.findIndex((item) => item.id === activeSlide.id) + 1, total: project.slides.length })}</span>
                <button type="button" onClick={() => void saveNow()}><Save size={13} />{t("presentation.saveNow")}</button>
                <button type="button" onClick={() => void exportProject()}><Download size={13} />{t("presentation.export")}</button>
              </footer>
            </main>
            <aside className="presentation-studio__inspector" aria-label={t("presentation.properties")}>
              <header><h2>{t("presentation.properties")}</h2><label>{t("presentation.background")}<input type="color" value={activeSlide.background} onChange={(event) => updateActiveSlide((current) => ({ ...current, background: event.target.value }))} /></label></header>
              {selectedElement ? (
                <div className="presentation-inspector__fields">
                  <div className="presentation-inspector__selected"><span>{t(`presentation.${selectedElement.kind}`)}</span><button type="button" aria-label={t("presentation.removeElement")} onClick={removeElement}><X size={14} /></button></div>
                  {selectedElement.kind !== "image" && (
                    <label>{t("presentation.text")}
                      <textarea rows={5} value={selectedElement.text ?? ""} onChange={(event) => updateElement({ text: event.target.value })} />
                    </label>
                  )}
                  {selectedElement.kind !== "image" && (
                    <label>{t("presentation.fontSize")}
                      <input type="number" min={6} max={120} value={selectedElement.fontSize ?? 20} onChange={(event) => updateElement({ fontSize: Number(event.target.value) })} />
                    </label>
                  )}
                  {selectedElement.kind !== "image" && (
                    <label>{t("presentation.textColor")}
                      <input type="color" value={selectedElement.color ?? "#17212B"} onChange={(event) => updateElement({ color: event.target.value })} />
                    </label>
                  )}
                  {selectedElement.kind === "shape" && (
                    <>
                      <label>{t("presentation.shape")}
                        <select value={selectedElement.shape ?? "rectangle"} onChange={(event) => updateElement({ shape: event.target.value as PresentationShape })}>
                          <option value="rectangle">{t("presentation.rectangle")}</option>
                          <option value="rounded">{t("presentation.rounded")}</option>
                          <option value="circle">{t("presentation.circle")}</option>
                          <option value="line">{t("presentation.line")}</option>
                        </select>
                      </label>
                      <label>{t("presentation.fillColor")}
                        <input type="color" value={selectedElement.fill && selectedElement.fill !== "transparent" ? selectedElement.fill : "#FFFFFF"} onChange={(event) => updateElement({ fill: event.target.value })} />
                      </label>
                    </>
                  )}
                  <label>{t("presentation.width")}
                    <input type="number" min={24} max={PRESENTATION_WIDTH} value={Math.round(selectedElement.width)} onChange={(event) => updateElement({ width: Math.max(24, Math.min(PRESENTATION_WIDTH - selectedElement.x, Number(event.target.value))) })} />
                  </label>
                  <label>{t("presentation.height")}
                    <input type="number" min={18} max={PRESENTATION_HEIGHT} value={Math.round(selectedElement.height)} onChange={(event) => updateElement({ height: Math.max(18, Math.min(PRESENTATION_HEIGHT - selectedElement.y, Number(event.target.value))) })} />
                  </label>
                  {selectedElement.kind === "image" && <span className="presentation-inspector__filename">{selectedElement.imageName}</span>}
                </div>
              ) : (
                <p className="presentation-inspector__empty">{t("presentation.selectElement")}</p>
              )}
              <div className="presentation-inspector__deck-actions">
                <button type="button" onClick={() => void duplicateProject()}><Copy size={14} />{t("presentation.duplicateProject")}</button>
                <button type="button" onClick={() => void removeProject()}><Trash2 size={14} />{t("presentation.deleteProject")}</button>
              </div>
            </aside>
          </>
        ) : (
          <main className="presentation-studio__welcome">
            <div className="presentation-welcome__intro"><span><Presentation size={20} /></span><h2>{t("presentation.welcomeTitle")}</h2><p>{t("presentation.welcomeText")}</p></div>
            <div className="presentation-template-gallery">
              {PRESENTATION_TEMPLATES.map((item) => (
                <button type="button" key={item.id} onClick={() => void createProject(item.id)} className={`presentation-template-card presentation-template-card--${item.id}`}>
                  <span className="presentation-template-card__preview" aria-hidden="true">
                    <i /><b /><em />
                  </span>
                  <strong>{t(`presentation.templates.${item.id}`)}</strong><small>{t(`presentation.templateDescriptions.${item.id}`)}</small><span className="presentation-template-card__action">{t("presentation.useTemplate")}<ArrowRight size={14} /></span>
                </button>
              ))}
            </div>
          </main>
        )}
      </div>
    </section>
  );
}
