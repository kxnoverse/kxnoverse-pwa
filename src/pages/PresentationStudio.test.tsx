import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../data/db";
import { createPresentationProject, savePresentationProject } from "../data/presentations";
import { i18n, i18nReady } from "../i18n";
import { PresentationStudio } from "./PresentationStudio";

describe("Presentation Studio", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    cleanup();
    db.close();
    await db.delete();
  });

  it("flushes the latest edit to local storage when leaving the studio", async () => {
    const project = await savePresentationProject(createPresentationProject("northstar"));
    const { unmount } = render(<PresentationStudio />);
    const title = await screen.findByRole("textbox", { name: "Slide title" });

    fireEvent.change(title, { target: { value: "Saved before leaving" } });
    unmount();

    await waitFor(async () => {
      expect((await db.presentations.get(project.id))?.slides[0].title).toBe("Saved before leaving");
    });
  });
});
