import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../data/db";
import { i18n, i18nReady } from "../i18n";
import { CodeLabPage } from "./CodeLabPage";

describe("Code Lab interface", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    await db.open();
    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
    await db.codeGardenState.clear();
  });

  afterEach(async () => {
    cleanup();
    await db.codeProjects.clear();
    await db.codeLabProgress.clear();
    await db.codeGardenState.clear();
  });

  it("supports lesson editing, checking, saving progress, and continuing", async () => {
    const user = userEvent.setup();
    render(<CodeLabPage />);

    expect(await screen.findByRole("heading", { name: "Create your first page" })).toBeInTheDocument();
    const lessonEditor = screen.getByRole("textbox", { name: "HTML code editor" });
    await user.clear(lessonEditor);
    await user.type(lessonEditor, "<!doctype html><h1>My first page</h1>");
    await user.click(screen.getByRole("button", { name: "Check solution" }));
    expect(await screen.findByText("Nice work. Your solution meets this lesson's goal.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Headings and paragraphs" })).toBeInTheDocument();

    await waitFor(async () => {
      expect(await db.codeLabProgress.get("default")).toMatchObject({
        completedLessonIds: ["first-page"],
        currentLessonId: "headings-and-paragraphs",
      });
    });
  });

  it("uses a clean workspace toolbar for switching areas, adding windows, and showing time", async () => {
    const user = userEvent.setup();
    render(<CodeLabPage />);

    await screen.findByRole("heading", { name: "Create your first page" });
    expect(screen.queryByText("Learn, build, and automate in one programming workspace.")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn 0/5" })).toHaveAttribute("aria-current", "page");
    expect(document.querySelector(".code-lab__clock")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("menu", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Balanced layout" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Playground" }));
    expect(screen.getByRole("button", { name: "Playground" })).toHaveAttribute("aria-current", "page");
  });

  it("runs project preview in a scripts-only iframe and persists edited code", async () => {
    const user = userEvent.setup();
    const first = render(<CodeLabPage />);
    await screen.findByRole("heading", { name: "Create your first page" });
    await user.click(screen.getByRole("button", { name: "Playground" }));

    const htmlEditor = await screen.findByRole("textbox", { name: "HTML code editor" });
    await user.clear(htmlEditor);
    await user.type(htmlEditor, "<h1>Saved playground</h1>");
    await user.click(screen.getByRole("button", { name: "Run" }));

    const preview = screen.getByTitle("Live preview");
    expect(preview).toHaveAttribute("sandbox", "allow-scripts");
    expect(preview.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(preview.getAttribute("srcdoc")).toContain("<h1>Saved playground</h1>");
    await user.click(screen.getByRole("button", { name: "Save project" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    first.unmount();
    render(<CodeLabPage />);
    await user.click(await screen.findByRole("button", { name: "Playground" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "HTML code editor" })).toHaveValue("<h1>Saved playground</h1>"));
  });

  it("opens the playable Code Garden section", async () => {
    render(<CodeLabPage />);
    await screen.findByRole("heading", { name: "Create your first page" });
    fireEvent.click(screen.getByRole("button", { name: /Code Garden/ }));
    expect(await screen.findByRole("heading", { name: "First harvest" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Robot program" })).toBeInTheDocument();
    expect(screen.queryByText("0 of 5 complete")).not.toBeInTheDocument();
  });

  it("reports runtime errors only from the active sandbox preview", async () => {
    const user = userEvent.setup();
    render(<CodeLabPage />);
    await screen.findByRole("heading", { name: "Create your first page" });
    await user.click(screen.getByRole("button", { name: "Playground" }));
    await screen.findByTitle("Live preview");
    const preview = document.querySelector<HTMLIFrameElement>(".code-lab__preview iframe");
    if (!preview) throw new Error("The project preview iframe was not rendered.");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: { type: "kxno-code-error", message: "not trusted" },
    }));
    expect(screen.queryByText(/not trusted/)).not.toBeInTheDocument();

    window.dispatchEvent(new MessageEvent("message", {
      source: preview.contentWindow,
      data: { type: "kxno-code-error", message: "Example runtime error" },
    }));
    expect(await screen.findByText(/Example runtime error/)).toBeInTheDocument();
  });
});
