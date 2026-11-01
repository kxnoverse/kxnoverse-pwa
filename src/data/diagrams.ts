import { createId, db } from "./db";
import type { DiagramNode, DiagramProject, DiagramShape } from "./db";

export const DIAGRAM_WIDTH = 1200;
export const DIAGRAM_HEIGHT = 800;
export const DIAGRAM_COLORS = ["#a9d8e8", "#b8d7b8", "#e7c78c", "#d9b8e4", "#e6a9a9", "#c5ced8"] as const;
export const DIAGRAM_SHAPES: DiagramShape[] = ["rounded", "rectangle", "circle", "diamond"];
const MAX_NODES = 200;
const MAX_CONNECTORS = 400;

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function isDiagramProject(value: unknown): value is DiagramProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Partial<DiagramProject>;
  if (
    typeof project.id !== "string" || !project.id ||
    typeof project.name !== "string" || !project.name.trim() || project.name.length > 120 ||
    !Array.isArray(project.nodes) || project.nodes.length > MAX_NODES ||
    !Array.isArray(project.connectors) || project.connectors.length > MAX_CONNECTORS ||
    typeof project.createdAt !== "number" || !Number.isFinite(project.createdAt) ||
    typeof project.updatedAt !== "number" || !Number.isFinite(project.updatedAt)
  ) return false;

  const nodeIds = new Set<string>();
  for (const item of project.nodes) {
    if (
      !item || typeof item.id !== "string" || !item.id || nodeIds.has(item.id) ||
      typeof item.label !== "string" || item.label.length > 240 ||
      ![item.x, item.y, item.width, item.height].every((number) => typeof number === "number" && Number.isFinite(number)) ||
      item.x < 0 || item.y < 0 || item.width < 80 || item.height < 50 ||
      item.x + item.width > DIAGRAM_WIDTH || item.y + item.height > DIAGRAM_HEIGHT ||
      !DIAGRAM_SHAPES.includes(item.shape) || !isColor(item.color)
    ) return false;
    nodeIds.add(item.id);
  }

  const connectorIds = new Set<string>();
  for (const connector of project.connectors) {
    if (
      !connector || typeof connector.id !== "string" || !connector.id || connectorIds.has(connector.id) ||
      connector.from === connector.to || !nodeIds.has(connector.from) || !nodeIds.has(connector.to) ||
      typeof connector.label !== "string" || connector.label.length > 160 || !isColor(connector.color)
    ) return false;
    connectorIds.add(connector.id);
  }
  return true;
}

export function createDiagramProject(name = "Untitled diagram"): DiagramProject {
  const now = Date.now();
  const first: DiagramNode = {
    id: createId(),
    label: "Start",
    x: 180,
    y: 330,
    width: 180,
    height: 88,
    shape: "rounded",
    color: DIAGRAM_COLORS[0],
  };
  const second: DiagramNode = {
    id: createId(),
    label: "Next step",
    x: 520,
    y: 330,
    width: 190,
    height: 88,
    shape: "rounded",
    color: DIAGRAM_COLORS[1],
  };
  return {
    id: createId(),
    name: name.trim().slice(0, 120) || "Untitled diagram",
    nodes: [first, second],
    connectors: [{ id: createId(), from: first.id, to: second.id, label: "", color: "#8c9ca8" }],
    createdAt: now,
    updatedAt: now,
  };
}

export function addDiagramNode(
  project: DiagramProject,
  position: { x: number; y: number },
): DiagramProject {
  if (project.nodes.length >= MAX_NODES) throw new Error("A diagram cannot contain more than 200 nodes.");
  const width = 180;
  const height = 84;
  const preferredX = Math.max(0, Math.min(DIAGRAM_WIDTH - width, Math.round(position.x - width / 2)));
  const preferredY = Math.max(0, Math.min(DIAGRAM_HEIGHT - height, Math.round(position.y - height / 2)));
  const gap = 24;
  const tried = new Set<string>();
  let nodePosition = { x: preferredX, y: preferredY };
  for (let radius = 0; radius <= 12; radius += 1) {
    let found = false;
    for (let row = -radius; row <= radius && !found; row += 1) {
      for (let column = -radius; column <= radius; column += 1) {
        if (radius > 0 && Math.max(Math.abs(column), Math.abs(row)) !== radius) continue;
        const x = Math.max(0, Math.min(DIAGRAM_WIDTH - width, preferredX + column * (width + gap)));
        const y = Math.max(0, Math.min(DIAGRAM_HEIGHT - height, preferredY + row * (height + gap)));
        const key = `${x},${y}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const overlaps = project.nodes.some((existing) =>
          x < existing.x + existing.width + gap &&
          x + width + gap > existing.x &&
          y < existing.y + existing.height + gap &&
          y + height + gap > existing.y,
        );
        if (!overlaps) {
          nodePosition = { x, y };
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  const node: DiagramNode = {
    id: createId(),
    label: "New node",
    ...nodePosition,
    width,
    height,
    shape: "rounded",
    color: DIAGRAM_COLORS[project.nodes.length % DIAGRAM_COLORS.length],
  };
  return { ...project, nodes: [...project.nodes, node] };
}

export function connectDiagramNodes(
  project: DiagramProject,
  from: string,
  to: string,
): DiagramProject {
  if (from === to || !project.nodes.some((node) => node.id === from) || !project.nodes.some((node) => node.id === to)) return project;
  if (project.connectors.some((item) => item.from === from && item.to === to)) return project;
  if (project.connectors.length >= MAX_CONNECTORS) throw new Error("A diagram cannot contain more than 400 connectors.");
  return {
    ...project,
    connectors: [...project.connectors, { id: createId(), from, to, label: "", color: "#8c9ca8" }],
  };
}

export function updateDiagramNode(
  project: DiagramProject,
  id: string,
  updates: Partial<Omit<DiagramNode, "id">>,
): DiagramProject {
  return {
    ...project,
    nodes: project.nodes.map((node) => node.id === id ? { ...node, ...updates } : node),
  };
}

export function deleteDiagramSelection(
  project: DiagramProject,
  selectedNodeIds: Set<string>,
  selectedConnectorIds: Set<string>,
): DiagramProject {
  return {
    ...project,
    nodes: project.nodes.filter((node) => !selectedNodeIds.has(node.id)),
    connectors: project.connectors.filter((connector) =>
      !selectedConnectorIds.has(connector.id) &&
      !selectedNodeIds.has(connector.from) &&
      !selectedNodeIds.has(connector.to),
    ),
  };
}

export async function loadDiagramProjects(): Promise<DiagramProject[]> {
  const projects = await db.diagramProjects.orderBy("updatedAt").reverse().toArray();
  return projects.filter(isDiagramProject);
}

export async function saveDiagramProject(project: DiagramProject): Promise<DiagramProject> {
  const saved = { ...project, name: project.name.trim().slice(0, 120) || "Untitled diagram", updatedAt: Date.now() };
  if (!isDiagramProject(saved)) throw new Error("Cannot save invalid diagram data.");
  await db.diagramProjects.put(saved);
  return saved;
}

export async function deleteDiagramProject(id: string): Promise<void> {
  await db.diagramProjects.delete(id);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function wrappedLines(label: string, maxLength: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function diagramConnectorGeometry(from: DiagramNode, to: DiagramNode) {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const intersectionScale = (node: DiagramNode, x: number, y: number) => {
    if (node.shape === "circle") {
      const rx = node.width / 2;
      const ry = node.height / 2;
      return 1 / Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 || 1);
    }
    if (node.shape === "diamond") {
      return 1 / (Math.abs(x) / (node.width / 2) + Math.abs(y) / (node.height / 2) || 1);
    }
    const horizontal = x === 0 ? Number.POSITIVE_INFINITY : (node.width / 2) / Math.abs(x);
    const vertical = y === 0 ? Number.POSITIVE_INFINITY : (node.height / 2) / Math.abs(y);
    return Math.min(horizontal, vertical);
  };
  const fromScale = intersectionScale(from, dx, dy);
  const toScale = intersectionScale(to, dx, dy);
  const start = { x: fromCenter.x + dx * fromScale, y: fromCenter.y + dy * fromScale };
  const end = { x: toCenter.x - dx * toScale, y: toCenter.y - dy * toScale };
  const midX = (start.x + end.x) / 2;
  return {
    path: `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`,
    labelX: midX,
    labelY: (start.y + end.y) / 2 - 9,
  };
}

export function diagramToSvg(project: DiagramProject): string {
  const markerId = `diagram-arrow-${project.id.replace(/[^a-zA-Z0-9_-]/g, "") || "project"}`;
  const nodes = project.nodes.map((item) => {
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    const shape = item.shape === "circle"
      ? `<ellipse cx="${centerX}" cy="${centerY}" rx="${item.width / 2}" ry="${item.height / 2}"/>`
      : item.shape === "diamond"
        ? `<polygon points="${centerX},${item.y} ${item.x + item.width},${centerY} ${centerX},${item.y + item.height} ${item.x},${centerY}"/>`
        : `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="${item.shape === "rounded" ? 16 : 3}"/>`;
    const lines = wrappedLines(item.label, Math.max(8, Math.floor(item.width / 10)));
    const text = lines.map((line, index) =>
      `<tspan x="${centerX}" dy="${index === 0 ? 0 : 20}">${escapeXml(line)}</tspan>`,
    ).join("");
    const y = centerY - (lines.length - 1) * 10;
    return `<g fill="${item.color}" stroke="#31414a" stroke-width="2">${shape}<text x="${centerX}" y="${y}" fill="#15222a" stroke="none" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="16" font-weight="600">${text}</text></g>`;
  }).join("");
  const nodeMap = new Map(project.nodes.map((item) => [item.id, item]));
  const connectors = project.connectors.map((connector) => {
    const from = nodeMap.get(connector.from);
    const to = nodeMap.get(connector.to);
    if (!from || !to) return "";
    const geometry = diagramConnectorGeometry(from, to);
    const connectorMarker = `${markerId}-${connector.id.replace(/[^a-zA-Z0-9_-]/g, "") || "edge"}`;
    return `<g fill="none" stroke="${connector.color}" stroke-width="3"><path d="${geometry.path}" marker-end="url(#${connectorMarker})"/><text x="${geometry.labelX}" y="${geometry.labelY}" fill="#dbe4e9" stroke="none" text-anchor="middle" font-family="Arial,sans-serif" font-size="13">${escapeXml(connector.label)}</text></g>`;
  }).join("");
  const markers = project.connectors.map((connector) => {
    const connectorMarker = `${markerId}-${connector.id.replace(/[^a-zA-Z0-9_-]/g, "") || "edge"}`;
    return `<marker id="${connectorMarker}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${connector.color}"/></marker>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DIAGRAM_WIDTH}" height="${DIAGRAM_HEIGHT}" viewBox="0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}"><defs>${markers}</defs><rect width="100%" height="100%" fill="#111820"/>${connectors}${nodes}</svg>`;
}

export async function diagramToPng(project: DiagramProject, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([diagramToSvg(project)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG diagram could not be rendered."));
      image.src = url;
    });
    const canvas = window.document.createElement("canvas");
    canvas.width = DIAGRAM_WIDTH * scale;
    canvas.height = DIAGRAM_HEIGHT * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create a PNG canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!result || result.size === 0) throw new Error("The PNG export is empty.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
