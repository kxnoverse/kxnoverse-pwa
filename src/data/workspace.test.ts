import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { db, type WorkspaceElement } from "./db";
import { addWorkspaceTemplate, connectWorkspaceElements, DEFAULT_WORKSPACE, isWorkspaceState, removeWorkspaceElement, saveWorkspace, type WorkspaceTemplateCopy } from "./workspace";

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

  it("accepts stable Docs references and rejects document cards without a document ID", () => {
    const element = {
      id: "linked-doc",
      kind: "document" as const,
      x: 0,
      y: 0,
      width: 340,
      height: 250,
      borderColor: "#4b8fa8",
      title: "Report title",
      content: "",
      documentId: "stable-document-id",
    };
    expect(isWorkspaceState({ ...DEFAULT_WORKSPACE, elements: [element] })).toBe(true);
    expect(isWorkspaceState({ ...DEFAULT_WORKSPACE, elements: [{ ...element, documentId: undefined }] })).toBe(false);
  });

  it("adds editable template cards and connections without replacing existing content", () => {
    const existing = {
      id: "existing",
      kind: "text" as const,
      x: -1800,
      y: -900,
      width: 280,
      height: 200,
      borderColor: "#112233",
      title: "Keep",
      content: "Existing content",
    };
    const state = { ...DEFAULT_WORKSPACE, elements: [existing] };
    const copy: WorkspaceTemplateCopy = {
      mainIdea: "Main idea",
      branchOne: "Branch one",
      branchTwo: "Branch two",
      branchThree: "Branch three",
      branchFour: "Branch four",
      topic: "Topic",
      keyConcepts: "Key concepts",
      questions: "Questions",
      summary: "Summary",
      toDo: "To do",
      inProgress: "In progress",
      review: "Review",
      done: "Done",
      addDetails: "Add details",
    };
    const result = addWorkspaceTemplate(state, "mind-map", "#4b8fa8", copy, { x: 500, y: 400 });

    expect(result.elements).toHaveLength(6);
    expect(result.connections).toHaveLength(4);
    expect(result.elements[0]).toEqual(existing);
    expect(result.elements.slice(1).every((element) => element.kind === "text")).toBe(true);
    expect(isWorkspaceState(result)).toBe(true);
    expect(addWorkspaceTemplate(state, "blank", "#4b8fa8", copy, { x: 0, y: 0 })).toBe(state);
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
