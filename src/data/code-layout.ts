export interface CodeWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CodeWindowState extends CodeWindowRect {
  id: string;
  zIndex: number;
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  restoreRect?: CodeWindowRect;
}

export interface CodeWindowDefinition {
  id: string;
  title: string;
  initial: CodeWindowRect;
  minWidth?: number;
  minHeight?: number;
  openByDefault?: boolean;
}

export interface CodeLayout {
  version: 1;
  windows: CodeWindowState[];
}

export type CodeLayoutPreset = "balanced" | "focus" | "reference";

const LAYOUT_PREFIX = "kxnodesk.code-layout.v1.";
const DEFAULT_MIN_WIDTH = 250;
const DEFAULT_MIN_HEIGHT = 170;

function isRect(value: unknown): value is CodeWindowRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Partial<CodeWindowRect>;
  return [rect.x, rect.y, rect.width, rect.height].every((item) => typeof item === "number" && Number.isFinite(item));
}

export function createDefaultCodeLayout(definitions: readonly CodeWindowDefinition[]): CodeLayout {
  return {
    version: 1,
    windows: definitions.map((definition, index) => ({
      id: definition.id,
      ...definition.initial,
      zIndex: index + 1,
      open: definition.openByDefault !== false,
      minimized: false,
      maximized: false,
    })),
  };
}

export function isCodeLayout(value: unknown, definitions: readonly CodeWindowDefinition[]): value is CodeLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<CodeLayout>;
  if (layout.version !== 1 || !Array.isArray(layout.windows)) return false;
  const allowedIds = new Set(definitions.map((definition) => definition.id));
  if (layout.windows.length !== definitions.length) return false;
  const seen = new Set<string>();
  return layout.windows.every((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" ||
      !allowedIds.has(item.id) || seen.has(item.id) || !isRect(item) ||
      !Number.isInteger(item.zIndex) || typeof item.open !== "boolean" ||
      typeof item.minimized !== "boolean" || typeof item.maximized !== "boolean" ||
      (item.restoreRect !== undefined && !isRect(item.restoreRect))) return false;
    seen.add(item.id);
    return item.x >= 0 && item.y >= 0 && item.width > 0 && item.height > 0 &&
      item.x + item.width <= 1.001 && item.y + item.height <= 1.001;
  });
}

export function loadCodeLayout(
  mode: string,
  definitions: readonly CodeWindowDefinition[],
  storage: Pick<Storage, "getItem"> = localStorage,
): { layout: CodeLayout; corrupted: boolean } {
  const raw = storage.getItem(`${LAYOUT_PREFIX}${mode}`);
  if (!raw) return { layout: createDefaultCodeLayout(definitions), corrupted: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isCodeLayout(parsed, definitions)) return { layout: parsed, corrupted: false };
  } catch {
    return { layout: createDefaultCodeLayout(definitions), corrupted: true };
  }
  return { layout: createDefaultCodeLayout(definitions), corrupted: true };
}

export function saveCodeLayout(
  mode: string,
  layout: CodeLayout,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(`${LAYOUT_PREFIX}${mode}`, JSON.stringify(layout));
}

export function applyCodeLayoutPreset(
  preset: CodeLayoutPreset,
  definitions: readonly CodeWindowDefinition[],
): CodeLayout {
  const defaultLayout = createDefaultCodeLayout(definitions);
  if (preset === "balanced") return defaultLayout;
  const windows = defaultLayout.windows.map((item, index) => {
    const definition = definitions.find((entry) => entry.id === item.id)!;
    if (preset === "focus" && index > 0) return { ...item, open: false };
    if (preset === "reference" && definition.id === "reference") {
      return { ...item, x: 0.62, y: 0.05, width: 0.36, height: 0.9, open: true, minimized: false, zIndex: definitions.length + 1 };
    }
    if (preset === "reference" && index > 1) return { ...item, open: false };
    return item;
  });
  return { version: 1, windows };
}

export function clampCodeWindow(
  windowState: CodeWindowState,
  bounds: { width: number; height: number },
  minimum: { width: number; height: number } = { width: DEFAULT_MIN_WIDTH, height: DEFAULT_MIN_HEIGHT },
): CodeWindowState {
  if (bounds.width <= 0 || bounds.height <= 0) return windowState;
  const minWidth = Math.min(1, minimum.width / bounds.width);
  const minHeight = Math.min(1, minimum.height / bounds.height);
  const width = Math.min(1, Math.max(minWidth, windowState.width));
  const height = Math.min(1, Math.max(minHeight, windowState.height));
  return {
    ...windowState,
    width,
    height,
    x: Math.max(0, Math.min(1 - width, windowState.x)),
    y: Math.max(0, Math.min(1 - height, windowState.y)),
  };
}
