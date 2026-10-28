import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { db, type WorkspaceElement } from "./db";
import { connectWorkspaceElements, DEFAULT_WORKSPACE, isWorkspaceState, removeWorkspaceElement, saveWorkspace } from "./workspace";

afterEach(async () => {
  await Promise.all([db.workspace.clear(), db.files.clear()]);
});

describe("workspace persistence", () => {
  it("persists canvas state and file references without copying file blobs into the workspace record", async () => {
    const fileId = crypto.randomUUID();
    const element: WorkspaceElement = {
      id: crypto.randomUUID(),
      kind: "image",
      x: 120,
      y: 80,
      width: 340,
      height: 280,
      borderColor: "#4b8fa8",
      title: "diagram.png",
      content: "",
      fileId,
    };
    const file = new Blob(["image bytes"], { type: "image/png" });
    await db.files.add({
      id: fileId,
      name: element.title,
      type: "image/png",
      size: file.size,
      category: "Workspace",
      createdAt: 1,
      modifiedAt: 1,
      blob: file,
    });
    const state = {
      ...DEFAULT_WORKSPACE,
      elements: [element],
      viewport: { x: -40, y: 90, zoom: 1.4 },
    };

    await saveWorkspace(state);

    expect(await db.workspace.get("default")).toMatchObject({ state });
    expect(await db.files.get(fileId)).toMatchObject({ blob: file });
    expect("blob" in (await db.workspace.get("default"))!.state.elements[0]).toBe(false);
  });

  it("creates unique visual connections and ignores self or duplicate links", () => {
    const first = connectWorkspaceElements([], "a", "b");
    expect(first).toHaveLength(1);
    expect(connectWorkspaceElements(first, "a", "b")).toBe(first);
    expect(connectWorkspaceElements(first, "b", "a")).toBe(first);
    expect(connectWorkspaceElements(first, "a", "a")).toBe(first);
  });

  it("rejects workspace font sizes that are not available in the editor", () => {
    expect(isWorkspaceState({
      ...DEFAULT_WORKSPACE,
      elements: [{
        id: "text",
        kind: "text",
        x: 0,
        y: 0,
        width: 280,
        height: 200,
        borderColor: "#000000",
        fontSize: 11,
        title: "",
        content: "",
      }],
    })).toBe(false);
  });

  it("removes an element together with attached connections", () => {
    const connections = connectWorkspaceElements([], "a", "b");
    const state = {
      ...DEFAULT_WORKSPACE,
      elements: [
        { id: "a", kind: "text" as const, x: 0, y: 0, width: 280, height: 200, borderColor: "#000000", title: "", content: "" },
        { id: "b", kind: "text" as const, x: 300, y: 0, width: 280, height: 200, borderColor: "#000000", title: "", content: "" },
      ],
      connections,
    };

    expect(removeWorkspaceElement(state, "a")).toMatchObject({ elements: [{ id: "b" }], connections: [] });
  });
});
