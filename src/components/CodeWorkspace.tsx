import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Maximize2, Minus, Plus, RotateCcw, Square, X } from "lucide-react";
import {
  applyCodeLayoutPreset,
  clampCodeWindow,
  createDefaultCodeLayout,
  loadCodeLayout,
  saveCodeLayout,
  type CodeLayout,
  type CodeLayoutPreset,
  type CodeWindowDefinition,
  type CodeWindowState,
} from "../data/code-layout";

interface CodeWorkspaceProps {
  mode: string;
  workspaceStyle?: boolean;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  windows: Array<CodeWindowDefinition & { content: ReactNode }>;
  labels: {
    add: string;
    windows: string;
    layout: string;
    reset: string;
    balanced: string;
    focus: string;
    reference: string;
    minimize: string;
    maximize: string;
    restore: string;
    close: string;
    openWindow: string;
    layoutError: string;
    empty: string;
    emptyHint: string;
  };
}

interface Gesture {
  id: string;
  kind: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  rect: CodeWindowRect;
}

type CodeWindowRect = Pick<CodeWindowState, "x" | "y" | "width" | "height">;

export function CodeWorkspace({ mode, workspaceStyle = false, toolbarStart, toolbarEnd, windows, labels }: CodeWorkspaceProps) {
  const definitionSignature = JSON.stringify(windows.map(({ id, title, initial, minWidth, minHeight, openByDefault }) => ({ id, title, initial, minWidth, minHeight, openByDefault })));
  const definitions = useMemo(
    () => JSON.parse(definitionSignature) as CodeWindowDefinition[],
    [definitionSignature],
  );
  const [layout, setLayout] = useState<CodeLayout>(() => {
    try {
      return loadCodeLayout(mode, definitions).layout;
    } catch {
      return createDefaultCodeLayout(definitions);
    }
  });
  const [layoutError, setLayoutError] = useState(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zIndex = useRef(Math.max(0, ...layout.windows.map((item) => item.zIndex)));
  const windowById = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const windowContentById = new Map(windows.map(({ id, content }) => [id, content]));

  useEffect(() => {
    try {
      const loaded = loadCodeLayout(mode, definitions);
      setLayout(loaded.layout);
      setLayoutError(loaded.corrupted);
      zIndex.current = Math.max(0, ...loaded.layout.windows.map((item) => item.zIndex));
    } catch {
      setLayout(createDefaultCodeLayout(definitions));
      setLayoutError(true);
    }
  }, [definitions, mode]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof ResizeObserver === "undefined") {
      const measure = () => {
        const rect = node.getBoundingClientRect();
        setBounds({ width: rect.width, height: rect.height });
      };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBounds({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId || bounds.width <= 0 || bounds.height <= 0) return;
      const dx = (event.clientX - gesture.startX) / bounds.width;
      const dy = (event.clientY - gesture.startY) / bounds.height;
      setLayout((current) => ({
        ...current,
        windows: current.windows.map((item) => {
          if (item.id !== gesture.id) return item;
          const definition = windowById.get(item.id);
          const minimumWidth = (definition?.minWidth ?? 250) / bounds.width;
          const minimumHeight = (definition?.minHeight ?? 170) / bounds.height;
          const next = gesture.kind === "move"
            ? { ...item, x: gesture.rect.x + dx, y: gesture.rect.y + dy }
            : {
                ...item,
                width: Math.max(minimumWidth, gesture.rect.width + dx),
                height: Math.max(minimumHeight, gesture.rect.height + dy),
              };
          return clampCodeWindow(next, bounds, {
            width: definition?.minWidth ?? 250,
            height: definition?.minHeight ?? 170,
          });
        }),
      }));
    };
    const onUp = (event: PointerEvent) => {
      if (gesture && event.pointerId === gesture.pointerId) setGesture(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [bounds, gesture, windowById]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        saveCodeLayout(mode, layout);
        setLayoutError(false);
      } catch {
        setLayoutError(true);
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [layout, mode]);

  function updateWindow(id: string, update: (item: CodeWindowState) => CodeWindowState) {
    setLayout((current) => ({
      ...current,
      windows: current.windows.map((item) => item.id === id ? update(item) : item),
    }));
  }

  function focusWindow(id: string) {
    zIndex.current += 1;
    updateWindow(id, (item) => ({ ...item, zIndex: zIndex.current, open: true, minimized: false }));
  }

  function beginGesture(event: React.PointerEvent, item: CodeWindowState, kind: Gesture["kind"]) {
    if (event.button !== 0 || item.maximized || bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    focusWindow(item.id);
    setGesture({
      id: item.id,
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: { x: item.x, y: item.y, width: item.width, height: item.height },
    });
  }

  function onHeaderKeyDown(event: KeyboardEvent, item: CodeWindowState) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    updateWindow(item.id, (current) => clampCodeWindow({
      ...current,
      x: current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
      y: current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
    }, bounds));
  }

  function toggleMaximize(item: CodeWindowState) {
    updateWindow(item.id, (current) => current.maximized
      ? { ...current, ...(current.restoreRect ?? item), maximized: false, restoreRect: undefined }
      : {
          ...current,
          restoreRect: { x: current.x, y: current.y, width: current.width, height: current.height },
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          maximized: true,
        });
  }

  function setPreset(preset: CodeLayoutPreset) {
    const next = applyCodeLayoutPreset(preset, definitions);
    setLayout(next);
    zIndex.current = Math.max(0, ...next.windows.map((item) => item.zIndex));
  }

  const openWindows = layout.windows.filter((item) => item.open && !item.minimized);
  const minimized = layout.windows.filter((item) => item.open && item.minimized);
  const activeWindow = openWindows.reduce<CodeWindowState | null>(
    (active, item) => !active || item.zIndex > active.zIndex ? item : active,
    null,
  );
  return (
    <div className={`code-workspace${workspaceStyle ? " code-workspace--workspace" : ""}`}>
      <div className="code-workspace__toolbar">
        {toolbarStart}
        <details aria-label={labels.windows} className="workspace-add-wrap code-workspace__add-wrap">
          <summary aria-label={labels.add} className="workspace-add" role="button"><Plus size={19} />{labels.add}</summary>
          <div aria-label={labels.add} className="workspace-add-menu" role="menu">
            <strong>{labels.openWindow}</strong>
            {layout.windows.map((item) => (
              <button
                aria-pressed={item.open && !item.minimized}
                key={item.id}
                onClick={() => focusWindow(item.id)}
                role="menuitem"
                type="button"
              >
                {item.open && !item.minimized ? <Check size={13} /> : <Plus size={13} />}
                {windowById.get(item.id)?.title ?? item.id}
              </button>
            ))}
            <hr />
            <strong>{labels.layout}</strong>
            <button onClick={() => setPreset("balanced")} role="menuitem" type="button">{labels.balanced}</button>
            <button onClick={() => setPreset("focus")} role="menuitem" type="button">{labels.focus}</button>
            <button onClick={() => setPreset("reference")} role="menuitem" type="button">{labels.reference}</button>
            <button onClick={() => setLayout(createDefaultCodeLayout(definitions))} role="menuitem" type="button"><RotateCcw size={12} />{labels.reset}</button>
          </div>
        </details>
        {layoutError && <span className="code-workspace__error" role="alert">{labels.layoutError}</span>}
        <div className="code-workspace__dock">
          {minimized.map((item) => (
            <button key={item.id} onClick={() => focusWindow(item.id)} type="button">{windowById.get(item.id)?.title ?? item.id}</button>
          ))}
        </div>
        {toolbarEnd}
      </div>
      <div className="code-workspace__canvas" ref={containerRef}>
        {layout.windows.every((item) => !item.open) && (
          <div className="code-workspace__empty">
            <p>{labels.empty}</p>
            <span>{labels.emptyHint}</span>
          </div>
        )}
        {openWindows.map((item) => {
          const definition = windowById.get(item.id);
          const content = windowContentById.get(item.id);
          if (!definition || content === undefined) return null;
          return (
            <section
              aria-label={definition.title}
              className={`code-window${item.maximized ? " is-maximized" : ""}${item.id === activeWindow?.id ? " is-active" : ""}`}
              key={item.id}
              onPointerDown={() => focusWindow(item.id)}
              style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`, zIndex: item.zIndex }}
            >
              <header
                className="code-window__titlebar"
                onKeyDown={(event) => onHeaderKeyDown(event, item)}
                onPointerDown={(event) => beginGesture(event, item, "move")}
                role="toolbar"
                tabIndex={0}
                aria-label={`${definition.title}. Use arrow keys to move; hold Shift for larger steps.`}
              >
                <strong>{definition.title}</strong>
                <span className="code-window__controls">
                  <button aria-label={`${labels.minimize} ${definition.title}`} onClick={() => updateWindow(item.id, (current) => ({ ...current, minimized: true }))} type="button"><Minus size={12} /></button>
                  <button aria-label={`${item.maximized ? labels.restore : labels.maximize} ${definition.title}`} onClick={() => toggleMaximize(item)} type="button">{item.maximized ? <Square size={11} /> : <Maximize2 size={11} />}</button>
                  <button aria-label={`${labels.close} ${definition.title}`} onClick={() => updateWindow(item.id, (current) => ({ ...current, open: false, minimized: false }))} type="button"><X size={12} /></button>
                </span>
              </header>
              <div className="code-window__content">{content}</div>
              {!item.maximized && (
                <button
                  aria-label={`Resize ${definition.title}`}
                  className="code-window__resize"
                  onKeyDown={(event) => {
                    if (!event.key.startsWith("Arrow")) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 0.05 : 0.01;
                    updateWindow(item.id, (current) => clampCodeWindow({
                      ...current,
                      width: current.width + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                      height: current.height + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                    }, bounds, { width: definition.minWidth ?? 250, height: definition.minHeight ?? 170 }));
                  }}
                  onPointerDown={(event) => beginGesture(event, item, "resize")}
                  type="button"
                ><Plus size={10} /></button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
