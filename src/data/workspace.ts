import { db, type WorkspaceConnection, type WorkspaceState } from "./db";

export const DEFAULT_WORKSPACE: WorkspaceState = {
  elements: [],
  connections: [],
  viewport: { x: 28, y: 28, zoom: 1 },
};

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<WorkspaceState>;
  if (!Array.isArray(state.elements) || !Array.isArray(state.connections) || !state.viewport ||
    !Number.isFinite(state.viewport.x) || !Number.isFinite(state.viewport.y) ||
    !Number.isFinite(state.viewport.zoom) || state.viewport.zoom < 0.45 || state.viewport.zoom > 2.5) return false;
  const ids = new Set<string>();
  for (const element of state.elements) {
    if (!element || typeof element !== "object" || typeof element.id !== "string" || !element.id || ids.has(element.id) ||
      !["text", "note", "image", "file"].includes(element.kind) ||
      !Number.isFinite(element.x) || !Number.isFinite(element.y) ||
      !Number.isFinite(element.width) || element.width < 220 ||
      !Number.isFinite(element.height) || element.height < 140 ||
      !/^#[0-9a-f]{6}$/i.test(element.borderColor) ||
      typeof element.title !== "string" || typeof element.content !== "string" ||
      ((element.kind === "image" || element.kind === "file") && typeof element.fileId !== "string") ||
      (element.kind === "note" && typeof element.noteId !== "string")) return false;
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
