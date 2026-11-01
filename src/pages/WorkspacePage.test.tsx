import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { db } from "../data/db";
import { i18n, i18nReady } from "../i18n";

function dispatchPointer(target: EventTarget, type: string, values: { pointerId: number; button: number; clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  act(() => target.dispatchEvent(event));
}

beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  await i18nReady;
  await i18n.changeLanguage("en");
  await Promise.all([db.workspace.clear(), db.notes.clear(), db.files.clear(), db.documents.clear(), db.documentContents.clear()]);
  window.location.hash = "#/";
});

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("Workspace", () => {
  it("opens as a minimal full-screen page, hides Solve navigation, and adds editable text", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.queryByRole("link", { name: "Kxno Solve" })).not.toBeInTheDocument();
    await user.click(navigation.getByRole("link", { name: "Workspace" }));
    expect(await screen.findByRole("region", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    const collapseButton = screen.getByRole("button", { name: "Collapse navigation" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    await user.click(collapseButton);
    expect(document.querySelector(".app-frame--workspace-collapsed")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
    const expandButton = screen.getByRole("button", { name: "Expand navigation" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    await user.click(expandButton);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(document.querySelector(".workspace-clock")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Text" }));
    const title = screen.getByRole("textbox", { name: "Element title" });
    await user.clear(title);
    await user.type(title, "Study idea");
    await user.type(screen.getByRole("textbox", { name: "Text" }), "Review chapter four");
    fireEvent.change(screen.getByLabelText("Change border color"), { target: { value: "#cc6677" } });
    fireEvent.change(screen.getByLabelText("Change font size"), { target: { value: "18" } });
    expect(screen.getByLabelText("Change font size")).toHaveValue("18");
    expect(document.querySelector<HTMLElement>(".workspace-card")?.style.getPropertyValue("--workspace-font-size")).toBe("18px");

    const surface = screen.getByRole("region", { name: "Workspace" });
    const originalBackground = (surface as HTMLElement).style.backgroundPosition;
    fireEvent.wheel(surface, { clientX: 400, clientY: 260, deltaY: -120 });
    const originalTransform = document.querySelector<HTMLElement>(".workspace-world")!.style.transform;
    dispatchPointer(surface, "pointerdown", { pointerId: 6, button: 0, clientX: 300, clientY: 240 });
    dispatchPointer(window, "pointermove", { pointerId: 6, button: 0, clientX: 340, clientY: 280 });
    dispatchPointer(window, "pointerup", { pointerId: 6, button: 0, clientX: 340, clientY: 280 });
    expect(document.querySelector<HTMLElement>(".workspace-world")!.style.transform).not.toBe(originalTransform);
    expect((surface as HTMLElement).style.backgroundPosition).not.toBe(originalBackground);

    await waitFor(async () => {
      const saved = await db.workspace.get("default");
      expect(saved?.state.elements).toMatchObject([{ kind: "text", title: "Study idea", content: "Review chapter four", borderColor: "#cc6677", fontSize: 18 }]);
      expect(saved?.state.viewport.zoom).toBeGreaterThan(1);
    });
  });

  it("moves and resizes elements, connects them, and persists the resulting layout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" }));
    await screen.findByRole("region", { name: "Workspace" });

    const addText = async () => {
      await user.click(screen.getByRole("button", { name: "Add to workspace" }));
      await user.click(screen.getByRole("menuitem", { name: "Text" }));
    };
    await addText();
    await addText();
    const cards = document.querySelectorAll<HTMLElement>(".workspace-card");
    expect(cards).toHaveLength(2);
    const firstCard = cards[0];
    const firstHeader = firstCard.querySelector<HTMLElement>(".workspace-card__header")!;
    const beforeLeft = firstCard.style.left;
    dispatchPointer(firstHeader, "pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    dispatchPointer(window, "pointermove", { pointerId: 1, button: 0, clientX: 150, clientY: 130 });
    dispatchPointer(window, "pointerup", { pointerId: 1, button: 0, clientX: 150, clientY: 130 });
    expect(firstCard.style.left).not.toBe(beforeLeft);

    const beforeWidth = firstCard.style.width;
    dispatchPointer(within(firstCard).getByRole("button", { name: "Resize element" }), "pointerdown", { pointerId: 2, button: 0, clientX: 200, clientY: 200 });
    dispatchPointer(window, "pointermove", { pointerId: 2, button: 0, clientX: 250, clientY: 240 });
    dispatchPointer(window, "pointerup", { pointerId: 2, button: 0, clientX: 250, clientY: 240 });
    expect(firstCard.style.width).not.toBe(beforeWidth);

    await user.click(within(firstCard).getByRole("button", { name: "Connect" }));
    await user.click(within(cards[1]).getByRole("button", { name: "Connect to Text" }));
    expect(screen.getByRole("button", { name: "Remove connection" })).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await db.workspace.get("default");
      expect(saved?.state.connections).toHaveLength(1);
      expect(saved?.state.elements[0].x).not.toBe(Number.parseFloat(beforeLeft));
      expect(saved?.state.elements[0].width).not.toBe(Number.parseFloat(beforeWidth));
    });

    await user.click(screen.getByRole("button", { name: "Remove connection" }));
    await waitFor(async () => expect((await db.workspace.get("default"))?.state.connections).toHaveLength(0));
  });

  it("stores notes in the existing notes table and stores media once in the existing file table", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" }));
    await screen.findByRole("region", { name: "Workspace" });
    await user.click(screen.getByRole("button", { name: "Add to workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Note" }));

    const noteTitle = await screen.findByRole("textbox", { name: "Element title" });
    await user.clear(noteTitle);
    await user.type(noteTitle, "Biology");
    await user.type(screen.getByRole("textbox", { name: "Note content" }), "Cell structure");
    await waitFor(async () => expect(await db.notes.toCollection().first()).toMatchObject({ title: "Biology", content: "Cell structure" }));

    await user.click(screen.getByRole("button", { name: "Add to workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Image" }));
    const image = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "cell.png", { type: "image/png" });
    fireEvent.change(document.querySelector<HTMLInputElement>(".workspace-file-input")!, { target: { files: [image] } });

    await waitFor(async () => {
      const saved = await db.workspace.get("default");
      const fileElement = saved?.state.elements.find((element) => element.kind === "image");
      expect(await db.files.count()).toBe(1);
      expect(fileElement?.fileId).toBe((await db.files.toCollection().first())?.id);
      expect(fileElement).not.toHaveProperty("blob");
    });
  });

  it("adds a stable Docs link, reflects document renames, and opens that document", async () => {
    const user = userEvent.setup();
    await db.documents.add({
      id: "linked-school-document",
      title: "Chemistry review",
      createdAt: 1,
      updatedAt: 2,
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25, right: 25, bottom: 25, left: 25 },
      header: "",
      footer: "",
    });
    await db.documentContents.add({
      id: "linked-school-document",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      plainText: "Atomic structure and bonding",
    });
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" }));
    await screen.findByRole("region", { name: "Workspace" });
    await user.click(screen.getByRole("button", { name: "Add to workspace" }));
    await user.click(screen.getByRole("menuitem", { name: "Add Kxno Docs document" }));
    await user.click(await screen.findByRole("button", { name: /Chemistry review/ }));

    await waitFor(async () => {
      expect((await db.workspace.get("default"))?.state.elements).toContainEqual(expect.objectContaining({
        kind: "document",
        documentId: "linked-school-document",
        content: "",
      }));
    });
    const title = screen.getByRole("textbox", { name: "Element title" });
    expect(title).toHaveValue("Chemistry review");
    expect(screen.getByText("Atomic structure and bonding")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open in Docs" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/docs?document=linked-school-document");
    });
    const docsTitle = await screen.findByRole("textbox", { name: "Document title" }, { timeout: 5000 });
    expect(docsTitle).toHaveValue("Chemistry review");
    await db.documents.update("linked-school-document", { title: "Chemistry notes", updatedAt: 3 });
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" }));
    await screen.findByRole("region", { name: "Workspace" });
    await waitFor(async () => expect((await db.documents.get("linked-school-document"))?.title).toBe("Chemistry notes"));
    expect(screen.getByRole("textbox", { name: "Element title" })).toHaveValue("Chemistry notes");
  });

  it("previews a template before adding its editable cards to existing workspace content", async () => {
    const user = userEvent.setup();
    const existing = {
      id: "keep-existing",
      kind: "text" as const,
      x: -1800,
      y: -900,
      width: 280,
      height: 200,
      borderColor: "#4b8fa8",
      title: "Existing card",
      content: "Do not replace",
    };
    await db.workspace.add({
      id: "default",
      state: { elements: [existing], connections: [], viewport: { x: 28, y: 28, zoom: 1 } },
      updatedAt: 1,
    });
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" }));
    await screen.findByRole("region", { name: "Workspace" });
    await user.click(screen.getByRole("button", { name: "Templates" }));
    await user.click(screen.getByRole("menuitem", { name: "Mind Map" }));

    expect(await screen.findByRole("dialog", { name: "Mind Map" })).toBeInTheDocument();
    expect((await db.workspace.get("default"))?.state.elements).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add to Workspace" }));

    await waitFor(async () => {
      const state = (await db.workspace.get("default"))?.state;
      expect(state?.elements).toHaveLength(6);
      expect(state?.connections).toHaveLength(4);
      expect(state?.elements[0]).toMatchObject({ id: "keep-existing", content: "Do not replace" });
    });
  });
});
