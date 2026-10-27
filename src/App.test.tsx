import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { db, localDateKey } from "./data/db";
import { i18n } from "./i18n";
import { defaultAppearance, useUiStore } from "./stores/ui-store";
import { assistantClient } from "./data/ai-client";

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
  window.location.hash = "#/";
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
  ]);
  useUiStore.getState().updateAppearance(defaultAppearance);
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

    expect(screen.getByRole("link", { name: "Kxno Desk" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /^(Good (morning|afternoon|evening), User|Working late, User)$/ })).toBeInTheDocument();
    expect(useUiStore.getState().appearance).toMatchObject({
      accent: "#8dbfd0",
      background: "#10161b",
      backgroundStyle: "chrome",
    });
    expect(document.querySelector(".background-layer--chrome")).toBeInTheDocument();
    expect(screen.getByRole("time")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Today’s schedule" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main navigation" })).queryByRole("link", { name: "Files" })).not.toBeInTheDocument();
    expect(screen.getByText("Kxno Desk · Made By Kxno (Shero)")).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole(
        "link",
        { name: "Timetable" },
      ),
    );
    expect(await screen.findByRole("heading", { name: "Timetable" }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("opens the arcade, persists favorites, and launches a playable game screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    await user.click(navigation.getByRole("link", { name: "Minigames" }));

    expect(await screen.findByRole("heading", { name: "Minigames" }, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(24);
    const thumbnails = [...document.querySelectorAll<SVGSVGElement>("[data-game-thumbnail]")];
    expect(thumbnails).toHaveLength(24);
    expect(new Set(thumbnails.map((thumbnail) => thumbnail.dataset.gameThumbnail)).size).toBe(24);
    expect(thumbnails.every((thumbnail) => thumbnail.getAttribute("viewBox") === "0 0 320 82")).toBe(true);
    expect(thumbnails.every((thumbnail) => [...thumbnail.querySelectorAll("[fill], [stroke]")].some((part) =>
      `${part.getAttribute("fill")} ${part.getAttribute("stroke")}`.includes("var(--game-accent)")))).toBe(true);
    expect(screen.getByRole("heading", { name: "Tower Defense" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rhythm Tiles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mini Platformer" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Strategy" }));
    expect(screen.getByRole("heading", { name: "Tower Defense" })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(1);
    await user.click(await screen.findByRole("button", { name: "All games" }));
    await user.click(await screen.findByRole("button", { name: "Precision" }));
    expect(screen.getByRole("heading", { name: "Aim Trainer" })).toBeInTheDocument();
    expect(document.querySelectorAll(".arcade-card")).toHaveLength(1);
    await user.click(await screen.findByRole("button", { name: "All games" }));
    const gameCard = screen.getByRole("heading", { name: "2048" }).closest("article");
    expect(gameCard).not.toBeNull();
    await user.click(within(gameCard!).getByRole("button", { name: "Add favorite 2048" }));
    expect(await db.arcadeData.get("favorites")).toMatchObject({ value: '["2048"]' });

    await user.click(within(screen.getByRole("heading", { name: "2048" }).closest("article")!).getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("heading", { name: "2048" })).toBeInTheDocument();
    expect(await screen.findByRole("grid", { name: "2048 game board" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back/ }));
    await waitFor(async () => expect((await db.arcadeData.get("recent"))?.value).toBe('["2048"]'));
  }, 15_000);

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
    expect(screen.getByRole("grid", { name: "2048 game board" })).toBeInTheDocument();
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
  });

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
      start: "08:00",
      end: "08:45",
      weekType: "all",
      inheritTeacher: true,
      inheritRoom: true,
      inheritColor: true,
    });
    expect(screen.getAllByText("Algebra").length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Duplicate Algebra" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "10:45" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await db.timetable.count()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Delete Ms Local" }));
    expect(screen.getByText("This teacher is assigned to a subject or lesson. Remove those assignments first.")).toBeInTheDocument();
    expect(await db.teachers.get(teacher!.id)).toBeDefined();
  });

  it("creates a teacher from a lesson and snaps palette items to free timetable slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Timetable" }));
    await user.click(await screen.findByRole("button", { name: "Manage" }));
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
    await user.click(screen.getByRole("button", { name: "Week A" }));
    const paletteSubject = within(document.querySelector(".timetable-editor__palette") as HTMLElement).getByRole("button", { name: "Biology" });
    const monday = document.querySelectorAll(".day-column")[0] as HTMLElement;
    let payload = "";
    const dataTransfer = {
      setData: (_format: string, value: string) => { payload = value; },
      getData: () => payload,
    };
    fireEvent.dragStart(paletteSubject, { dataTransfer });
    fireEvent.drop(monday, { dataTransfer });
    await waitFor(async () => expect(await db.timetable.count()).toBe(2));
    expect(await db.timetable.where("weekday").equals(0).toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ subjectId: subject!.id, start: "08:45", end: "09:30", weekType: "A" })]),
    );

    const pause = within(document.querySelector(".timetable-editor__palette") as HTMLElement).getByRole("button", { name: "Pause" });
    fireEvent.dragStart(pause, { dataTransfer });
    fireEvent.drop(monday, { dataTransfer });
    await waitFor(async () => expect(await db.timetable.count()).toBe(3));
    expect(await db.timetable.where("weekday").equals(0).toArray()).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "break", title: "Pause", start: "09:30", end: "10:15" })]),
    );
  });

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
      start: "08:00",
      end: "08:45",
    });
  });

  it("switches language immediately and applies theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    const navNames = navigation.getAllByRole("link").map((link) => link.textContent);
    expect(navNames.indexOf("Assistant")).toBe(navNames.indexOf("Timetable") + 1);
    expect(navNames.indexOf("Tasks")).toBe(navNames.indexOf("Assistant") + 1);
    expect(navNames.indexOf("Timer")).toBe(navNames.indexOf("Notes") - 1);

    await user.click(screen.getByRole("link", { name: "Settings" }));

    await user.selectOptions(await screen.findByRole("combobox", { name: "Language" }), "de");
    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stundenplan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assistent" })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Modus" }), "light");
    expect(document.querySelector(".app-frame")).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("kxnodesk-language")).toBe("de");

    await user.selectOptions(screen.getByRole("combobox", { name: "Hintergrundstil" }), "grid");
    expect(document.querySelector(".background-layer--grid")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Starts")).toHaveValue("07:30");
    expect(screen.getByLabelText("Ends")).toHaveValue("08:15");
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

    expect(await screen.findByText("Autumn break")).toBeInTheDocument();
    expect(screen.getByText("School holiday")).toBeInTheDocument();
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
      expect(await screen.findByText("Saved autumn break")).toBeInTheDocument();
      expect(screen.getByText(/Offline · showing saved holiday data/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
      expect(await screen.findByText("Updated autumn break")).toBeInTheDocument();
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
      expect(await screen.findByText("Local study session")).toBeInTheDocument();
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
  });

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
    await user.click(within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", { name: "Tasks" }));
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

    await user.click(screen.getByRole("link", { name: "Notes" }));
    await user.click((await screen.findAllByRole("button", { name: "New note" }))[0]);
    fireEvent.change(await screen.findByRole("textbox", { name: "Note title" }), { target: { value: "Cell structure" } });
    await user.type(screen.getByRole("textbox", { name: "Note content" }), "Mitochondria produce energy.");
    fireEvent.blur(screen.getByRole("textbox", { name: "Note content" }));
    await waitFor(async () => {
      const saved = await db.notes.toCollection().first();
      expect(saved).toMatchObject({ title: "Cell structure", content: "Mitochondria produce energy." });
    });
  });

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
