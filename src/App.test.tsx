import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { db, localDateKey } from "./data/db";
import { i18n, i18nReady } from "./i18n";
import {
  defaultAppearance,
  defaultHomeWidgets,
  useUiStore,
} from "./stores/ui-store";
import { assistantClient } from "./data/ai-client";
import { PDFDocument } from "pdf-lib";
import { createColorClash, getPlayableClashCards } from "./data/phase6d/color-clash";
import { translationProvider } from "./data/translation";

vi.mock("./components/TurnstileChallenge", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    TurnstileChallenge: ({ requestId, onToken }: { requestId: number; onToken: (token: string) => void }) => {
      const callback = React.useRef(onToken);
      callback.current = onToken;
      React.useEffect(() => {
        if (requestId > 0) callback.current("test-turnstile-token");
      }, [requestId]);
      return null;
    },
  };
});

beforeEach(async () => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  window.location.hash = "#/";
  await i18nReady;
  await i18n.changeLanguage("en");
  await Promise.all([
    db.subjects.clear(),
    db.teachers.clear(),
    db.timetable.clear(),
    db.exceptions.clear(),
    db.settings.clear(),
    db.aiPresets.clear(),
    db.aiConversations.clear(),
    db.aiMessages.clear(),
    db.aiAttachments.clear(),
    db.tasks.clear(),
    db.calendarEvents.clear(),
    db.notes.clear(),
    db.focusSessions.clear(),
    db.files.clear(),
    db.arcadeData.clear(),
    db.workspace.clear(),
    db.documents.clear(),
    db.documentContents.clear(),
    db.documentImages.clear(),
    db.pdfProjects.clear(),
    db.codeProjects.clear(),
    db.codeLabProgress.clear(),
    db.codeGardenState.clear(),
  ]);
  useUiStore.getState().updateAppearance(defaultAppearance);
  useUiStore.getState().setHomeTypography("pixel");
  useUiStore.getState().setHomeDemoData(false);
  useUiStore.getState().setHomeWidgets(defaultHomeWidgets);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Kxno Desk shell", () => {
  it("renders the local schedule dashboard and opens the timetable", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("de", "translation")).toBe(false);
    expect(screen.getByRole("link", { name: "Kxno Desk" })).toBeInTheDocument();
    expect(await screen.findByRole(
      "heading",
      { name: /^(Good (morning|afternoon|evening), User|Working late, User)$/ },
      { timeout: 5000 },
    )).toBeInTheDocument();
    expect(useUiStore.getState().appearance).toMatchObject({
      accent: "#8dbfd0",
      background: "#10161b",
      backgroundStyle: "chrome",
    });

    expect(document.querySelector(".background-layer--chrome")).toBeInTheDocument();
    expect(document.querySelector(".app-frame")).toHaveClass("app-frame--home");
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-home-typography", "pixel");
    expect(document.querySelector(".home-ref-top")).toBeInTheDocument();
    expect(document.querySelector(".home-ref-schedule")).toBeInTheDocument();
    expect(document.querySelector(".home-ref-stats")).toBeInTheDocument();
    const homeShortcuts = within(screen.getByRole("navigation", { name: "Workspace" }));
    expect(homeShortcuts.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(homeShortcuts.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
    expect(homeShortcuts.getByRole("link", { name: /Notes/ })).toBeInTheDocument();
    expect(homeShortcuts.getByRole("link", { name: "Timer" })).toBeInTheDocument();
    expect(screen.queryByText("Week A")).not.toBeInTheDocument();
    expect(screen.queryByText("Week B")).not.toBeInTheDocument();
    expect(document.querySelector(".home-dashboard")).not.toBeInTheDocument();
    expect(
      document.querySelector(".home-ref-stat .home-ref-stat-copy strong"),
    ).toHaveTextContent("00");
    expect(screen.getByRole("time")).toBeInTheDocument();
    expect(document.querySelector(".home-ref-eyebrow")).toHaveTextContent(
      new Intl.DateTimeFormat("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    );
    expect(document.querySelector(".home-ref-countdown small")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today’s schedule" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Files" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Translate" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Kxno Solve" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Workspace" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Docs" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Code" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Kxno Docs" })).not.toBeInTheDocument();
    expect(screen.getByText("Kxno Desk · Made By Kxno (Shero)")).toBeInTheDocument();

    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Code" }));
    expect(await screen.findByRole("heading", { name: "Create your first page" })).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole(
        "link",
        { name: "Timetable" },
      ),
    );
    expect(await screen.findByRole("heading", { name: "Timetable" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("opens and dismisses the screensaver without removing sidebar navigation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole(
      "button",
      { name: "Screensaver" },
      { timeout: 5000 },
    ));
    expect(await screen.findByRole("group", { name: "Screensaver" })).toBeInTheDocument();
    expect(document.querySelector(".app-frame")).toHaveClass("app-frame--screensaver");
    expect(document.documentElement.style.overflow).toBe("hidden");
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(navigation.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("group", { name: "Screensaver" }));
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "Screensaver" })).not.toBeInTheDocument();
      expect(document.querySelector(".app-frame")).not.toHaveClass("app-frame--screensaver");
      expect(document.documentElement.style.overflow).toBe("");
    });
  });

  it("shows timetable entries, tasks, and events in the new Home composition", async () => {
    const now = new Date();
    const startAt = new Date(now.getTime() + 60 * 60 * 1000);
    await db.subjects.add({ id: "home-math", name: "Mathematics", color: "#ff5d56" });
    await db.timetable.add({
      id: "home-math-period",
      subjectId: "home-math",
      weekday: (now.getDay() + 6) % 7,
      start: "08:00",
      end: "08:45",
      weekType: "all",
      kind: "lesson",
      room: "B204",
    });
    await db.tasks.add({
      id: "home-physics-task",
      title: "Physics worksheet",
      description: "",
      dueDate: localDateKey(now),
      priority: "normal",
      category: "",
      tags: [],
      subtasks: [],
      completed: false,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    });
    await db.calendarEvents.add({
      id: "home-english-test",
      type: "exam",
      title: "English test",
      description: "",
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000).toISOString(),
      allDay: false,
      color: "#ff5d56",
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    });

    render(<App />);

    expect(await screen.findByText("Mathematics", { selector: ".home-ref-lesson-copy strong" })).toBeInTheDocument();
    expect(document.querySelectorAll(".home-ref-lesson")).toHaveLength(1);
    expect(await screen.findByText("Physics worksheet")).toBeInTheDocument();
    expect(await screen.findByText("English test")).toBeInTheDocument();
  });

  it("lets each Home widget cycle through persistent, distinct widget options", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const [widget, heading, previousHeading] of [
      ["workspace", "Workspace", "Tasks"],
      ["assistant", "Assistant", "Workspace"],
      ["docs", "Docs", "Assistant"],
      ["minigames", "Minigames", "Docs"],
      ["calculator", "Calculator", "Minigames"],
      ["translate", "Translate", "Calculator"],
    ]) {
      await user.click(
        await screen.findByRole("button", {
          name: `Switch ${previousHeading} widget`,
        }),
      );
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      expect(
        document.querySelector(`.home-ref-widget-preview[data-widget="${widget}"]`),
      ).toBeInTheDocument();
      expect(useUiStore.getState().homeWidgets).toEqual([widget, "upcoming"]);
      if (widget === "assistant") {
        expect(screen.getByRole("link", { name: "Open Assistant" })).toHaveAttribute(
          "href",
          "#/assistant",
        );
      }
    }

    expect(
      JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.homeWidgets,
    ).toEqual(["translate", "upcoming"]);
  });

  it("renders the empty Home state without the former dashboard layout", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /^(Good (morning|afternoon|evening), User|Working late, User)$/ })).toBeInTheDocument();
    expect(document.querySelector(".home-ref-empty")).toBeInTheDocument();
    expect(document.querySelector(".home-ref-hero")).toBeInTheDocument();
    expect(document.querySelector(".home-ref-stats")).toBeInTheDocument();
    expect(document.querySelector(".home-dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first lesson" })).toHaveAttribute("href", "#/timetable");
  });

  it.each(["/?homePreview=timetable#/", "/#/?homePreview=timetable"])(
    "shows timetable preview fixtures for %s without writing sample data to IndexedDB",
    async (previewUrl) => {
      window.history.replaceState(null, "", previewUrl);
      render(<App />);

      expect(
        await screen.findByText("Mathematics", {
          selector: ".home-ref-lesson-copy strong",
        }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Demo data · not saved")).toBeInTheDocument();
      expect(document.querySelectorAll(".home-ref-lesson")).toHaveLength(4);
      expect(
        document.querySelectorAll(".home-ref-lesson-copy strong"),
      ).toHaveLength(4);
      expect(
        [...document.querySelectorAll(".home-ref-lesson-copy strong")].map(
          (subject) => subject.textContent,
        ),
      ).toEqual(["Check-in", "Mathematics", "German", "Sport"]);
      expect(document.querySelector(".home-ref-lesson-time time")).toHaveTextContent(
        "08:00",
      );
      expect(document.querySelector(".home-ref-lesson-time span")).toHaveTextContent(
        "08:20",
      );
      expect(
        document.querySelector(".home-ref-lesson.is-current .home-ref-lesson-copy strong"),
      ).toHaveTextContent("German");
      expect(
        document.querySelectorAll(".home-ref-lesson:not(.is-past):not(.is-current)"),
      ).toHaveLength(1);
      expect(await screen.findByText("Physics worksheet")).toBeInTheDocument();
      expect(await screen.findByText("English test")).toBeInTheDocument();
      await expect(db.timetable.count()).resolves.toBe(0);
      await expect(db.subjects.count()).resolves.toBe(0);
      await expect(db.tasks.count()).resolves.toBe(0);
      await expect(db.calendarEvents.count()).resolves.toBe(0);
    },
  );

  it("keeps Home typography and demo data independent of saved data and themes", async () => {
    const today = new Date();
    const now = today.getTime();
    const weekday = (today.getDay() + 6) % 7;
    await db.subjects.add({ id: "real-subject", name: "Saved Biology", color: "#7396b5" });
    await db.timetable.add({
      id: "real-lesson",
      subjectId: "real-subject",
      weekday,
      start: "08:00",
      end: "08:45",
      weekType: "all",
      kind: "lesson",
    });
    await db.tasks.add({
      id: "real-task",
      title: "Saved task",
      description: "",
      dueDate: localDateKey(today),
      priority: "normal",
      category: "",
      tags: [],
      subtasks: [],
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
    const savedExamStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
      12,
    );
    await db.calendarEvents.add({
      id: "real-event",
      type: "exam",
      title: "Saved exam",
      description: "",
      startAt: savedExamStart.toISOString(),
      endAt: new Date(savedExamStart.getTime() + 60 * 60 * 1000).toISOString(),
      allDay: false,
      color: "#7396b5",
      createdAt: now,
      updatedAt: now,
    });

    render(<App />);
    expect(await screen.findByText("Saved task")).toBeInTheDocument();
    act(() => useUiStore.getState().setHomeTypography("pixel"));
    expect(useUiStore.getState().homeDemoData).toBe(false);
    act(() => {
      useUiStore.getState().setHomeDemoData(true);
      useUiStore.getState().updateAppearance({ ...defaultAppearance, accent: "#f56b63" });
    });

    expect(useUiStore.getState().homeTypography).toBe("pixel");
    expect(useUiStore.getState().homeDemoData).toBe(true);
    expect(useUiStore.getState().appearance.accent).toBe("#f56b63");
    const persistedUi = JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}") as {
      state?: { homeTypography?: string; homeDemoData?: boolean };
    };
    expect(persistedUi.state).toMatchObject({
      homeTypography: "pixel",
      homeDemoData: true,
    });

    window.location.hash = "#/";
    expect(await screen.findByText("Demo data · not saved")).toBeInTheDocument();
    expect(await screen.findByText("German", { selector: ".home-ref-lesson-copy strong" })).toBeInTheDocument();
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-home-typography", "pixel");
    expect(document.querySelectorAll(".home-ref-lesson")).toHaveLength(4);
    expect(screen.queryByText("Saved task")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved exam")).not.toBeInTheDocument();
    await expect(db.subjects.count()).resolves.toBe(1);
    await expect(db.timetable.count()).resolves.toBe(1);
    await expect(db.tasks.count()).resolves.toBe(1);
    await expect(db.calendarEvents.count()).resolves.toBe(1);

    act(() => useUiStore.getState().setHomeDemoData(false));
    expect(useUiStore.getState().homeTypography).toBe("pixel");
    act(() => useUiStore.getState().setHomeTypography("default"));

    expect(await screen.findByText("Saved task")).toBeInTheDocument();
    expect(await screen.findByText("Saved exam")).toBeInTheDocument();
    expect(screen.queryByText("Demo data · not saved")).not.toBeInTheDocument();
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-home-typography", "default");
    await expect(db.subjects.count()).resolves.toBe(1);
    await expect(db.timetable.count()).resolves.toBe(1);
    await expect(db.tasks.count()).resolves.toBe(1);
    await expect(db.calendarEvents.count()).resolves.toBe(1);
  });

  it("keeps legacy task and note URLs working inside Docs", async () => {
    window.location.hash = "#/tasks";
    const first = render(<App />);
    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(window.location.hash).toContain("/docs?section=tasks");

    first.unmount();
    window.location.hash = "#/notes";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(window.location.hash).toContain("/docs?section=notes");
  });

  it("loads the new arcade strings from both offline language bundles", async () => {
    expect(i18n.t("arcade.phase6.laser.next")).toBe("Next puzzle");
    expect(i18n.t("arcade.games.crossword-infinite.name")).toBe("Crossword Infinite");
    expect(i18n.t("arcade.phase6d.ludo.roll")).toBe("Roll dice");
    expect(i18n.t("arcade.games.color-clash.name")).toBe("Color Clash");
    expect(i18n.t("arcade.phase6d.colorClash.cards.wild")).toBe("Wild");
    expect(i18n.t("translate.onDeviceReady")).toBe("On-device translation");
    await i18n.changeLanguage("de");
    expect(i18n.t("arcade.phase6.laser.next")).toBe("Nächstes Rätsel");
    expect(i18n.t("arcade.phase6.crossing.ready")).toContain("Überquere");
    expect(i18n.t("arcade.games.color-ludo.name")).toBe("Color Ludo");
    expect(i18n.t("arcade.games.hex-settlers.name")).toBe("Hex Settlers");
    expect(i18n.t("arcade.games.color-clash.name")).toBe("Color Clash");
    expect(i18n.t("arcade.phase6d.colorClash.cards.wild")).toBe("Farbwahl");
    expect(i18n.t("arcade.phase6d.crossword.difficulties.expert")).toBe("Experte");
    expect(i18n.t("nav.translate")).toBe("Übersetzen");
    expect(i18n.t("translate.onDeviceReady")).toContain("Gerät");
  });

  it("translates on demand and only saves history when the local-history option is enabled", async () => {
    const user = userEvent.setup();
    const supported = vi.spyOn(translationProvider, "isSupported").mockReturnValue(true);
    const translate = vi.spyOn(translationProvider, "translate").mockResolvedValue("Good morning, how are you?");
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    await user.click(navigation.getByRole("link", { name: "Translate" }));

    expect(await screen.findByRole("heading", { name: "Translate" }, { timeout: 10000 })).toBeInTheDocument();
    expect(supported).toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Save history on this device" }));
    await user.type(screen.getByRole("textbox", { name: "Text to translate" }), "Guten Morgen, wie geht es dir?");
    await user.click(screen.getByRole("button", { name: /^Translate$/ }));

    expect(await screen.findByRole("textbox", { name: "Translation" })).toHaveValue("Good morning, how are you?");
    expect(translate).toHaveBeenCalledWith(
      "Guten Morgen, wie geht es dir?",
      "de",
      "en",
      expect.any(Function),
      expect.any(AbortSignal),
    );
    await waitFor(async () => {
      expect(JSON.parse((await db.arcadeData.get("translate:history"))!.value)).toMatchObject([
        { sourceLanguage: "de", targetLanguage: "en", result: "Good morning, how are you?" },
      ]);
    }, { timeout: 15000 });

    await user.click(screen.getByRole("button", { name: "Clear history" }));
    await waitFor(async () => expect(await db.arcadeData.get("translate:history")).toBeUndefined());
    await user.click(screen.getByRole("checkbox", { name: "Save history on this device" }));
    await user.type(screen.getByRole("textbox", { name: "Text to translate" }), "Guten Morgen, wie geht es dir?");
    await user.click(screen.getByRole("button", { name: /^Translate$/ }));
    expect(await screen.findByRole("textbox", { name: "Translation" })).toHaveValue("Good morning, how are you?");
    expect(await db.arcadeData.get("translate:history")).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Swap languages" }));
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("en");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("de");
    await user.click(screen.getByRole("button", { name: "Clear text" }));
    expect(screen.getByRole("textbox", { name: "Text to translate" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Translation" })).toHaveValue("");
  }, 15000);

  it("lets a user cancel a translation that is still waiting for its local model", async () => {
    const user = userEvent.setup();
    vi.spyOn(translationProvider, "isSupported").mockReturnValue(true);
    vi.spyOn(translationProvider, "translate").mockImplementation(() => new Promise<string>(() => {}));
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Translate" }));
    await user.type(await screen.findByRole("textbox", { name: "Text to translate" }), "Guten Morgen, wie geht es dir?");
    await user.click(screen.getByRole("button", { name: /^Translate$/ }));
    await waitFor(() => expect(document.querySelector(".translate-progress")).toBeInTheDocument(), { timeout: 5000 });

    await user.click(document.querySelector<HTMLButtonElement>(".translate-cancel")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Translation cancelled");
    expect(screen.getByRole("button", { name: /^Translate$/ })).toBeEnabled();
  }, 15000);

  it("opens the arcade, persists favorites, and launches a playable game screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    await user.click(navigation.getByRole("link", { name: "Minigames" }));

    expect(await screen.findByRole("heading", { name: "Minigames" }, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(31);
    const thumbnails = [...document.querySelectorAll<SVGSVGElement>("[data-game-thumbnail]")];
    expect(thumbnails).toHaveLength(31);
    expect(new Set(thumbnails.map((thumbnail) => thumbnail.dataset.gameThumbnail)).size).toBe(31);
    expect(thumbnails.every((thumbnail) => thumbnail.getAttribute("viewBox") === "0 0 320 82")).toBe(true);
    const thumbnailsWithoutAccent = thumbnails
      .filter((thumbnail) => ![...thumbnail.querySelectorAll("[fill], [stroke]")].some((part) =>
        `${part.getAttribute("fill")} ${part.getAttribute("stroke")}`.includes("var(--game-accent)")))
      .map((thumbnail) => thumbnail.dataset.gameThumbnail);
    expect(thumbnailsWithoutAccent).toEqual([]);
    const artwork = (gameId: string) => document.querySelector(`[data-game-thumbnail="${gameId}"] [data-thumbnail-artwork="${gameId}"]`);
    expect(artwork("2048")?.querySelectorAll("rect")).toHaveLength(16);
    expect(artwork("2048")?.querySelectorAll("text")).toHaveLength(16);
    expect(artwork("geometry-runner")?.querySelectorAll("[data-runner-obstacle]")).toHaveLength(3);
    expect(artwork("simon-says")?.querySelectorAll("[data-simon-pad]")).toHaveLength(4);
    expect(artwork("line-rider")?.querySelector("[data-line-rider-track]")).toBeInTheDocument();
    expect(artwork("line-rider")?.querySelector("[data-line-rider-sled]")).toBeInTheDocument();
    expect(artwork("chess")?.querySelectorAll("[data-chess-square]")).toHaveLength(64);
    expect(artwork("chess")?.querySelectorAll("[data-chess-piece]")).toHaveLength(32);
    expect(screen.getByRole("heading", { name: "Tower Defense" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rhythm Tiles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mini Platformer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Perfect Stack" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Crossword Infinite" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Color Ludo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hex Settlers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Color Clash" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Knife Target" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Twin Orbit" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Laser Mirrors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pixel Crossing" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Strategy" }));
    expect(screen.getByRole("heading", { name: "Tower Defense" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Color Ludo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hex Settlers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Color Clash" })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(4);
    await user.click(await screen.findByRole("button", { name: "All games" }));
    await user.click(await screen.findByRole("button", { name: "Precision" }));
    expect(screen.getByRole("heading", { name: "Aim Trainer" })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(2);
    await user.click(await screen.findByRole("button", { name: "All games" }));
    const gameCard = screen.getByRole("heading", { name: "2048" }).closest("article");
    expect(gameCard).not.toBeNull();
    await user.click(within(gameCard!).getByRole("button", { name: "Add favorite 2048" }));
    expect(await db.arcadeData.get("favorites")).toMatchObject({ value: '["2048"]' });

    await user.click(within(screen.getByRole("heading", { name: "2048" }).closest("article")!).getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("heading", { name: "2048" })).toBeInTheDocument();
    expect(await screen.findByRole("grid", { name: "2048 game board" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await waitFor(async () => expect((await db.arcadeData.get("recent"))?.value).toBe('["2048"]'));

    const crosswordCard = screen.getByRole("heading", { name: "Crossword Infinite" }).closest("article");
    expect(crosswordCard).not.toBeNull();
    await user.click(within(crosswordCard!).getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("application", { name: /Select a cell and type letters/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Across" })).toBeInTheDocument();
    const crosswordKeyboard = document.querySelector<HTMLElement>(".phase6d-crossword__keyboard");
    expect(crosswordKeyboard).not.toBeNull();
    await user.click(within(crosswordKeyboard!).getByRole("button", { name: "A" }));
    expect(document.querySelectorAll(".phase6d-crossword__cell.has-letter")).toHaveLength(1);
    await waitFor(async () => expect(await db.arcadeData.get("crossword-infinite:session")).toBeDefined());

    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    const ludoCard = screen.getByRole("heading", { name: "Color Ludo" }).closest("article");
    expect(ludoCard).not.toBeNull();
    await user.click(within(ludoCard!).getByRole("button", { name: "Play" }));
    const ludoBoard = await screen.findByRole("group", { name: "Color Ludo game board" });
    expect(ludoBoard.querySelectorAll("[data-ring-position]")).toHaveLength(52);
    expect(ludoBoard.querySelectorAll("[data-safe-space]")).toHaveLength(8);
    expect(ludoBoard.querySelectorAll("[data-home-lane]")).toHaveLength(20);
    expect(ludoBoard.querySelectorAll("[data-base]")).toHaveLength(4);
    expect(ludoBoard.querySelectorAll("[data-yard-slot]")).toHaveLength(16);
    expect(ludoBoard.querySelectorAll(".phase6d-ludo__token-number")).toHaveLength(8);
    expect(ludoBoard.querySelectorAll(".phase6d-ludo__token-shadow")).toHaveLength(8);
    expect(ludoBoard.querySelectorAll(".phase6d-ludo__token-piece")).toHaveLength(8);
    const baseOrigins = { coral: [0, 0], teal: [0, 9], gold: [9, 9], violet: [9, 0] } as const;
    const insetOffset = 20;
    const insetSize = 200;
    const tokenRadius = 16.5;
    const tokenAxis = [(insetSize - tokenRadius) / 3, (insetSize * 2 + tokenRadius) / 3];
    for (const [color, [baseRow, baseColumn]] of Object.entries(baseOrigins)) {
      for (let token = 0; token < 4; token += 1) {
        const slot = ludoBoard.querySelector<SVGCircleElement>(`[data-yard-slot="${color}-${token}"]`);
        expect(slot).not.toBeNull();
        expect(Number(slot!.getAttribute("cx"))).toBeCloseTo(baseColumn * 40 + insetOffset + tokenAxis[token % 2]);
        expect(Number(slot!.getAttribute("cy"))).toBeCloseTo(baseRow * 40 + insetOffset + tokenAxis[Math.floor(token / 2)]);
      }
    }
    expect(ludoBoard.querySelectorAll("[data-finish-section]")).toHaveLength(4);
    expect(ludoBoard.querySelectorAll("[data-board-cell]")).toHaveLength(81);
    const ring = [...ludoBoard.querySelectorAll<SVGGElement>("[data-ring-position]")]
      .sort((left, right) => Number(left.dataset.ringPosition) - Number(right.dataset.ringPosition));
    const coordinate = (cell: SVGGElement) => [Number(cell.dataset.boardRow), Number(cell.dataset.boardColumn)];
    expect(new Set(ring.map((cell) => coordinate(cell).join(","))).size).toBe(52);
    expect(ring.every((cell) => coordinate(cell).every((value) => Number.isInteger(value) && value >= 0 && value < 15))).toBe(true);
    const adjacentTrackSteps = ring.filter((cell, position) => {
      const [row, column] = coordinate(cell);
      const [nextRow, nextColumn] = coordinate(ring[(position + 1) % ring.length]);
      return Math.abs(nextRow - row) + Math.abs(nextColumn - column) === 1;
    }).length;
    expect(adjacentTrackSteps).toBe(48);
    const ringCoordinates = new Set(ring.map((cell) => coordinate(cell).join(",")));
    for (const laneCell of ludoBoard.querySelectorAll<SVGGElement>("[data-home-lane]")) {
      expect(ringCoordinates.has(coordinate(laneCell).join(","))).toBe(false);
    }
    for (const [position, color, expectedRow, expectedColumn] of [
      [0, "coral", 6, 1],
      [13, "teal", 1, 8],
      [26, "gold", 8, 13],
      [39, "violet", 13, 6],
    ] as const) {
      expect(ring[position].dataset.startColor).toBe(color);
      expect(coordinate(ring[position])).toEqual([expectedRow, expectedColumn]);
      const laneEntry = ludoBoard.querySelector<SVGGElement>(`[data-home-lane="${color}"][data-home-step="1"]`);
      expect(laneEntry).not.toBeNull();
      expect(coordinate(laneEntry!)).toEqual(color === "coral" ? [7, 1]
        : color === "teal" ? [1, 7]
          : color === "gold" ? [7, 13] : [13, 7]);
    }
    const boardCells = [...ludoBoard.querySelectorAll<SVGRectElement>(".phase6d-ludo__cell, .phase6d-ludo__home-cell")];
    expect(boardCells).not.toHaveLength(0);
    expect(boardCells.every((cell) =>
      Number(cell.getAttribute("width")) === 40 &&
      Number(cell.getAttribute("height")) === 40 &&
      Number(cell.getAttribute("x")) % 40 === 0 &&
      Number(cell.getAttribute("y")) % 40 === 0)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Roll dice" }));
    expect(await screen.findByText(/rolled a [1-6]\./)).toBeInTheDocument();
    await waitFor(async () => expect(await db.arcadeData.get("color-ludo:session")).toBeDefined());
  }, 15_000);

  it("launches Hex Settlers, renders a complete board, and saves its initial state", async () => {
    window.location.hash = "#/minigames/hex-settlers";
    render(<App />);

    const board = await screen.findByRole("group", { name: "Hex Settlers island board" });
    expect(board.querySelectorAll("[data-terrain]")).toHaveLength(19);
    expect(board.querySelectorAll("[data-node-id]")).toHaveLength(54);
    expect(board.querySelectorAll("[data-edge-id]")).toHaveLength(72);
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();
    const legalSettlement = board.querySelector<SVGGElement>('[data-legal-node="true"]');
    expect(legalSettlement).not.toBeNull();
    fireEvent.click(legalSettlement!);
    await waitFor(async () => {
      const saved = await db.arcadeData.get("hex-settlers:session");
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!.value)).toMatchObject({
        board: { tiles: expect.any(Array), nodes: expect.any(Array), edges: expect.any(Array) },
        phase: "setup-road",
        players: expect.arrayContaining([
          expect.objectContaining({ settlements: [expect.any(String)] }),
        ]),
      });
    });
  });

  it("keeps focused controls separate from Pixel Crossing keyboard movement", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Pixel Crossing" });
    const crossingCard = screen.getByRole("heading", { name: "Pixel Crossing" }).closest("article");
    expect(crossingCard).not.toBeNull();
    await user.click(within(crossingCard!).getByRole("button", { name: "Play" }));
    await user.click(await screen.findByRole("button", { name: "Start" }));

    const player = document.querySelector(".phase6-crossing__player");
    expect(player).toHaveAttribute("transform", "translate(168 240)");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move up" }), { code: "ArrowUp", key: "ArrowUp" });
    expect(player).toHaveAttribute("transform", "translate(168 240)");
    fireEvent.keyDown(document.body, { code: "ArrowUp", key: "ArrowUp" });
    expect(player).toHaveAttribute("transform", "translate(168 216)");
  }, 15_000);

  it("plays a Color Clash card and persists the resulting match", async () => {
    let initial = createColorClash("local", 2, "normal", true, 1);
    for (let seed = 1; seed <= 100; seed += 1) {
      const candidate = createColorClash("local", 2, "normal", true, seed);
      if (getPlayableClashCards(candidate).some((card) => card.type !== "wild")) {
        initial = candidate;
        break;
      }
    }
    await db.arcadeData.put({ id: "color-clash:session", value: JSON.stringify(initial), updatedAt: Date.now() });
    window.location.hash = "#/";
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    expect(await screen.findByRole("heading", { name: "Minigames" })).toBeInTheDocument();
    const gameCard = screen.getByRole("heading", { name: "Color Clash" }).closest("article");
    expect(gameCard).not.toBeNull();
    await user.click(within(gameCard!).getByRole("button", { name: "Play" }));
    await user.click(await screen.findByRole("button", { name: "Show my hand" }));
    expect(await screen.findByRole("group", { name: "Your hand" })).toBeInTheDocument();
    const selectedCard = getPlayableClashCards(initial).find((card) => card.type !== "wild");
    expect(selectedCard).toBeDefined();
    const selectedIndex = initial.players[0].hand.findIndex((card) => card.id === selectedCard!.id);
    const playableCard = document.querySelectorAll<HTMLButtonElement>(".phase6d-clash__hand button")[selectedIndex];
    expect(playableCard).not.toBeNull();
    await user.click(playableCard!);

    await waitFor(async () => {
      const saved = await db.arcadeData.get("color-clash:session");
      expect(saved).toBeDefined();
      const persisted = JSON.parse(saved!.value) as ReturnType<typeof createColorClash>;
      expect(persisted.history).toHaveLength(initial.history.length + 1);
      expect(persisted.discardPile.at(-1)?.id).not.toBe(initial.discardPile.at(-1)?.id);
    });
  });

  it("solves a mirror puzzle and persists the unlocked laser level", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" }, { timeout: 5000 });
    await user.click(within((await screen.findByRole("heading", { name: "Laser Mirrors" }, { timeout: 5000 })).closest("article")!).getByRole("button", { name: "Play" }));
    expect(await screen.findAllByRole("gridcell", { name: /Mirror at row/ })).not.toHaveLength(0);
    for (let move = 0; move < 12; move += 1) {
      const nextPuzzle = screen.queryByRole("button", { name: "Next puzzle" });
      if (nextPuzzle) break;
      await user.click(screen.getByRole("button", { name: "Hint" }));
      await user.click(await screen.findByRole("gridcell", { name: /Hint: rotate row/ }));
    }
    expect(await screen.findByRole("button", { name: "Next puzzle" })).toBeInTheDocument();
    await waitFor(async () => expect(await db.arcadeData.get("save:game:laser-mirrors")).toMatchObject({ value: "2" }));
    expect(await db.arcadeData.get("best:laser-mirrors")).toMatchObject({ value: "1" });
  });

  it("updates all game thumbnails with the current custom theme accent", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    const grid = document.querySelector<HTMLElement>(".arcade-game-grid")!;
    useUiStore.getState().updateAppearance({ ...defaultAppearance, accent: "#12AB34" });
    await waitFor(() => expect(grid.style.getPropertyValue("--game-accent")).toBe("#12AB34"));
    expect(document.querySelectorAll('[data-game-thumbnail] [fill*="var(--game-accent)"]').length).toBeGreaterThan(0);
  });

  it("preserves the existing recently played list when a game route loads", async () => {
    await db.arcadeData.add({ id: "recent", value: '["snake","memory"]', updatedAt: 1 });
    window.location.hash = "#/minigames/2048";
    render(<App />);

    expect(await screen.findByRole("grid", { name: "2048 game board" })).toBeInTheDocument();
    await waitFor(async () => expect((await db.arcadeData.get("recent"))?.value).toBe('["2048","snake","memory"]'));
  });

  it("launches Block Stack and saves its resumable game state locally", async () => {
    window.location.hash = "#/minigames/block-stack";
    render(<App />);

    expect(await screen.findByRole("grid", { name: "Block Stack board" })).toBeInTheDocument();
    await waitFor(async () => {
      const saved = await db.arcadeData.get("save:game:block-stack");
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!.value)).toMatchObject({ board: expect.any(Array), piece: expect.any(Object) });
    });
  });

  it("launches Minesweeper with a safe first reveal", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/minigames/minesweeper";
    render(<App />);

    const board = await screen.findByRole("grid", { name: "Minesweeper board" });
    const firstCell = within(board).getAllByRole("button")[40];
    await user.click(firstCell);
    await waitFor(() => expect(firstCell.getAttribute("aria-label")).toContain("Revealed cell"));
    expect(firstCell.getAttribute("aria-label")).not.toContain("Mine");
  });

  it("launches Pong and persists the selected local multiplayer mode", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    window.location.hash = "#/minigames/pong";
    render(<App />);

    await screen.findByRole("heading", { name: "Pong" });
    const canvas = await waitFor(() => {
      const rendered = document.querySelector(".phase5-pong__canvas");
      expect(rendered).not.toBeNull();
      return rendered as HTMLCanvasElement;
    });
    expect(canvas.tagName).toBe("CANVAS");
    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "local");
    await waitFor(async () => expect((await db.arcadeData.get("preference:pong:mode"))?.value).toBe("local"));
  });

  it("launches Sudoku and persists a new puzzle and entered value", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/minigames/sudoku";
    render(<App />);

    const board = await screen.findByRole("grid", { name: "Sudoku board" });
    const emptyCell = board.querySelector<HTMLButtonElement>(".phase5-sudoku__cell:not(.is-given)");
    expect(emptyCell).not.toBeNull();
    await user.click(emptyCell!);
    await user.click(within(screen.getByRole("group", { name: "Sudoku numbers" })).getByRole("button", { name: "1" }));
    await waitFor(async () => {
      const saved = await db.arcadeData.get("save:game:sudoku");
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!.value)).toMatchObject({ board: expect.any(Array), puzzle: expect.any(Array), solution: expect.any(Array) });
    });
  });

  it("launches Flappy Cube with pointer controls and an accessible playfield", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    window.location.hash = "#/minigames/flappy-cube";
    render(<App />);

    const canvas = await waitFor(() => {
      const rendered = document.querySelector<HTMLCanvasElement>(".phase5b-flappy__canvas");
      expect(rendered).not.toBeNull();
      return rendered as HTMLCanvasElement;
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("status")).toHaveTextContent("Keep clear of the obstacles");
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("status")).toHaveTextContent("Paused");
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByRole("status")).toHaveTextContent("Keep clear of the obstacles");
    await user.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(canvas).toHaveAttribute("aria-label", "Flappy Cube playfield");
  });

  it("plays Connect Four against the computer and persists its local state", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/minigames/connect-four";
    render(<App />);

    const board = await screen.findByRole("grid", { name: "Connect Four game board" });
    await user.click(within(board).getByRole("button", { name: "Drop piece in column 4" }));
    await waitFor(() => expect(board.querySelectorAll(".phase5b-connect__cell.is-player-1")).toHaveLength(1));
    await waitFor(() => expect(board.querySelectorAll(".phase5b-connect__cell.is-player-2")).toHaveLength(1));
    await waitFor(async () => {
      const saved = await db.arcadeData.get("save:game:connect-four");
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!.value).state.board.filter((cell: number) => cell !== 0)).toHaveLength(2);
    });
  });

  it("moves through the generated Maze Escape and persists progress", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/minigames/maze-escape";
    render(<App />);

    const board = await screen.findByRole("grid", { name: "Maze Escape game board" });
    const startIndex = [...board.querySelectorAll(".phase5b-maze__cell")].findIndex((cell) => cell.classList.contains("is-player"));
    for (const label of ["Move up", "Move right", "Move down", "Move left"]) {
      await user.click(screen.getByRole("button", { name: label }));
      const nextIndex = [...board.querySelectorAll(".phase5b-maze__cell")].findIndex((cell) => cell.classList.contains("is-player"));
      if (nextIndex !== startIndex) break;
    }
    await waitFor(async () => {
      const saved = await db.arcadeData.get("save:game:maze-escape");
      expect(saved).toBeDefined();
      expect(JSON.parse(saved!.value).maze.moves).toBeGreaterThan(0);
    });
    expect(board.querySelectorAll(".phase5b-maze__cell")).toHaveLength(120);
  });

  it("calculates expressions and saves reusable history locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Calculator" }));
    expect(await screen.findByRole("heading", { name: "Calculator" })).toBeInTheDocument();
    const expression = screen.getByRole("textbox", { name: "Expression" });
    await user.type(expression, "(2 + 3) * 4");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.querySelector(".calculator-result strong")).toHaveTextContent("20"));
    await waitFor(async () => {
      const stored = await db.arcadeData.get("calculator:history");
      expect(JSON.parse(stored!.value)).toMatchObject([{ expression: "(2 + 3) * 4", result: 20 }]);
    });

    await user.click(screen.getByRole("button", { name: "Scientific" }));
    await user.clear(expression);
    await user.type(expression, "sin(90)");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.querySelector(".calculator-result strong")).toHaveTextContent("1"));
  });

  it("persists the Arcade mute and master-volume controls locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });

    const mute = await screen.findByRole("button", { name: "Mute arcade sounds" });
    await user.click(mute);
    await waitFor(async () => expect(await db.arcadeData.get("preference:audio")).toMatchObject({
      value: JSON.stringify({ muted: true, volume: 0.2, mutedGames: [] }),
    }));

    fireEvent.change(screen.getByRole("slider", { name: "Arcade sound volume" }), { target: { value: "0.35" } });
    await waitFor(async () => expect(await db.arcadeData.get("preference:audio")).toMatchObject({
      value: JSON.stringify({ muted: true, volume: 0.35, mutedGames: [] }),
    }));
  });

  it("plays a Simon round with keyboard-accessible pads and persists its best", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    await user.click(within(screen.getByRole("heading", { name: "Simon Says" }).closest("article")!).getByRole("button", { name: "Play" }));
    await user.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText("Your turn.", {}, { timeout: 5000 });
    await user.keyboard("1");
    expect(await screen.findByText("Round 1 complete.")).toBeInTheDocument();
    await waitFor(async () => expect(await db.arcadeData.get("best:simon-says")).toMatchObject({ value: "1" }));
    random.mockRestore();
  });

  it("saves and reloads Line Rider tracks in the isolated Arcade store", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    await user.click(within(screen.getByRole("heading", { name: "Line Rider" }).closest("article")!).getByRole("button", { name: "Play" }));
    await user.type(screen.getByRole("textbox", { name: "Track name" }), "Practice loop");
    await user.click(screen.getByRole("button", { name: "Save track" }));
    await waitFor(async () => expect((await db.arcadeData.where("id").startsWith("track:line-rider:").toArray()).length).toBe(1));
    const chooser = screen.getByRole("combobox", { name: "Saved tracks" });
    await user.selectOptions(chooser, (await db.arcadeData.where("id").startsWith("track:line-rider:").first())!.id);
    expect(screen.getByRole("textbox", { name: "Track name" })).toHaveValue("Practice loop");
  });

  it("buys an Idle Clicker automation upgrade and stores its state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    await user.click(within(screen.getByRole("heading", { name: "Idle Clicker" }).closest("article")!).getByRole("button", { name: "Play" }));
    const collect = await screen.findByRole("button", { name: "Collect" });
    await waitFor(() => expect(collect).toBeEnabled());
    for (let index = 0; index < 30; index += 1) fireEvent.click(collect);
    const automation = screen.getByRole("heading", { name: "Automation" }).closest("article")!;
    await user.click(within(automation).getByRole("button", { name: "30 Buy" }));
    await waitFor(async () => {
      const record = await db.arcadeData.get("save:idle-clicker");
      expect(JSON.parse(record!.value)).toMatchObject({ autoLevel: 1 });
    });
  });

  it("plays a legal chess move locally, saves the game, and supports undo", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    await user.click(within(screen.getByRole("heading", { name: "Chess" }).closest("article")!).getByRole("button", { name: "Play" }));
    const board = await screen.findByRole("grid", { name: "Chess game" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Mode" }), "local");
    await user.click(within(board).getByRole("gridcell", { name: /White pawn e2/ }));
    await user.click(within(board).getByRole("gridcell", { name: /e4$/ }));
    expect(await screen.findByText("e4")).toBeInTheDocument();
    await waitFor(async () => expect(await db.arcadeData.get("chess:unfinished")).toBeDefined());
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("e4")).not.toBeInTheDocument();
  });

  it("loads Word Guess with local dictionary modes and isolated statistics", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    expect(await screen.findByRole("heading", { name: "Word Guess" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("heading", { name: "Word Guess" }).closest("article")!).getByRole("button", { name: "Play" }));

    await screen.findByRole("grid", { name: "Word Guess board" });
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getAllByRole("gridcell")).toHaveLength(30);
    const wordLength = screen.getByRole("combobox", { name: "Word length" });
    await waitFor(() => expect(wordLength).toBeEnabled());
    await user.selectOptions(wordLength, "6");
    await waitFor(async () => expect(await db.arcadeData.get("preference:word-guess:length")).toMatchObject({ value: "6" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(screen.getByRole("gridcell", { name: "b" })).toBeInTheDocument());
    act(() => useUiStore.getState().setAppearance("accent", "#347ab4"));
    expect(document.querySelector(".arcade-game-area")).toHaveStyle({ "--game-accent": "#347ab4" });
    expect(screen.getByRole("gridcell", { name: "b" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "de");
    expect(await screen.findByRole("button", { name: "ß" })).toBeInTheDocument();
    expect(await db.arcadeData.get("stats:word-guess")).toBeUndefined();
  });

  it("rejects a word that is not in the selected offline dictionary", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    await user.click(within(screen.getByRole("heading", { name: "Word Guess" }).closest("article")!).getByRole("button", { name: "Play" }));
    await screen.findByRole("grid", { name: "Word Guess board" });
    await waitFor(() => expect(screen.getByRole("button", { name: "A" })).toBeEnabled());

    await user.keyboard("QZVTX{Enter}");
    expect(await screen.findByText("That word is not in the local dictionary.")).toBeInTheDocument();
    expect(await db.arcadeData.get("stats:word-guess")).toBeUndefined();
  });

  it("persists Word Guess round results and personal wins locally", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Minigames" }));
    await user.click(within(screen.getByRole("heading", { name: "Word Guess" }).closest("article")!).getByRole("button", { name: "Play" }));
    await screen.findByRole("grid", { name: "Word Guess board" });

    for (const letter of ["T", "H", "E", "R", "E"]) await user.click(screen.getByRole("button", { name: new RegExp(`^${letter}$`) }));
    await user.click(screen.getByRole("button", { name: /^Enter$/ }));

    expect(await screen.findByText("Correct — THERE")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await db.arcadeData.get("stats:word-guess")).toMatchObject({ value: JSON.stringify({ wins: 1, losses: 0, streak: 1, bestStreak: 1 }) });
      expect(await db.arcadeData.get("best:word-guess")).toMatchObject({ value: "1" });
    });
    random.mockRestore();
  });

  it("provides playable controls for every Phase 1 game", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    await user.click(navigation.getByRole("link", { name: "Minigames" }));
    await screen.findByRole("heading", { name: "Minigames" });
    const launch = async (name: string) => {
      const card = screen.getByRole("heading", { name }).closest("article");
      await user.click(within(card!).getByRole("button", { name: "Play" }));
    };
    const back = async () => user.click(screen.getByRole("button", { name: "Back" }));

    await launch("2048");
    expect(await screen.findByRole("grid", { name: "2048 game board" })).toBeInTheDocument();
    await back();

    await launch("Snake");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await back();

    await launch("Memory");
    const memorySize = screen.getByRole("combobox", { name: "Board size" });
    await waitFor(() => expect(memorySize).toBeEnabled());
    await user.selectOptions(memorySize, "8");
    expect(await db.arcadeData.get("preference:memory")).toMatchObject({ value: "8" });
    const hiddenCards = screen.getAllByRole("button", { name: "Hidden card" });
    await user.click(hiddenCards[0]);
    await user.click(hiddenCards[1]);
    await waitFor(() => expect(screen.getByText(/Moves:/).textContent).toContain("1"));
    await back();
    await launch("Memory");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Hidden card" })).toHaveLength(16));
    await back();

    await launch("Reaction test");
    await user.click(screen.getByRole("button", { name: "Tap to start" }));
    expect(screen.getByRole("button", { name: /Wait for green/ })).toBeInTheDocument();
    await back();

    await launch("Sliding puzzle");
    const puzzleSize = screen.getByRole("combobox", { name: "Board size" });
    await waitFor(() => expect(puzzleSize).toBeEnabled());
    await user.selectOptions(puzzleSize, "4");
    expect(await db.arcadeData.get("preference:sliding")).toMatchObject({ value: "4" });
    await user.click(document.querySelector(".sliding-tile:not(:disabled)") as HTMLButtonElement);
    expect(screen.getByText(/Moves:/).textContent).toContain("1");
  }, 15_000);

  it("adds a subject and a lesson to the editable timetable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));

    await user.type(screen.getAllByRole("textbox", { name: "Name" })[0], "Algebra");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    const subject = await db.subjects.toCollection().first();
    expect(subject?.name).toBe("Algebra");

    await user.type(screen.getAllByRole("textbox", { name: "Name" })[1], "Ms Local");
    await user.click(screen.getByRole("checkbox", { name: "Algebra" }));
    await user.click(screen.getByRole("button", { name: "Add teacher" }));
    const teacher = await db.teachers.toCollection().first();
    expect(teacher).toMatchObject({ name: "Ms Local", subjectIds: [subject!.id] });
    await db.subjects.update(subject!.id, { defaultTeacherId: teacher!.id, defaultRoom: "B204" });

    await user.click(screen.getAllByRole("button", { name: "Add lesson" })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), subject!.id);
    expect(screen.getByRole("combobox", { name: "Teacher" })).toHaveValue(teacher!.id);
    expect(screen.getByRole("textbox", { name: "Room" })).toHaveValue("B204");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await db.timetable.count()).toBe(1);
    expect(await db.timetable.toCollection().first()).toMatchObject({
      weekday: 0,
      subjectId: subject!.id,
      period: 0,
      start: "08:15",
      end: "08:45",
      weekType: "all",
      inheritTeacher: true,
      inheritRoom: true,
      inheritColor: true,
    });
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Duplicate Algebra" }));
    await user.selectOptions(screen.getByLabelText("Lesson"), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.timetable.count()).toBe(2);
    expect(await db.timetable.where("weekday").equals(0).toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ period: 1, start: "08:45", end: "09:25" })]),
    );

    await user.click(screen.getByRole("button", { name: "Delete Ms Local" }));
    expect(screen.getByText("This teacher is assigned to a subject or lesson. Remove those assignments first.")).toBeInTheDocument();
    expect(await db.teachers.get(teacher!.id)).toBeDefined();
  }, 15_000);

  it("creates a teacher and drops subjects into numbered periods around configurable breaks", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));
    expect(screen.queryByLabelText("Subject notes")).not.toBeInTheDocument();
    await user.type(screen.getAllByRole("textbox", { name: "Name" })[0], "Biology");
    await user.click(screen.getByRole("button", { name: "Add subject" }));
    const subject = await db.subjects.toCollection().first();
    expect(subject).toBeDefined();

    await user.click(screen.getAllByRole("button", { name: "Add lesson" })[0]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), subject!.id);
    await user.click(screen.getByRole("button", { name: "Create teacher" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add lesson" }));
    await user.type(dialog.getByRole("textbox", { name: "Teacher name" }), "Dr Local");
    await user.click(dialog.getByRole("button", { name: "Add teacher" }));
    const teacher = await db.teachers.toCollection().first();
    expect(teacher).toMatchObject({ name: "Dr Local", subjectIds: [subject!.id] });
    await user.click(dialog.getByRole("button", { name: "Save" }));
    expect(await db.timetable.toCollection().first()).toMatchObject({
      subjectId: subject!.id,
      teacherId: teacher!.id,
      inheritTeacher: false,
    });

    await user.click(screen.getByRole("button", { name: "Edit timetable" }));
    const palette = document.querySelector(".timetable-editor");
    const timetableGrid = document.querySelector(".timetable-grid");
    expect(document.querySelector(".manage-panel")!.compareDocumentPosition(palette!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(palette?.nextElementSibling).toBe(timetableGrid);
    await user.click(screen.getByRole("button", { name: "Week A" }));
    await user.selectOptions(screen.getByLabelText("Lesson 0 duration"), "30");
    await user.selectOptions(screen.getByLabelText("Break after"), "1");
    await user.selectOptions(screen.getByLabelText("Break length"), "20");
    await user.click(screen.getByRole("button", { name: "Add break" }));
    expect(await screen.findAllByText("Break after lesson 0 · 20 min")).toHaveLength(2);

    const paletteSubject = within(document.querySelector(".timetable-editor__palette") as HTMLElement).getByRole("button", { name: "Biology" });
    const secondPeriodMonday = document.querySelectorAll(".timetable-grid__row")[1].querySelector(".timetable-grid__slot") as HTMLElement;
    let payload = "";
    const dataTransfer = {
      setData: (_format: string, value: string) => { payload = value; },
      getData: () => payload,
    };
    fireEvent.dragStart(paletteSubject, { dataTransfer });
    fireEvent.drop(secondPeriodMonday, { dataTransfer });
    await waitFor(async () => expect(await db.timetable.count()).toBe(2));
    expect(await db.timetable.where("weekday").equals(0).toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ subjectId: subject!.id, period: 1, start: "09:05", end: "09:45", weekType: "A" })]),
    );
    expect(await db.timetable.toCollection().toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ period: 0, start: "08:15", end: "08:45" })]),
    );
  }, 15_000);

  it("creates a subject and lesson from the new lesson flow when the timetable is empty", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    const addLesson = (await screen.findAllByRole("button", { name: "Add lesson" }))[0];
    expect(addLesson).toBeEnabled();
    await user.click(addLesson);
    const dialog = within(screen.getByRole("dialog", { name: "Add lesson" }));
    await user.click(dialog.getByRole("button", { name: "Create teacher" }));
    await user.type(dialog.getByRole("textbox", { name: "Teacher name" }), "Ms First");
    await user.click(dialog.getByRole("button", { name: "Add teacher" }));
    const teacher = await db.teachers.toCollection().first();
    expect(teacher).toMatchObject({ name: "Ms First", subjectIds: [] });
    await user.type(dialog.getByRole("textbox", { name: "Subject name" }), "Chemistry");
    await user.click(dialog.getByRole("button", { name: "Add subject" }));
    await waitFor(async () => expect(await db.subjects.count()).toBe(1));
    await user.click(dialog.getByRole("button", { name: "Save" }));

    expect(await db.timetable.count()).toBe(1);
    expect(await db.timetable.toCollection().first()).toMatchObject({
      kind: "lesson",
      subjectId: (await db.subjects.toCollection().first())!.id,
      teacherId: teacher!.id,
      period: 0,
      start: "08:15",
      end: "08:45",
    });
  });

  it("switches language immediately and applies theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    const navNames = navigation.getAllByRole("link").map((link) => link.textContent);
    expect(navNames.indexOf("Assistant")).toBe(navNames.indexOf("Timetable") + 1);
    expect(navNames).not.toContain("Kxno Solve");
    expect(navNames).toContain("Workspace");
    expect(navNames).not.toContain("Tasks");
    expect(navNames).not.toContain("Notes");
    expect(navNames).toContain("Docs");

    await user.click(screen.getByRole("link", { name: "Settings" }));

    const languageSelect = await screen.findByRole(
      "combobox",
      { name: "Language" },
      { timeout: 5000 },
    );
    const homeTypographySelect = await screen.findByRole(
      "combobox",
      { name: "Typography" },
      { timeout: 5000 },
    );
    await user.selectOptions(homeTypographySelect, "pixel");
    expect(useUiStore.getState().homeTypography).toBe("pixel");
    expect(useUiStore.getState().homeDemoData).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Use sample data on Home" }));
    expect(useUiStore.getState().homeTypography).toBe("pixel");
    expect(useUiStore.getState().homeDemoData).toBe(true);

    await user.selectOptions(languageSelect, "de");
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stundenplan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assistent" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("de");

    await user.click(screen.getByRole("button", { name: "Hell" }));
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");

    await user.selectOptions(screen.getByRole("combobox", { name: "Hintergrundstil" }), "grid");
    expect(document.querySelector(".background-layer--grid")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Sprache" }), "en");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Timetable" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("applies hue slider color changes after dragging instead of on every slider update", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const slider = await screen.findByRole("slider", { name: "Accent hue" });

    fireEvent.change(slider, { target: { value: "120" } });
    expect(useUiStore.getState().appearance.accent).toBe(defaultAppearance.accent);
    const previewColor = (screen.getByRole("textbox", { name: "Accent HEX" }) as HTMLInputElement).value;
    expect(previewColor).not.toBe(defaultAppearance.accent);

    fireEvent.pointerUp(slider);
    expect(useUiStore.getState().appearance.accent).toBe(previewColor);
  });

  it("applies the brightness slider to the selected theme color", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const slider = await screen.findByRole("slider", { name: "Accent Brightness" });
    fireEvent.change(slider, { target: { value: "25" } });
    const previewColor = (screen.getByRole("textbox", { name: "Accent HEX" }) as HTMLInputElement).value;
    expect(previewColor).not.toBe(defaultAppearance.accent);
    fireEvent.pointerUp(slider);
    expect(useUiStore.getState().appearance.accent).toBe(previewColor);
  });

  it("always exposes the local assistant without enabling cloud settings", async () => {
    const user = userEvent.setup();
    await db.aiPresets.add({
      id: "existing-custom",
      name: "My preset",
      assistantName: "Local",
      description: "",
      style: "",
      length: "short",
      depth: "basic",
      language: "auto",
      instructions: "",
      model: "openrouter/free",
      isDefault: true,
    });

    render(<App />);

    const link = await screen.findByRole("link", { name: "Assistant" });
    await user.click(link);
    expect(await screen.findByRole("heading", { name: "Assistant" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await db.settings.get("aiCloudEnabled")).toBeUndefined();
    await waitFor(async () => {
      expect(await db.aiPresets.get("kxno-school-helper")).toMatchObject({
        name: "Kxno's School Helper",
        length: "short",
        isDefault: false,
      });
      expect(await db.aiPresets.get("kxno-personal-helper")).toMatchObject({
        name: "Kxno's Personal Helper",
        length: "short",
        isDefault: false,
      });
    });
    expect(await db.aiPresets.get("existing-custom")).toBeDefined();
  });

  it("can collapse and restore the assistant conversation history", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));

    const history = await screen.findByRole("complementary", { name: "History" });
    expect(screen.queryByText("Cloud AI off")).not.toBeInTheDocument();
    const collapseButton = await screen.findByRole("button", { name: "Hide history" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton).toHaveAttribute("aria-controls", "assistant-history");

    await user.click(collapseButton);
    expect(screen.getByRole("button", { name: "Show history" })).toHaveAttribute("aria-expanded", "false");
    expect(history).not.toBeVisible();
    expect(document.querySelector(".assistant-workspace")).toHaveClass("assistant-workspace--history-collapsed");

    await user.click(screen.getByRole("button", { name: "Show history" }));
    expect(screen.getByRole("complementary", { name: "History" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide history" })).toHaveAttribute("aria-expanded", "true");
  });

  it("uses the authorized PDF pipeline and lets the user review and export a solved copy", async () => {
    const user = userEvent.setup();
    const endpoint = "https://school-ai.example";
    await db.settings.bulkPut([
      { key: "aiBackendUrl", value: endpoint },
      { key: "aiCloudEnabled", value: "true" },
      { key: "aiCloudConsentEndpoint", value: endpoint },
      { key: "turnstileSiteKey", value: "test-site-key" },
    ]);
    const send = vi.spyOn(assistantClient, "send").mockImplementation(async (request, options) => {
      options.onToken(JSON.stringify({
        detectedQuestions: [{ id: "3", label: "3", question: "3 + 4", page: 1 }],
        answers: [{
          questionId: "3",
          answer: "7",
          page: 1,
          placement: { x: 0.2, y: 0.3, width: 0.25, height: 0.06, confidence: 0.99 },
        }],
        unanswered: [],
      }));
      options.onProviderRequest?.();
      expect(request.endpoint).toBe(endpoint);
    });
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    const pdf = new File([await document.save()], "worksheet.pdf", { type: "application/pdf" });

    render(<App />);
    window.location.hash = "#/solve";
    expect(await screen.findByRole("heading", { name: "Kxno Solve" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [pdf] } });

    expect(await screen.findByText("worksheet.pdf · 1 page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analyze worksheet" }));
    expect(await screen.findByRole("textbox", { name: "Answer" })).toHaveValue("7");
    expect(await screen.findByText("OpenRouter requests this generation: 1")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint,
        model: "openrouter/free",
        message: expect.stringContaining('"detectedQuestions"'),
        history: [],
        attachments: [expect.objectContaining({ name: "worksheet.pdf", mimeType: "application/pdf" })],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await user.clear(screen.getByRole("textbox", { name: /Exercise:/ }));
    await user.type(screen.getByRole("textbox", { name: /Exercise:/ }), "3 plus 4");
    await user.click(screen.getByRole("button", { name: "Create solved PDF" }));
    expect(await screen.findByTitle("Solved PDF preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download solved copy" })).toBeInTheDocument();
  });

  it("saves the interface scale and selected federal state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    fireEvent.change(screen.getByRole("slider", { name: "Interface scale" }), { target: { value: "1.3" } });
    await user.click(screen.getByRole("button", { name: /Arctic/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Federal state" }), "NW");

    expect(document.querySelector(".app-frame")).toHaveStyle({ "--ui-scale": "1.3" });
    expect((await db.settings.get("schoolState"))?.value).toBe("NW");
  });

  it("saves a custom school start time and uses it for new lessons", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const schoolStart = await screen.findByLabelText("School start time");
    fireEvent.change(schoolStart, { target: { value: "07:30" } });
    await waitFor(async () => expect(await db.settings.get("schoolStartTime")).toMatchObject({ value: "07:30" }));

    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await user.click((await screen.findAllByRole("button", { name: "Add lesson" }))[0]);
    expect(screen.getByLabelText("Lesson")).toHaveValue("0");
    expect(screen.queryByLabelText("Starts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ends")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lesson 0 · 07:30–08:00" })).toBeInTheDocument();
  });

  it("allows disabling optional lessons 7 and 8 in settings without hiding occupied lessons", async () => {
    await db.timetable.put({
      id: "late-lesson",
      weekday: 0,
      period: 7,
      start: "14:00",
      end: "14:45",
      weekType: "all",
      kind: "free",
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const lessonSeven = await screen.findByRole("checkbox", { name: "Lesson 7" });
    await user.click(lessonSeven);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("Move or remove lessons in this period before disabling it."))).toBe(true);
    expect(lessonSeven).toBeChecked();
    expect(await db.settings.get("lessonGrid")).toBeUndefined();

    await db.timetable.delete("late-lesson");
    await user.click(lessonSeven);
    await waitFor(async () => {
      const setting = await db.settings.get("lessonGrid");
      expect(setting).toBeDefined();
      expect(JSON.parse(setting!.value).enabledPeriods[7]).toBe(false);
    });

    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await waitFor(() => expect(document.querySelectorAll(".timetable-grid__row")).toHaveLength(8));
  });

  it("loads the selected state's school holidays into the calendar agenda", async () => {
    await db.settings.put({ key: "schoolState", value: "NW" });
    const today = localDateKey(new Date());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const isSchoolHolidayRequest = String(input).includes("SchoolHolidays");
      return Promise.resolve(new Response(JSON.stringify(isSchoolHolidayRequest ? [{
        id: "school-break",
        name: [{ language: "EN", text: "Autumn break" }],
        startDate: today,
        endDate: today,
        nationwide: false,
        subdivisions: [{ code: "DE-NW" }],
      }] : [])));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Calendar" }));

    expect(await within(await screen.findByRole("complementary", { name: "Agenda" })).findByText("Autumn break")).toBeInTheDocument();
    expect(await within(await screen.findByRole("complementary", { name: "Agenda" })).findByText("School holiday")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses saved holidays offline and refreshes them after reconnecting", async () => {
    const date = localDateKey(new Date());
    const year = date.slice(0, 4);
    const cacheKey = `regionalCalendar:NW:${year}:en`;
    await db.settings.bulkPut([
      { key: "schoolState", value: "NW" },
      {
        key: cacheKey,
        value: JSON.stringify([{
          id: "school-saved",
          name: "Saved autumn break",
          startDate: date,
          endDate: date,
          type: "school",
        }]),
      },
    ]);
    const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(
      String(input).includes("SchoolHolidays") ? [{
        id: "school-current",
        name: [{ language: "EN", text: "Updated autumn break" }],
        startDate: date,
        endDate: date,
        nationwide: false,
        subdivisions: [{ code: "DE-NW" }],
      }] : [],
    ))));
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<App />);
      const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
      await userEvent.setup().click(navigation.getByRole("link", { name: "Calendar" }));
      expect(await within(await screen.findByRole("complementary", { name: "Agenda" })).findByText("Saved autumn break")).toBeInTheDocument();
      expect(screen.getByText(/Offline · showing saved holiday data/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
      expect(await within(await screen.findByRole("complementary", { name: "Agenda" })).findByText("Updated autumn break")).toBeInTheDocument();
      await waitFor(async () => {
        const saved = await db.settings.get(cacheKey);
        expect(JSON.parse(saved!.value)).toMatchObject({
          version: 1,
          dates: [expect.objectContaining({ name: "Updated autumn break", type: "school" })],
        });
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (onlineDescriptor) Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
      else Reflect.deleteProperty(window.navigator, "onLine");
    }
  });

  it("keeps local calendar events usable offline without cached regional data", async () => {
    const date = localDateKey(new Date());
    await db.settings.put({ key: "schoolState", value: "NW" });
    await db.calendarEvents.add({
      id: "offline-event",
      type: "event",
      title: "Local study session",
      description: "",
      startAt: new Date(`${date}T09:00:00`).toISOString(),
      endAt: new Date(`${date}T10:00:00`).toISOString(),
      allDay: false,
      color: "#347ab4",
      createdAt: 1,
      updatedAt: 1,
    });
    const onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(<App />);
      await userEvent.setup().click(
        within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Calendar" }),
      );
      expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
      expect(await within(await screen.findByRole("complementary", { name: "Agenda" })).findByText("Local study session")).toBeInTheDocument();
      expect(await screen.findByText(/holiday data is unavailable/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (onlineDescriptor) Object.defineProperty(window.navigator, "onLine", onlineDescriptor);
      else Reflect.deleteProperty(window.navigator, "onLine");
    }
  });

  it("persists settings and school records locally", async () => {
    useUiStore.getState().setAppearance("accent", "#347ab4");
    await db.subjects.put({ id: "persisted-subject", name: "Local subject", color: "#228855" });

    expect(JSON.parse(localStorage.getItem("kxnodesk-ui") ?? "{}").state.appearance.accent).toBe("#347ab4");
    expect(await db.subjects.get("persisted-subject")).toMatchObject({ name: "Local subject" });
  });

  it("configures and tests the protected AI worker from Settings", async () => {
    const testConnectionSpy = vi.spyOn(assistantClient, "testConnection").mockResolvedValue();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Settings" }));
    await user.type(screen.getByRole("textbox", { name: "Worker endpoint" }), "https://worker.example.test");
    await user.click(screen.getByRole("button", { name: "Save endpoint" }));
    expect(await screen.findByText("Endpoint saved.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Turnstile site key (public)" }), "0x4AAAAAAAtestsitekey");
    await user.click(screen.getByRole("button", { name: "Save site key" }));
    expect(await screen.findByText("Site key saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Enable optional cloud AI/ }));
    await user.click(screen.getByRole("checkbox", { name: /Allow cloud sharing/ }));
    await user.click(screen.getByRole("button", { name: "Test AI connection" }));

    await waitFor(() => expect(testConnectionSpy).toHaveBeenCalledWith("https://worker.example.test", "test-turnstile-token"));
    expect((await db.settings.get("aiBackendUrl"))?.value).toBe("https://worker.example.test");
    expect((await db.settings.get("aiCloudEnabled"))?.value).toBe("true");
    expect((await db.settings.get("turnstileSiteKey"))?.value).toBe("0x4AAAAAAAtestsitekey");
    expect((await db.settings.get("aiCloudConsentEndpoint"))?.value).toBe("https://worker.example.test");
  }, 15_000);

  it("saves a local profile, applies a theme, and enables a weekend school day", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const displayName = screen.getByRole("textbox", { name: "Display name" });
    expect(displayName).toHaveValue("User");
    await user.clear(displayName);
    await user.type(displayName, "Ari");
    await user.click(screen.getByRole("button", { name: /Arctic/ }));
    await user.click(screen.getByRole("checkbox", { name: "Saturday" }));
    expect((await db.settings.get("profileName"))?.value).toBe("Ari");
    expect((await db.settings.get("selectedTheme"))?.value).toBe("arctic");
    expect(JSON.parse((await db.settings.get("schoolDays"))!.value)[5]).toBe(true);

    await user.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByRole("heading", { name: /^(Good (morning|afternoon|evening), Ari|Working late, Ari)$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    expect(await screen.findByText("Sat")).toBeInTheDocument();
  });

  it("keeps AI messages local and does not call the worker without explicit consent", async () => {
    await db.settings.bulkPut([
      { key: "aiBackendUrl", value: "https://worker.example.test" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "turnstileSiteKey", value: "0x4AAAAAAAtestsitekey" },
    ]);
    const sendSpy = vi.spyOn(assistantClient, "send").mockResolvedValue();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));

    await user.type(await screen.findByRole("textbox", { name: "Message" }), "Explain fractions");
    const worksheet = new File(["%PDF-1.4 worksheet"], "worksheet.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Attach images or PDF", { selector: "input" }), { target: { files: [worksheet] } });
    expect(await screen.findByText("worksheet.pdf")).toBeInTheDocument();
    expect(screen.queryByText("1 KB")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Ask a question…");
    expect(document.querySelector(".assistant-composer__status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(await db.aiMessages.count()).toBe(0);
  });

  it("disables sending when the Worker reports that today's quota is exhausted", async () => {
    await db.settings.bulkPut([
      { key: "aiBackendUrl", value: "https://worker.example.test" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "aiCloudConsentEndpoint", value: "https://worker.example.test" },
      { key: "turnstileSiteKey", value: "0x4AAAAAAAtestsitekey" },
    ]);
    vi.spyOn(assistantClient, "getUsage").mockResolvedValue({ remaining: 0, limit: 50 });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));
    await user.type(await screen.findByRole("textbox", { name: "Message" }), "One more question");
    await screen.findByLabelText("0 requests remaining today");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(await db.aiMessages.count()).toBe(0);
  });

  it("sends authorized assistant messages only through the OpenRouter worker", async () => {
    await db.settings.bulkPut([
      { key: "aiBackendUrl", value: "https://worker.example.test" },
      { key: "aiCloudEnabled", value: "true" },
      { key: "turnstileSiteKey", value: "0x4AAAAAAAtestsitekey" },
      { key: "aiCloudConsentEndpoint", value: "https://worker.example.test" },
    ]);
    let consumedRequests = 0;
    const usageSpy = vi.spyOn(assistantClient, "getUsage").mockImplementation(async () => ({
      remaining: 50 - consumedRequests,
      limit: 50,
    }));
    const sendSpy = vi.spyOn(assistantClient, "send").mockImplementation(async (_request, options) => {
      consumedRequests += 1;
      options.onToken("Cloud answer");
    });
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));
    const composer = await screen.findByRole("textbox", { name: "Message" });
    await user.type(composer, "Explain fractions");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(composer, " please");
    expect(composer).toHaveValue("Explain fractions\n please");
    expect(screen.queryByRole("checkbox", { name: /Allow cloud sharing/ })).not.toBeInTheDocument();
    await screen.findByLabelText("50 requests remaining today");
    await user.click(composer);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(sendSpy).toHaveBeenCalledOnce());
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      endpoint: "https://worker.example.test",
      model: "openrouter/free",
      message: "Explain fractions\n please",
      turnstileToken: "test-turnstile-token",
    });
    expect(await screen.findByText("Cloud answer")).toBeInTheDocument();
    expect((await db.aiMessages.toArray()).find((message) => message.role === "user")).toMatchObject({ content: "Explain fractions\n please" });
    expect(await db.settings.get("aiCloudConsentEndpoint")).toMatchObject({ value: "https://worker.example.test" });
    await waitFor(() => expect(screen.getByLabelText("49 requests remaining today")).toBeInTheDocument());
    expect(usageSpy).toHaveBeenCalled();

    await user.type(composer, "A follow-up question");
    await user.click(composer);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(2));

    view.unmount();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("checkbox", { name: /Allow cloud sharing/ })).toBeChecked();
  });

  it("preserves saved assistant presets while loading the assistant", async () => {
    const savedPreset = {
      id: "study-assistant",
      name: "My saved tutor",
      assistantName: "Tutor",
      description: "My custom instructions",
      style: "Concise",
      length: "short" as const,
      depth: "basic" as const,
      language: "en" as const,
      instructions: "Keep my existing setup.",
      model: "legacy/old-model",
      isDefault: true,
    };
    await db.aiPresets.put(savedPreset);

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));
    await screen.findByRole("combobox", { name: "Preset" });

    await waitFor(async () => expect(await db.aiPresets.get(savedPreset.id)).toEqual({ ...savedPreset, model: "openrouter/free" }));
    expect(await db.aiPresets.count()).toBe(5);
    expect(await db.aiPresets.get("kxno-school-helper")).toBeDefined();
    expect(await db.aiPresets.get("kxno-personal-helper")).toBeDefined();
  });

  it("keeps old assistant messages and attachments available with OpenRouter-only chat", async () => {
    await db.aiPresets.put({
      id: "study-assistant",
      name: "Tutor",
      assistantName: "Tutor",
      description: "",
      style: "",
      length: "medium",
      depth: "guided",
      language: "auto",
      instructions: "",
      model: "openrouter/free",
      isDefault: true,
    });
    await db.aiConversations.put({ id: "old-chat", title: "Old chat", presetId: "study-assistant", updatedAt: Date.now() });
    await db.aiMessages.put({ id: "old-message", conversationId: "old-chat", role: "user", content: "Keep this", createdAt: 1 });
    const document = new Blob(["local attachment"], { type: "application/pdf" });
    await db.aiAttachments.put({
      id: "old-attachment",
      messageId: "old-message",
      name: "worksheet.pdf",
      mimeType: "application/pdf",
      size: document.size,
      blob: document,
      createdAt: 2,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Assistant" }));
    await screen.findByRole("combobox", { name: "Preset" });

    expect(await screen.findByText("Keep this")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /worksheet\.pdf/ })).toBeInTheDocument();
    expect(await db.aiMessages.get("old-message")).toMatchObject({ content: "Keep this" });
    expect(await db.aiAttachments.get("old-attachment")).toMatchObject({
      name: "worksheet.pdf",
      mimeType: "application/pdf",
      size: document.size,
    });
    expect((await db.aiAttachments.get("old-attachment"))?.blob).toBeDefined();
  });

  it("persists a paused timer and stores imported files on this device", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-test-file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Timer" }));
    const duration = await screen.findByRole("spinbutton", { name: "Duration" });
    fireEvent.change(duration, { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "Start timer" }));
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    await user.click(await screen.findByRole("button", { name: "Pause" }));

    const timerSetting = await db.settings.get("focusTimerState");
    expect(JSON.parse(timerSetting!.value)).toMatchObject({
      plannedSeconds: 60,
      runningSince: null,
    });
    expect(JSON.parse(timerSetting!.value).elapsedSeconds).toBeGreaterThanOrEqual(1);

    window.location.hash = "#/files";
    await screen.findByRole("heading", { name: "Files", level: 1 });
    const file = new File(["local reference"], "reference.txt", { type: "text/plain" });
    fireEvent.change(await screen.findByLabelText("Add files"), { target: { files: [file] } });
    await waitFor(async () => expect(await db.files.count()).toBe(1));
    expect(await db.files.toCollection().first()).toMatchObject({ name: "reference.txt", size: file.size });
  });

  it("creates and edits tasks, calendar events, and autosaved notes locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Docs" }));
    await user.click(await screen.findByRole("button", { name: "Tasks" }));
    await screen.findByRole("heading", { name: "Tasks", level: 1 });
    await user.click(screen.getAllByRole("button", { name: "Add task" })[0]);
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Finish worksheet");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Mark Finish worksheet complete" })).toBeInTheDocument();
    expect(await db.tasks.count()).toBe(1);

    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Calendar" }));
    await screen.findByRole("heading", { name: "Calendar", level: 1 });
    await user.click(screen.getAllByRole("button", { name: "Add event" })[0]);
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Biology exam");
    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "exam");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.calendarEvents.toCollection().first()).toMatchObject({ title: "Biology exam", type: "exam" });
    await user.click(await screen.findByRole("button", { name: "Edit Biology exam" }));
    await user.clear(screen.getByRole("textbox", { name: "Title" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Biology exam review");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => expect(await db.calendarEvents.toCollection().first()).toMatchObject({ title: "Biology exam review" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(await screen.findByRole("button", { name: "Delete Biology exam review" }));
    await waitFor(async () => expect(await db.calendarEvents.count()).toBe(0));

    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Docs" }));
    await user.click(await screen.findByRole("button", { name: "Notes" }));
    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    fireEvent.change(await screen.findByRole("textbox", { name: "Note title" }), { target: { value: "Cell structure" } });
    await user.type(screen.getByRole("textbox", { name: "Note content" }), "Mitochondria produce energy.");
    fireEvent.blur(screen.getByRole("textbox", { name: "Note content" }));
    await waitFor(async () => {
      const saved = await db.notes.toCollection().first();
      expect(saved).toMatchObject({ title: "Cell structure", content: "Mitochondria produce energy." });
    });
  }, 15_000);

  it("runs a simple persistent timer and stores imported files on this device", async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-preview");
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Timer" }));
    expect(await screen.findByRole("spinbutton", { name: "Duration" })).toHaveValue(45);
    await user.click(await screen.findByRole("button", { name: "Start timer" }));
    await waitFor(async () => expect((await db.settings.get("focusTimerState"))?.value).toContain('"plannedSeconds":2700'));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await db.settings.get("focusTimerState")).toBeUndefined();

    window.location.hash = "#/files";
    await screen.findByRole("heading", { name: "Files", level: 1 });
    const file = new File(["local reference"], "reference.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Add files"), { target: { files: [file] } });
    await waitFor(async () => expect(await db.files.count()).toBe(1));
    expect(await db.files.toCollection().first()).toMatchObject({ name: "reference.txt", size: file.size });
    expect(await screen.findByRole("heading", { name: "reference.txt" })).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("runs and persists a stopwatch independently from the countdown", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Timer" }));
    await user.click(await screen.findByRole("button", { name: "Stopwatch" }));
    await user.click(screen.getByRole("button", { name: "Start stopwatch" }));
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(async () => {
      const saved = await db.settings.get("stopwatchState");
      expect(JSON.parse(saved!.value)).toMatchObject({ runningSince: null });
      expect(JSON.parse(saved!.value).elapsedMs).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await db.settings.get("stopwatchState")).toBeUndefined();
  });
});
