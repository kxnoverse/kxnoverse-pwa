import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock3, Download, FileText, Image, Link2, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createId, db, type LocalFile, type SchoolNote, type WorkspaceElement, type WorkspaceState } from "../data/db";
import { connectWorkspaceElements, DEFAULT_WORKSPACE, isWorkspaceState, removeWorkspaceConnection, removeWorkspaceElement, saveWorkspace } from "../data/workspace";
import { useUiStore } from "../stores/ui-store";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 140;

type Gesture =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: "move" | "resize"; pointerId: number; elementId: string; startX: number; startY: number; originX: number; originY: number; width: number; height: number };

function WorkspaceImage({ file, name }: { file: LocalFile; name: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file.id, file.modifiedAt]);
  return url ? <img className="workspace-card__image" alt={name} src={url} draggable={false} /> : null;
}

export function WorkspacePage() {
  const { t, i18n } = useTranslation();
  const appearance = useUiStore((state) => state.appearance);
  const [workspace, setWorkspace] = useState<WorkspaceState>(DEFAULT_WORKSPACE);
  const [loaded, setLoaded] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const [connectingFrom, setConnectingFrom] = useState<string>();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, { title: string; content: string }>>({});
  const [now, setNow] = useState(() => new Date());
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const fileInput = useRef<HTMLInputElement>(null);
  const nextFileKind = useRef<"image" | "file">("file");
  const gesture = useRef<Gesture | undefined>(undefined);
  const noteDraftsRef = useRef(noteDrafts);
  const noteSaveTimers = useRef(new Map<string, number>());
  const surfaceRef = useRef<HTMLDivElement>(null);
  const notes = useLiveQuery(() => db.notes.toArray(), [], []);
  const files = useLiveQuery(() => db.files.toArray(), [], []);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  useEffect(() => {
    let active = true;
    void db.workspace.get("default").then((record) => {
      if (!active) return;
      if (record && !isWorkspaceState(record.state)) throw new Error("Stored workspace data is invalid.");
      setWorkspace(record?.state ?? DEFAULT_WORKSPACE);
      setStorageReady(true);
      setLoaded(true);
    }).catch(() => {
      if (!active) return;
      setError(t("workspace.saveError"));
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      setCanvasSize({
        width: bounds?.width || window.innerWidth,
        height: bounds?.height || window.innerHeight,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const timeout = window.setTimeout(() => {
      void saveWorkspace(workspace).then(() => setError((current) => current === t("workspace.saveError") ? "" : current))
        .catch(() => setError(t("workspace.saveError")));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [storageReady, t, workspace]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (current.kind === "pan") {
        setWorkspace((state) => ({
          ...state,
          viewport: { ...state.viewport, x: current.originX + event.clientX - current.startX, y: current.originY + event.clientY - current.startY },
        }));
        return;
      }
      const scale = workspace.viewport.zoom;
      const deltaX = (event.clientX - current.startX) / scale;
      const deltaY = (event.clientY - current.startY) / scale;
      setWorkspace((state) => ({
        ...state,
        elements: state.elements.map((element) => element.id !== current.elementId ? element : current.kind === "move"
          ? { ...element, x: current.originX + deltaX, y: current.originY + deltaY }
          : { ...element, width: Math.max(MIN_WIDTH, current.width + deltaX), height: Math.max(MIN_HEIGHT, current.height + deltaY) }),
      }));
    };
    const finish = (event: PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) gesture.current = undefined;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [workspace.viewport.zoom]);

  const addElement = useCallback((kind: "text" | "note") => {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const width = kind === "note" ? 320 : 280;
    const height = kind === "note" ? 260 : 200;
    const id = createId();
    const element: WorkspaceElement = {
      id,
      kind,
      x: ((bounds?.width ?? window.innerWidth) / 2 - workspace.viewport.x) / workspace.viewport.zoom - width / 2,
      y: ((bounds?.height ?? window.innerHeight) / 2 - workspace.viewport.y) / workspace.viewport.zoom - height / 2,
      width,
      height,
      borderColor: appearance.accent,
      title: kind === "text" ? t("workspace.textTitle") : t("workspace.noteTitle"),
      content: "",
      ...(kind === "note" ? { noteId: id } : {}),
    };
    if (kind === "note") {
      const nowAt = Date.now();
      const note: SchoolNote = {
        id,
        title: element.title,
        content: "",
        folder: "Workspace",
        pinned: false,
        createdAt: nowAt,
        updatedAt: nowAt,
      };
      void db.notes.add(note).then(() => {
        setWorkspace((state) => ({ ...state, elements: [...state.elements, element] }));
        setActiveId(id);
        if (storageReady) setError("");
      }).catch(() => setError(t("workspace.noteError")));
    } else {
      setWorkspace((state) => ({ ...state, elements: [...state.elements, element] }));
      setActiveId(id);
    }
    setMenuOpen(false);
  }, [appearance.accent, t, workspace.viewport]);

  function openFilePicker(kind: "image" | "file") {
    nextFileKind.current = kind;
    setMenuOpen(false);
    if (fileInput.current) fileInput.current.accept = kind === "image" ? "image/*" : "*/*";
    fileInput.current?.click();
  }

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (nextFileKind.current === "image" && !file.type.startsWith("image/")) {
      setError(t("workspace.invalidImage"));
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setError(t("workspace.fileTooLarge"));
      return;
    }
    const kind = nextFileKind.current === "image" ? "image" : "file";
    const id = createId();
    const nowAt = Date.now();
    const record: LocalFile = {
      id,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      category: "Workspace",
      createdAt: nowAt,
      modifiedAt: file.lastModified || nowAt,
      blob: file,
    };
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const width = kind === "image" ? 340 : 300;
    const height = kind === "image" ? 280 : 170;
    const element: WorkspaceElement = {
      id: createId(),
      kind,
      x: ((bounds?.width ?? window.innerWidth) / 2 - workspace.viewport.x) / workspace.viewport.zoom - width / 2,
      y: ((bounds?.height ?? window.innerHeight) / 2 - workspace.viewport.y) / workspace.viewport.zoom - height / 2,
      width,
      height,
      borderColor: appearance.accent,
      title: file.name,
      content: "",
      fileId: id,
    };
    try {
      await db.files.add(record);
      setWorkspace((state) => ({ ...state, elements: [...state.elements, element] }));
      setActiveId(element.id);
      if (storageReady) setError("");
    } catch {
      setError(t("workspace.fileAddError"));
    }
  }

  function beginPan(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest(".workspace-card, .workspace-topbar, .workspace-connection")) return;
    gesture.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: workspace.viewport.x,
      originY: workspace.viewport.y,
    };
  }

  function beginElementGesture(event: ReactPointerEvent<HTMLElement>, element: WorkspaceElement, kind: "move" | "resize") {
    if (event.button !== 0) return;
    event.stopPropagation();
    setActiveId(element.id);
    gesture.current = {
      kind,
      pointerId: event.pointerId,
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      width: element.width,
      height: element.height,
    };
  }

  function zoomCanvas(event: ReactWheelEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".workspace-card, .workspace-topbar")) return;
    event.preventDefault();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const zoom = Math.min(2.5, Math.max(0.45, workspace.viewport.zoom * Math.exp(-event.deltaY * 0.001)));
    const worldX = (cursorX - workspace.viewport.x) / workspace.viewport.zoom;
    const worldY = (cursorY - workspace.viewport.y) / workspace.viewport.zoom;
    setWorkspace((state) => ({
      ...state,
      viewport: { x: cursorX - worldX * zoom, y: cursorY - worldY * zoom, zoom },
    }));
  }

  function editElement(id: string, changes: Partial<WorkspaceElement>) {
    setWorkspace((state) => ({
      ...state,
      elements: state.elements.map((element) => element.id === id ? { ...element, ...changes } : element),
    }));
  }

  function updateNoteDraft(note: SchoolNote, changes: Partial<Pick<SchoolNote, "title" | "content">>) {
    const current = noteDraftsRef.current[note.id] ?? { title: note.title, content: note.content };
    const draft = { ...current, ...changes };
    const next = { ...noteDraftsRef.current, [note.id]: draft };
    noteDraftsRef.current = next;
    setNoteDrafts(next);
    const existing = noteSaveTimers.current.get(note.id);
    if (existing !== undefined) window.clearTimeout(existing);
    noteSaveTimers.current.set(note.id, window.setTimeout(() => {
      noteSaveTimers.current.delete(note.id);
      void db.notes.update(note.id, { ...draft, updatedAt: Date.now() }).catch(() => setError(t("workspace.noteError")));
    }, 240));
  }

  function connect(elementId: string) {
    if (!connectingFrom) {
      setConnectingFrom(elementId);
      return;
    }
    if (connectingFrom === elementId) {
      setConnectingFrom(undefined);
      return;
    }
    setWorkspace((state) => ({
      ...state,
      connections: connectWorkspaceElements(state.connections, connectingFrom, elementId),
    }));
    setConnectingFrom(undefined);
  }

  function downloadLocalFile(file: LocalFile) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const formattedTime = new Intl.DateTimeFormat(i18n.language, {
    hour: appearance.hourFormat === "24" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: appearance.hourFormat === "12",
  }).format(now);
  const elementById = new Map(workspace.elements.map((element) => [element.id, element]));

  return (
    <section
      ref={surfaceRef}
      className="workspace-page"
      aria-label={t("nav.workspace")}
      onPointerDown={beginPan}
      onWheel={zoomCanvas}
      style={{
        backgroundSize: `${24 * workspace.viewport.zoom}px ${24 * workspace.viewport.zoom}px`,
        backgroundPosition: `${workspace.viewport.x}px ${workspace.viewport.y}px`,
      }}
    >
      <div className="workspace-topbar">
        <div className="workspace-add-wrap">
          <button
            className="workspace-add"
            type="button"
            aria-label={t("workspace.add")}
            aria-expanded={menuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={17} /> : <Plus size={19} />}
          </button>
          {menuOpen && (
            <div className="workspace-add-menu" role="menu" aria-label={t("workspace.add")}>
              <button role="menuitem" type="button" onClick={() => addElement("text")}><span aria-hidden="true">T</span>{t("workspace.addText")}</button>
              <button role="menuitem" type="button" onClick={() => addElement("note")}><FileText size={14} />{t("workspace.addNote")}</button>
              <button role="menuitem" type="button" onClick={() => openFilePicker("image")}><Image size={14} />{t("workspace.addImage")}</button>
              <button role="menuitem" type="button" onClick={() => openFilePicker("file")}><FileText size={14} />{t("workspace.addFile")}</button>
            </div>
          )}
          <input ref={fileInput} className="workspace-file-input" type="file" accept="*/*" aria-label={t("workspace.addFile")} onChange={(event) => void addFile(event)} />
        </div>
        <time className="home-clock workspace-clock" aria-label={formattedTime}>
          <Clock3 size={17} aria-hidden="true" />
          <span>{formattedTime}</span>
        </time>
      </div>

      <svg className="workspace-connections" width="100%" height="100%" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} aria-label={t("workspace.connection")}>
        {workspace.connections.map((connection) => {
          const from = elementById.get(connection.fromId);
          const to = elementById.get(connection.toId);
          if (!from || !to) return null;
          const startX = workspace.viewport.x + (from.x + from.width / 2) * workspace.viewport.zoom;
          const startY = workspace.viewport.y + (from.y + from.height / 2) * workspace.viewport.zoom;
          const endX = workspace.viewport.x + (to.x + to.width / 2) * workspace.viewport.zoom;
          const endY = workspace.viewport.y + (to.y + to.height / 2) * workspace.viewport.zoom;
          const bend = Math.max(50, Math.abs(endX - startX) * 0.42);
          const curve = `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
          return (
            <g key={connection.id} className="workspace-connection">
              <path className="workspace-connection__hit" d={curve} role="button" tabIndex={0} aria-label={t("workspace.removeConnection")} onClick={() => setWorkspace((state) => removeWorkspaceConnection(state, connection.id))} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setWorkspace((state) => removeWorkspaceConnection(state, connection.id));
              }} />
              <path className="workspace-connection__line" d={curve} />
            </g>
          );
        })}
      </svg>

      <div
        className="workspace-world"
        style={{ transform: `translate(${workspace.viewport.x}px, ${workspace.viewport.y}px) scale(${workspace.viewport.zoom})` }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) beginPan(event);
        }}
      >
        {workspace.elements.map((element) => {
          const note = element.noteId ? noteById.get(element.noteId) : undefined;
          const file = element.fileId ? fileById.get(element.fileId) : undefined;
          const title = note?.title ?? file?.name ?? element.title;
          return (
            <article
              key={element.id}
              className={`workspace-card${activeId === element.id ? " is-active" : ""}${connectingFrom === element.id ? " is-connecting" : ""}`}
              data-workspace-element={element.id}
              style={{ left: element.x, top: element.y, width: element.width, height: element.height, "--workspace-border": element.borderColor } as React.CSSProperties}
              onPointerDown={() => setActiveId(element.id)}
            >
              <header className="workspace-card__header" onPointerDown={(event) => beginElementGesture(event, element, "move")}>
                <input
                  className="workspace-card__title"
                  aria-label={t("workspace.elementTitle")}
                  value={noteDrafts[element.id]?.title ?? note?.title ?? element.title}
                  disabled={element.kind === "image" || element.kind === "file"}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    if (note) updateNoteDraft(note, { title: event.target.value });
                    else editElement(element.id, { title: event.target.value });
                  }}
                />
                <div className="workspace-card__actions" onPointerDown={(event) => event.stopPropagation()}>
                  <label className="workspace-card__color" title={t("workspace.changeBorder")}>
                    <input type="color" aria-label={t("workspace.changeBorder")} value={element.borderColor} onChange={(event) => editElement(element.id, { borderColor: event.target.value })} />
                  </label>
                  <button
                    className="workspace-card__action"
                    type="button"
                    aria-label={connectingFrom === element.id ? t("workspace.cancelConnection") : connectingFrom ? t("workspace.connectTo", { title }) : t("workspace.connect")}
                    title={t("workspace.connect")}
                    onClick={() => connect(element.id)}
                  ><Link2 size={13} /></button>
                  <button className="workspace-card__action" type="button" aria-label={t("workspace.removeElement")} onClick={() => {
                    setWorkspace((state) => removeWorkspaceElement(state, element.id));
                    if (connectingFrom === element.id) setConnectingFrom(undefined);
                  }}><Trash2 size={13} /></button>
                </div>
              </header>
              <div className="workspace-card__body">
                {element.kind === "text" && (
                  <textarea aria-label={t("workspace.textTitle")} placeholder={t("workspace.textPlaceholder")} value={element.content} onChange={(event) => editElement(element.id, { content: event.target.value })} />
                )}
                {element.kind === "note" && (
                  <textarea aria-label={t("workspace.noteBody")} placeholder={t("workspace.notePlaceholder")} value={noteDrafts[element.id]?.content ?? note?.content ?? ""} onChange={(event) => {
                    if (note) updateNoteDraft(note, { content: event.target.value });
                  }} />
                )}
                {element.kind === "image" && (file ? <WorkspaceImage file={file} name={file.name} /> : <div className="workspace-card__missing"><Image size={20} /><span>{element.title}</span></div>)}
                {element.kind === "file" && (
                  <div className="workspace-card__file">
                    <FileText size={22} />
                    <span>{file?.type || "Local file"}</span>
                    {file && <button type="button" onClick={() => downloadLocalFile(file)} aria-label={t("workspace.downloadFile", { name: file.name })}><Download size={14} />{file.name}</button>}
                  </div>
                )}
              </div>
              <button
                className="workspace-card__resize"
                type="button"
                aria-label={t("workspace.resize")}
                onPointerDown={(event) => beginElementGesture(event, element, "resize")}
              />
            </article>
          );
        })}
      </div>

      {!workspace.elements.length && loaded && <p className="workspace-empty" onPointerDown={(event) => event.stopPropagation()}>{t("workspace.empty")}</p>}
      {connectingFrom && <button className="workspace-connect-cancel" type="button" onClick={() => setConnectingFrom(undefined)}>{t("workspace.cancelConnection")}</button>}
      {!loaded && <span className="workspace-loading" role="status">{t("app.loading")}</span>}
      {error && <p className="workspace-error" role="alert">{error}</p>}
    </section>
  );
}
