import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, ArrowDownToLine, ArrowRight,
  Circle, Download, Link2, MousePointer2, Plus, Redo2, Save, Square, Undo2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  addDiagramNode, connectDiagramNodes, createDiagramProject, deleteDiagramProject,
  deleteDiagramSelection, diagramConnectorGeometry, diagramToSvg, DIAGRAM_COLORS, DIAGRAM_HEIGHT, DIAGRAM_SHAPES,
  DIAGRAM_WIDTH, diagramToPng, loadDiagramProjects, saveDiagramProject, updateDiagramNode,
} from "../data/diagrams";
import type { DiagramConnector, DiagramNode, DiagramProject, DiagramShape } from "../data/db";

type Selection = { nodes: Set<string>; connectors: Set<string> };
type DiagramEditEvent = CustomEvent<{
  project: DiagramProject;
  onApply: (project: DiagramProject) => void;
}>;
type Props = {
  initialProject?: DiagramProject;
  onClose: () => void;
  onInsert: (project: DiagramProject) => void;
  onApply?: (project: DiagramProject) => void;
};

type DragState = {
  kind: "nodes" | "pan";
  start: { x: number; y: number };
  initial: DiagramProject;
  ids: string[];
  initialPan: { x: number; y: number };
};

function nodeShape(node: DiagramNode) {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  if (node.shape === "circle") {
    return <ellipse cx={centerX} cy={centerY} rx={node.width / 2} ry={node.height / 2} />;
  }
  if (node.shape === "diamond") {
    return <polygon points={`${centerX},${node.y} ${node.x + node.width},${centerY} ${centerX},${node.y + node.height} ${node.x},${centerY}`} />;
  }
  return <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={node.shape === "rounded" ? 16 : 3} />;
}

function wrappedLines(label: string, width: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > Math.max(8, Math.floor(width / 10))) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DiagramEditor({ initialProject, onClose, onInsert, onApply }: Props) {
  const { t } = useTranslation();
  const [project, setProject] = useState<DiagramProject>(() => initialProject ?? createDiagramProject(t("diagram.newDiagram")));
  const [projects, setProjects] = useState<DiagramProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject?.id ?? "");
  const [selection, setSelection] = useState<Selection>({ nodes: new Set(), connectors: new Set() });
  const [tool, setTool] = useState<"select" | "connect">("select");
  const [connectorStart, setConnectorStart] = useState("");
  const [zoom, setZoom] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia("(max-width: 600px)").matches ? 1.7 : 1,
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [past, setPast] = useState<DiagramProject[]>([]);
  const [future, setFuture] = useState<DiagramProject[]>([]);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const projectId = project.id.replace(/[^a-zA-Z0-9_-]/g, "") || "active";
  const selectedNode = useMemo(
    () => project.nodes.find((node) => selection.nodes.has(node.id)),
    [project.nodes, selection.nodes],
  );
  const selectedConnector = useMemo(
    () => project.connectors.find((connector) => selection.connectors.has(connector.id)),
    [project.connectors, selection.connectors],
  );

  function requestClose() {
    if (dirty && !window.confirm(t("diagram.discardCloseConfirm"))) return;
    onClose();
  }

  useEffect(() => {
    let active = true;
    void loadDiagramProjects().then((items) => {
      if (active) setProjects(items);
    }).catch(() => {
      if (active) setError(t("diagram.loadError"));
    }).finally(() => {
      if (active) setLoadingProjects(false);
    });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    const previousFocus = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("input, button, select")?.focus();
    return () => { previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
        )];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if ((event.key === "Delete" || event.key === "Backspace") && (selection.nodes.size || selection.connectors.size)) {
        event.preventDefault();
        commit((current) => deleteDiagramSelection(current, selection.nodes, selection.connectors));
        setSelection({ nodes: new Set(), connectors: new Set() });
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function commit(change: (current: DiagramProject) => DiagramProject) {
    const next = change(project);
    if (next === project) return;
    setPast((items) => [...items.slice(-59), project]);
    setFuture([]);
    setSaveMessage("");
    setDirty(true);
    setError("");
    setProject({ ...next, updatedAt: Date.now() });
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([project, ...future].slice(0, 60));
    setDirty(true);
    setProject(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past.slice(-59), project]);
    setDirty(true);
    setProject(next);
  }

  function worldPoint(event: ReactPointerEvent<SVGElement>, origin = pan) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: origin.x + ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * (DIAGRAM_WIDTH / zoom),
      y: origin.y + ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * (DIAGRAM_HEIGHT / zoom),
    };
  }

  function startNodePointer(event: ReactPointerEvent<SVGGElement>, id: string) {
    event.stopPropagation();
    event.preventDefault();
    if (tool === "connect") {
      if (!connectorStart) {
        setConnectorStart(id);
        setSelection({ nodes: new Set([id]), connectors: new Set() });
      } else {
        commit((current) => connectDiagramNodes(current, connectorStart, id));
        setConnectorStart("");
        setSelection({ nodes: new Set(), connectors: new Set() });
      }
      return;
    }
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const nextNodes = additive
      ? new Set(selection.nodes.has(id)
        ? [...selection.nodes].filter((selectedId) => selectedId !== id)
        : [...selection.nodes, id])
      : selection.nodes.has(id) ? new Set(selection.nodes) : new Set([id]);
    setSelection({ nodes: nextNodes, connectors: new Set() });
    if (!nextNodes.has(id)) return;
    const point = worldPoint(event);
    dragRef.current = {
      kind: "nodes",
      start: point,
      initial: project,
      ids: [...nextNodes],
      initialPan: pan,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  }

  function startCanvasPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-diagram-object]")) return;
    if (tool === "connect") {
      setConnectorStart("");
      return;
    }
    const point = worldPoint(event);
    dragRef.current = { kind: "pan", start: point, initial: project, ids: [], initialPan: pan };
    setSelection({ nodes: new Set(), connectors: new Set() });
    svgRef.current?.setPointerCapture?.(event.pointerId);
  }

  function movePointer(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = worldPoint(event, drag.kind === "pan" ? drag.initialPan : pan);
    if (drag.kind === "pan") {
      setPan({ x: drag.initialPan.x - (point.x - drag.start.x), y: drag.initialPan.y - (point.y - drag.start.y) });
      return;
    }
    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;
    const selectedIds = new Set(drag.ids);
    setProject((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (!selectedIds.has(node.id)) return node;
        const initial = drag.initial.nodes.find((candidate) => candidate.id === node.id);
        if (!initial) return node;
        return {
          ...node,
          x: Math.max(0, Math.min(DIAGRAM_WIDTH - node.width, Math.round(initial.x + deltaX))),
          y: Math.max(0, Math.min(DIAGRAM_HEIGHT - node.height, Math.round(initial.y + deltaY))),
        };
      }),
    }));
  }

  function finishPointer() {
    const drag = dragRef.current;
    if (drag?.kind === "nodes") {
      setPast((items) => [...items.slice(-59), drag.initial]);
      setFuture([]);
      setSaveMessage("");
      setDirty(true);
    }
    dragRef.current = null;
  }

  function changeNode(id: string, updates: Partial<Omit<DiagramNode, "id">>) {
    commit((current) => updateDiagramNode(current, id, updates));
  }

  function changeConnector(id: string, updates: Partial<Omit<DiagramConnector, "id" | "from" | "to">>) {
    commit((current) => ({
      ...current,
      connectors: current.connectors.map((connector) => connector.id === id ? { ...connector, ...updates } : connector),
    }));
  }

  function alignNodes(axis: "left" | "center") {
    const nodes = project.nodes.filter((node) => selection.nodes.has(node.id));
    if (nodes.length < 2) return;
    const target = axis === "left"
      ? Math.min(...nodes.map((node) => node.x))
      : nodes.reduce((sum, node) => sum + node.y + node.height / 2, 0) / nodes.length;
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => !selection.nodes.has(node.id) ? node : {
        ...node,
        ...(axis === "left"
          ? { x: target }
          : { y: Math.round(target - node.height / 2) }),
      }),
    }));
  }

  async function saveProject() {
    try {
      const saved = await saveDiagramProject(project);
      setProject(saved);
      setProjects((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt - a.updatedAt));
      setSelectedProjectId(saved.id);
      setSaveMessage(t("diagram.saved"));
      setDirty(false);
      setError("");
    } catch {
      setError(t("diagram.saveError"));
    }
  }

  function openProject() {
    const saved = projects.find((item) => item.id === selectedProjectId);
    if (!saved) return;
    if (dirty && !window.confirm(t("diagram.discardConfirm"))) return;
    setProject(structuredClone(saved));
    setSelection({ nodes: new Set(), connectors: new Set() });
    setPast([]);
    setFuture([]);
    setDirty(false);
    setError("");
    setSaveMessage(t("diagram.saved"));
  }

  async function removeProject() {
    const saved = projects.find((item) => item.id === selectedProjectId);
    if (!saved || !window.confirm(t("diagram.deleteConfirm", { name: saved.name }))) return;
    try {
      await deleteDiagramProject(saved.id);
      setProjects((current) => current.filter((item) => item.id !== saved.id));
      setSelectedProjectId("");
      setError("");
    } catch {
      setError(t("diagram.deleteError"));
    }
  }

  function insertIntoDocument() {
    onInsert(project);
    onClose();
  }

  async function exportPng() {
    try {
      const blob = await diagramToPng(project);
      downloadFile(blob, `${project.name.trim() || "diagram"}.png`);
      setError("");
    } catch {
      setError(t("diagram.exportError"));
    }
  }

  function exportSvg() {
    downloadFile(new Blob([diagramToSvg(project)], { type: "image/svg+xml;charset=utf-8" }), `${project.name.trim() || "diagram"}.svg`);
  }

  return (
    <div className="diagram-editor-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section ref={dialogRef} className="diagram-editor" role="dialog" aria-modal="true" aria-labelledby="diagram-editor-title">
        <header className="diagram-editor__header">
          <div className="diagram-editor__identity">
            <span className="diagram-editor__mark" aria-hidden="true">D</span>
            <div>
              <span className="diagram-editor__eyebrow">{t("diagram.eyebrow")}</span>
              <input
                id="diagram-editor-title"
                aria-label={t("diagram.projectName")}
                maxLength={120}
                value={project.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setProject((current) => ({ ...current, name, updatedAt: Date.now() }));
                  setSaveMessage("");
                  setDirty(true);
                }}
              />
            </div>
          </div>
          <div className="diagram-editor__header-actions">
            {saveMessage && <span className="diagram-editor__save-state" role="status">{saveMessage}</span>}
            <button type="button" className="diagram-editor__button diagram-editor__button--quiet" onClick={saveProject}><Save size={14} />{t("diagram.save")}</button>
            <button type="button" className="diagram-editor__close" aria-label={t("diagram.close")} onClick={requestClose}><X size={18} /></button>
          </div>
        </header>

        <div className="diagram-editor__workspace">
          <aside className="diagram-editor__toolrail" aria-label={t("diagram.tools")}>
            <button type="button" className={tool === "select" ? "is-active" : ""} aria-pressed={tool === "select"} title={t("diagram.selectTool")} onClick={() => { setTool("select"); setConnectorStart(""); }}><MousePointer2 size={17} /><span>{t("diagram.selectTool")}</span></button>
            <button type="button" className={tool === "connect" ? "is-active" : ""} aria-pressed={tool === "connect"} title={t("diagram.connectTool")} onClick={() => { setTool("connect"); setConnectorStart(""); }}><Link2 size={17} /><span>{t("diagram.connectTool")}</span></button>
            <span className="diagram-editor__rail-divider" />
            <button type="button" title={t("diagram.addNode")} onClick={() => {
              const next = addDiagramNode(project, { x: pan.x + DIAGRAM_WIDTH / zoom / 2, y: pan.y + DIAGRAM_HEIGHT / zoom / 2 });
              commit(() => next);
              setSelection({ nodes: new Set([next.nodes.at(-1)?.id ?? ""]), connectors: new Set() });
            }}><Plus size={17} /><span>{t("diagram.addNode")}</span></button>
            <button type="button" title={t("diagram.addRounded")} onClick={() => {
              const next = addDiagramNode(project, { x: pan.x + DIAGRAM_WIDTH / zoom / 2, y: pan.y + DIAGRAM_HEIGHT / zoom / 2 });
              const last = next.nodes.at(-1);
              if (!last) return;
              commit(() => ({ ...next, nodes: next.nodes.map((node) => node.id === last.id ? { ...node, shape: "rounded" } : node) }));
              setSelection({ nodes: new Set([last.id]), connectors: new Set() });
            }}><Square size={17} /><span>{t("diagram.addRounded")}</span></button>
          </aside>

          <div className="diagram-editor__main">
            <div className="diagram-editor__toolbar">
              <div className="diagram-editor__toolbar-group">
                <button type="button" title={t("diagram.undo")} aria-label={t("diagram.undo")} disabled={!past.length} onClick={undo}><Undo2 size={16} /></button>
                <button type="button" title={t("diagram.redo")} aria-label={t("diagram.redo")} disabled={!future.length} onClick={redo}><Redo2 size={16} /></button>
                <span className="diagram-editor__toolbar-divider" />
                <button type="button" title={t("diagram.alignLeft")} aria-label={t("diagram.alignLeft")} disabled={selection.nodes.size < 2} onClick={() => alignNodes("left")}><AlignHorizontalJustifyStart size={16} /></button>
                <button type="button" title={t("diagram.alignCenters")} aria-label={t("diagram.alignCenters")} disabled={selection.nodes.size < 2} onClick={() => alignNodes("center")}><AlignVerticalJustifyCenter size={16} /></button>
              </div>
              <p>{tool === "connect" ? (connectorStart ? t("diagram.chooseTarget") : t("diagram.chooseSource")) : t("diagram.canvasHint")}</p>
              <div className="diagram-editor__toolbar-group diagram-editor__zoom">
                <button type="button" aria-label={t("diagram.zoomOut")} onClick={() => setZoom((value) => Math.max(.45, Number((value - .1).toFixed(2))))}><ZoomOut size={15} /></button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label={t("diagram.zoomIn")} onClick={() => setZoom((value) => Math.min(3, Number((value + .1).toFixed(2))))}><ZoomIn size={15} /></button>
              </div>
            </div>

            <div className="diagram-editor__stage">
              <svg
                ref={svgRef}
                className={`diagram-editor__canvas${tool === "connect" ? " is-connecting" : ""}`}
                role="group"
                aria-label={t("diagram.canvas")}
                viewBox={`${pan.x} ${pan.y} ${DIAGRAM_WIDTH / zoom} ${DIAGRAM_HEIGHT / zoom}`}
                onPointerDown={startCanvasPointer}
                onPointerMove={movePointer}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              >
                <defs>
                  <pattern id={`diagram-grid-${projectId}`} width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".26" />
                  </pattern>
                  {project.connectors.map((connector) => <marker key={connector.id} id={`diagram-arrow-${projectId}-${connector.id.replace(/[^a-zA-Z0-9_-]/g, "") || "edge"}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={connector.color} /></marker>)}
                </defs>
                <rect x={pan.x} y={pan.y} width={DIAGRAM_WIDTH / zoom} height={DIAGRAM_HEIGHT / zoom} fill={`url(#diagram-grid-${projectId})`} />
                {project.connectors.map((connector) => {
                  const from = project.nodes.find((node) => node.id === connector.from);
                  const to = project.nodes.find((node) => node.id === connector.to);
                  if (!from || !to) return null;
                  const geometry = diagramConnectorGeometry(from, to);
                  const markerId = `diagram-arrow-${projectId}-${connector.id.replace(/[^a-zA-Z0-9_-]/g, "") || "edge"}`;
                  const selected = selection.connectors.has(connector.id);
                  return (
                    <g key={connector.id} data-diagram-object="connector" className={`diagram-editor__connector${selected ? " is-selected" : ""}`} onPointerDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      setSelection({ nodes: new Set(), connectors: new Set([connector.id]) });
                    }}>
                      <path d={geometry.path} fill="none" stroke="transparent" strokeWidth="18" pointerEvents="stroke" />
                      <path d={geometry.path} fill="none" stroke={connector.color} strokeWidth={selected ? 3.5 : 2.2} markerEnd={`url(#${markerId})`} pointerEvents="none" />
                      {connector.label && <text x={geometry.labelX} y={geometry.labelY} textAnchor="middle" className="diagram-editor__connector-label">{connector.label}</text>}
                    </g>
                  );
                })}
                {project.nodes.map((node) => {
                  const lines = wrappedLines(node.label, node.width);
                  const centerX = node.x + node.width / 2;
                  const centerY = node.y + node.height / 2;
                  const selected = selection.nodes.has(node.id);
                  return (
                    <g
                      key={node.id}
                      data-diagram-object="node"
                      className={`diagram-editor__node${selected ? " is-selected" : ""}${connectorStart === node.id ? " is-connector-source" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t("diagram.nodeLabel", { label: node.label })}
                      aria-pressed={selected}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelection({ nodes: event.ctrlKey || event.metaKey ? new Set([...selection.nodes, node.id]) : new Set([node.id]), connectors: new Set() });
                        }
                      }}
                      onPointerDown={(event) => startNodePointer(event, node.id)}
                    >
                      {selected && <rect x={node.x - 5} y={node.y - 5} width={node.width + 10} height={node.height + 10} rx={node.shape === "circle" ? (node.width + 10) / 2 : 18} className="diagram-editor__selection-outline" />}
                      <g fill={node.color}>{nodeShape(node)}</g>
                      <text x={centerX} y={centerY - (lines.length - 1) * 10} textAnchor="middle" dominantBaseline="middle">
                        {lines.map((line, index) => <tspan key={`${node.id}-${index}`} x={centerX} dy={index === 0 ? 0 : 20}>{line}</tspan>)}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {project.nodes.length === 0 && <div className="diagram-editor__empty">{t("diagram.emptyCanvas")}</div>}
            </div>
            <footer className="diagram-editor__canvas-footer">
              <span>{t("diagram.objectCount", { nodes: project.nodes.length, connectors: project.connectors.length })}</span>
              <span>{t("diagram.canvasSize", { width: DIAGRAM_WIDTH, height: DIAGRAM_HEIGHT })}</span>
            </footer>
          </div>

          <aside className="diagram-editor__inspector">
            <div className="diagram-editor__inspector-heading">
              <span>{t("diagram.inspector")}</span>
              <span className="diagram-editor__selection-count">{t("diagram.selectedCount", { count: selection.nodes.size + selection.connectors.size })}</span>
            </div>
            {selectedNode ? (
              <div className="diagram-editor__fields">
                <label>{t("diagram.label")}<input value={selectedNode.label} maxLength={240} onChange={(event) => changeNode(selectedNode.id, { label: event.target.value })} /></label>
                <label>{t("diagram.shape")}<select value={selectedNode.shape} onChange={(event) => changeNode(selectedNode.id, { shape: event.target.value as DiagramShape })}>
                  {DIAGRAM_SHAPES.map((shape) => <option key={shape} value={shape}>{t(`diagram.shapes.${shape}`)}</option>)}
                </select></label>
                <div className="diagram-editor__field-label">{t("diagram.color")}</div>
                <div className="diagram-editor__swatches">
                  {DIAGRAM_COLORS.map((color) => <button key={color} type="button" className={selectedNode.color === color ? "is-active" : ""} aria-label={t("diagram.useColor", { color })} onClick={() => changeNode(selectedNode.id, { color })} style={{ "--diagram-color": color } as React.CSSProperties} />)}
                  <label className="diagram-editor__custom-color" title={t("diagram.customColor")}><Circle size={15} /><input type="color" aria-label={t("diagram.customColor")} value={selectedNode.color} onChange={(event) => changeNode(selectedNode.id, { color: event.target.value })} /></label>
                </div>
                {selection.nodes.size > 1 && <p className="diagram-editor__hint">{t("diagram.multiSelectHint")}</p>}
              </div>
            ) : selectedConnector ? (
              <div className="diagram-editor__fields">
                <label>{t("diagram.connectorLabel")}<input value={selectedConnector.label} maxLength={160} onChange={(event) => changeConnector(selectedConnector.id, { label: event.target.value })} /></label>
                <label>{t("diagram.color")}<input type="color" aria-label={t("diagram.color")} value={selectedConnector.color} onChange={(event) => changeConnector(selectedConnector.id, { color: event.target.value })} /></label>
              </div>
            ) : (
              <div className="diagram-editor__inspector-empty">
                <span aria-hidden="true">↗</span>
                <p>{t("diagram.selectHint")}</p>
                <small>{t("diagram.multiSelectHint")}</small>
              </div>
            )}
            {(selectedNode || selectedConnector || selection.nodes.size > 1) && (
              <button type="button" className="diagram-editor__delete" onClick={() => {
                commit((current) => deleteDiagramSelection(
                  current,
                  selection.nodes.size ? selection.nodes : new Set(),
                  selection.connectors.size ? selection.connectors : new Set(selectedConnector ? [selectedConnector.id] : []),
                ));
                setSelection({ nodes: new Set(), connectors: new Set() });
              }}>{t("diagram.deleteSelection")}</button>
            )}
            <div className="diagram-editor__library">
              <label>{t("diagram.savedProjects")}<select aria-label={t("diagram.savedProjects")} value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                <option value="">{loadingProjects ? t("diagram.loadingProjects") : t("diagram.chooseProject")}</option>
                {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <div>
                <button type="button" disabled={!selectedProjectId} onClick={openProject}><ArrowRight size={14} />{t("diagram.openProject")}</button>
                <button type="button" disabled={!selectedProjectId} onClick={() => void removeProject()}><X size={14} />{t("diagram.deleteProject")}</button>
              </div>
            </div>
            <div className="diagram-editor__exports">
              <span>{t("diagram.export")}</span>
              <button type="button" onClick={exportSvg}><ArrowDownToLine size={14} />SVG</button>
              <button type="button" onClick={() => void exportPng()}><Download size={14} />PNG</button>
            </div>
          </aside>
        </div>
        {error && <p className="diagram-editor__error" role="alert">{error}</p>}
        <footer className="diagram-editor__footer">
          <span>{t("diagram.keyboardHint")}</span>
          <div>
            {onApply
              ? <button type="button" className="diagram-editor__button diagram-editor__button--primary" onClick={() => { onApply(project); onClose(); }}>{t("diagram.applyChanges")}</button>
              : <button type="button" className="diagram-editor__button diagram-editor__button--primary" onClick={insertIntoDocument}>{t("diagram.insertIntoDocs")}</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

export function diagramEditEvent(project: DiagramProject, onApply: (project: DiagramProject) => void) {
  return new CustomEvent("kxno:edit-diagram", { detail: { project, onApply } });
}

export type { DiagramEditEvent };
