import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../data/db";
import { createDocument, saveDocument } from "../data/docs";
import { i18n, i18nReady } from "../i18n";
import { DocsPage } from "./DocsPage";

describe("Kxno Docs editor", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    localStorage.clear();
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
    Object.defineProperty(HTMLElement.prototype, "getClientRects", {
      configurable: true,
      value: () => [{ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }],
    });
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [{ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    });
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
    Reflect.deleteProperty(document, "elementFromPoint");
    Reflect.deleteProperty(HTMLElement.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getClientRects");
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  });

  it("autosaves editor changes locally and reloads the saved content", async () => {
    const document = await createDocument("Revision");
    const user = userEvent.setup();
    const view = render(<DocsPage />);
    const editor = await screen.findByRole("textbox", { name: "Document editor" });
    await user.type(editor, "Photosynthesis notes");

    await waitFor(async () => {
      expect((await db.documentContents.get(document.id))?.plainText).toBe("Photosynthesis notes");
    }, { timeout: 5000 });
    view.unmount();

    const persisted = await db.documentContents.get(document.id);
    expect(persisted?.plainText).toBe("Photosynthesis notes");
    expect(persisted?.content).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Photosynthesis notes" }] }],
    });
    render(<DocsPage />);
    expect(await screen.findByRole("textbox", { name: "Document editor" })).toHaveTextContent("Photosynthesis notes");
  });

  it("keeps dark paper preview visual-only and leaves stored formatting unchanged", async () => {
    const docRecord = await createDocument("Styled");
    const content = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "Important", marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#b42318" } }] }],
      }],
    };
    await saveDocument(docRecord, content);
    const user = userEvent.setup();
    render(<DocsPage />);
    const toggle = await screen.findByRole("button", { name: "Dark paper preview" });

    await user.click(toggle);
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).toBeInTheDocument();
    expect(await db.documentContents.get(docRecord.id)).toMatchObject({ content });

    await user.click(screen.getByRole("button", { name: "Normal paper" }));
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).not.toBeInTheDocument();
    expect(await db.documentContents.get(docRecord.id)).toMatchObject({ content });
  });

  it("provides A4 print settings independent of the selected paper preview", async () => {
    const docRecord = await createDocument("Print layout");
    await db.documents.update(docRecord.id, {
      orientation: "landscape",
      margins: { top: 16, right: 18, bottom: 20, left: 22 },
    });
    const user = userEvent.setup();
    render(<DocsPage />);
    await screen.findByRole("textbox", { name: "Document editor" });
    const pageStyle = globalThis.document.querySelector(".docs-paper style")?.textContent ?? "";
    expect(pageStyle).toContain("@page { size: A4 landscape; margin: 16mm 18mm 20mm 22mm");

    await user.click(screen.getByRole("button", { name: "Dark paper preview" }));
    expect(globalThis.document.querySelector(".docs-page-viewport--dark")).toBeInTheDocument();
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@media print");
    expect(css).toContain(".docs-page-viewport--dark .docs-paper");
    expect(css).toContain("background: #fff !important");
  });

  it("opens a new local document from the empty state", async () => {
    const user = userEvent.setup();
    render(<DocsPage />);
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
    await user.click(screen.getAllByRole("button", { name: "New document" })[0]);
    expect(await screen.findByRole("textbox", { name: "Document editor" })).toBeInTheDocument();
    expect(await db.documents.count()).toBe(1);
    expect(await db.documentContents.count()).toBe(1);
  });

  it("deletes the selected document without leaving a stale load error", async () => {
    await createDocument("Temporary");
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DocsPage />);
    await screen.findByRole("textbox", { name: "Document editor" });
    await user.click(screen.getByRole("button", { name: "Delete document" }));

    await waitFor(async () => {
      expect(await db.documents.count()).toBe(0);
    });
    expect(await screen.findAllByText("Your documents will appear here.")).not.toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
