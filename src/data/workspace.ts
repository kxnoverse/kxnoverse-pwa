import { createId, db, type WorkspaceConnection, type WorkspaceState } from "./db";

export const DEFAULT_WORKSPACE: WorkspaceState = {
  elements: [],
  connections: [],
  viewport: { x: 28, y: 28, zoom: 1 },
};

export const WORKSPACE_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32] as const;

export type WorkspaceTemplateId = "blank" | "mind-map" | "study-notes" | "project-planning";

export interface WorkspaceTemplateCopy {
  mainIdea: string;
  branchOne: string;
  branchTwo: string;
  branchThree: string;
  branchFour: string;
  topic: string;
  keyConcepts: string;
  questions: string;
  summary: string;
  toDo: string;
  inProgress: string;
  review: string;
  done: string;
  addDetails: string;
}

export const WORKSPACE_TEMPLATE_IDS: WorkspaceTemplateId[] = [
  "blank",
  "mind-map",
  "study-notes",
  "project-planning",
];

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkspaceState>;
  if (!Array.isArray(state.elements) || !Array.isArray(state.connections) || !state.viewport ||
    !Number.isFinite(state.viewport.x) || !Number.isFinite(state.viewport.y) ||
    !Number.isFinite(state.viewport.zoom) || state.viewport.zoom < 0.45 || state.viewport.zoom > 2.5) return false;
  const ids = new Set<string>();
  for (const element of state.elements) {
    if (!element || typeof element !== "object" || typeof element.id !== "string" || !element.id || ids.has(element.id) ||
      !["text", "note", "image", "file", "document"].includes(element.kind) ||
      !Number.isFinite(element.x) || !Number.isFinite(element.y) ||
      !Number.isFinite(element.width) || element.width < 220 ||
      !Number.isFinite(element.height) || element.height < 140 ||
      !/^#[0-9a-f]{6}$/i.test(element.borderColor) ||
      (element.fontSize !== undefined && !WORKSPACE_FONT_SIZES.some((size) => size === element.fontSize)) ||
      typeof element.title !== "string" || typeof element.content !== "string" ||
      ((element.kind === "image" || element.kind === "file") && typeof element.fileId !== "string") ||
      (element.kind === "note" && typeof element.noteId !== "string") ||
      (element.kind === "document" && typeof element.documentId !== "string")) return false;
    ids.add(element.id);
  }
  const connectionIds = new Set<string>();
  for (const connection of state.connections) {
    if (!connection || typeof connection.id !== "string" || !connection.id || connectionIds.has(connection.id) ||
      typeof connection.fromId !== "string" || typeof connection.toId !== "string" ||
      connection.fromId === connection.toId || !ids.has(connection.fromId) || !ids.has(connection.toId)) return false;
    connectionIds.add(connection.id);
  }
  return true;
}

export function addWorkspaceTemplate(
  state: WorkspaceState,
  template: WorkspaceTemplateId,
  accent: string,
  copy: WorkspaceTemplateCopy,
  center: { x: number; y: number },
): WorkspaceState {
  if (template === "blank") return state;

  const nodes: Array<{ key: string; title: string; content: string; x: number; y: number; width: number; height: number }> = [];
  let links: Array<[string, string]> = [];
  if (template === "mind-map") {
    nodes.push(
      { key: "main", title: copy.mainIdea, content: copy.addDetails, x: 340, y: 170, width: 280, height: 190 },
      { key: "one", title: copy.branchOne, content: copy.addDetails, x: 0, y: 0, width: 260, height: 170 },
      { key: "two", title: copy.branchTwo, content: copy.addDetails, x: 700, y: 0, width: 260, height: 170 },
      { key: "three", title: copy.branchThree, content: copy.addDetails, x: 0, y: 360, width: 260, height: 170 },
      { key: "four", title: copy.branchFour, content: copy.addDetails, x: 700, y: 360, width: 260, height: 170 },
    );
    links = [["main", "one"], ["main", "two"], ["main", "three"], ["main", "four"]];
  } else if (template === "study-notes") {
    nodes.push(
      { key: "topic", title: copy.topic, content: copy.addDetails, x: 0, y: 0, width: 270, height: 190 },
      { key: "concepts", title: copy.keyConcepts, content: copy.addDetails, x: 320, y: 0, width: 270, height: 190 },
      { key: "questions", title: copy.questions, content: copy.addDetails, x: 640, y: 0, width: 270, height: 190 },
      { key: "summary", title: copy.summary, content: copy.addDetails, x: 320, y: 240, width: 270, height: 190 },
    );
    links = [["topic", "concepts"], ["topic", "questions"], ["topic", "summary"]];
  } else {
    nodes.push(
      { key: "todo", title: copy.toDo, content: copy.addDetails, x: 0, y: 0, width: 270, height: 210 },
      { key: "progress", title: copy.inProgress, content: copy.addDetails, x: 320, y: 0, width: 270, height: 210 },
      { key: "review", title: copy.review, content: copy.addDetails, x: 640, y: 0, width: 270, height: 210 },
      { key: "done", title: copy.done, content: copy.addDetails, x: 960, y: 0, width: 270, height: 210 },
    );
    links = [["todo", "progress"], ["progress", "review"], ["review", "done"]];
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const width = maxX - minX;
  const height = maxY - minY;
  let originX = center.x - width / 2 - minX;
  const originY = center.y - height / 2 - minY;
  const overlaps = (x: number) => state.elements.some((element) =>
    x < element.x + element.width + 48 &&
    x + width + 48 > element.x &&
    originY - 48 < element.y + element.height + 48 &&
    originY + height + 48 > element.y
  );
  while (overlaps(originX)) originX += width + 64;

  const ids = new Map<string, string>();
  const elements: WorkspaceState["elements"] = nodes.map((node) => {
    const id = createId();
    ids.set(node.key, id);
    return {
      id,
      kind: "text",
      x: originX + node.x,
      y: originY + node.y,
      width: node.width,
      height: node.height,
      borderColor: accent,
      fontSize: 12,
      title: node.title,
      content: node.content,
    };
  });
  const connections = links.flatMap(([from, to]) => {
    const fromId = ids.get(from);
    const toId = ids.get(to);
    return fromId && toId ? connectWorkspaceElements([], fromId, toId) : [];
  });

  return {
    ...state,
    elements: [...state.elements, ...elements],
    connections: [...state.connections, ...connections],
  };
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  if (!isWorkspaceState(state)) throw new Error("Workspace state is invalid.");
  await db.workspace.put({ id: "default", state, updatedAt: Date.now() });
}

export function connectWorkspaceElements(
  connections: WorkspaceConnection[],
  fromId: string,
  toId: string,
): WorkspaceConnection[] {
  if (!fromId || !toId || fromId === toId || connections.some((item) =>
    (item.fromId === fromId && item.toId === toId) || (item.fromId === toId && item.toId === fromId)
  )) return connections;
  return [...connections, { id: crypto.randomUUID(), fromId, toId }];
}

export function removeWorkspaceElement(state: WorkspaceState, elementId: string): WorkspaceState {
  return {
    ...state,
    elements: state.elements.filter((item) => item.id !== elementId),
    connections: state.connections.filter((item) => item.fromId !== elementId && item.toId !== elementId),
  };
}

export function removeWorkspaceConnection(state: WorkspaceState, connectionId: string): WorkspaceState {
  return { ...state, connections: state.connections.filter((item) => item.id !== connectionId) };
}
