import { describe, expect, it } from "vitest";
import {
  applyCodeLayoutPreset,
  clampCodeWindow,
  createDefaultCodeLayout,
  isCodeLayout,
  loadCodeLayout,
  saveCodeLayout,
  type CodeWindowDefinition,
} from "./code-layout";

const definitions: CodeWindowDefinition[] = [
  { id: "editor", title: "Editor", initial: { x: 0.1, y: 0.1, width: 0.5, height: 0.7 } },
  { id: "reference", title: "Reference", initial: { x: 0.4, y: 0.1, width: 0.5, height: 0.7 }, openByDefault: false },
];

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("Code workspace layouts", () => {
  it("uses the requested initial visibility and validates the window set", () => {
    const layout = createDefaultCodeLayout(definitions);
    expect(layout.windows.map((window) => window.open)).toEqual([true, false]);
    expect(isCodeLayout(layout, definitions)).toBe(true);
    expect(isCodeLayout({ ...layout, windows: layout.windows.slice(1) }, definitions)).toBe(false);
  });

  it("persists and restores layouts independently by mode", () => {
    const storage = memoryStorage();
    const layout = createDefaultCodeLayout(definitions);
    layout.windows[0].minimized = true;
    saveCodeLayout("garden", layout, storage);
    expect(loadCodeLayout("garden", definitions, storage)).toEqual({ layout, corrupted: false });
    expect(loadCodeLayout("learn", definitions, storage).layout.windows[0].minimized).toBe(false);
  });

  it("replaces invalid persisted layouts and opens the reference preset", () => {
    const storage = memoryStorage();
    storage.setItem("kxnodesk.code-layout.v1.garden", "{invalid");
    expect(loadCodeLayout("garden", definitions, storage).corrupted).toBe(true);
    const reference = applyCodeLayoutPreset("reference", definitions);
    expect(reference.windows.find((window) => window.id === "reference")).toMatchObject({ open: true, minimized: false });
  });

  it("clamps moved and resized windows to the visible workspace bounds", () => {
    const [window] = createDefaultCodeLayout(definitions).windows;
    expect(clampCodeWindow({ ...window, x: 0.9, y: 0.8, width: 0.6, height: 0.7 }, { width: 1000, height: 600 }))
      .toMatchObject({ x: 0.4, y: 0.30000000000000004, width: 0.6, height: 0.7 });
    expect(clampCodeWindow({ ...window, width: 0.01, height: 0.01 }, { width: 1000, height: 600 }))
      .toMatchObject({ width: 0.25, height: 0.2833333333333333 });
  });
});
