import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../data/db";
import { GARDEN_MISSIONS, initializeCodeGarden, saveCodeGardenState } from "../data/code-garden";
import { i18n, i18nReady } from "../i18n";
import { CodeGardenGame } from "./CodeGardenGame";

describe("playable Code Garden", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    localStorage.removeItem("kxnodesk.code-layout.v1.garden");
    await db.open();
    await db.codeGardenState.clear();
  });

  afterEach(async () => {
    cleanup();
    localStorage.removeItem("kxnodesk.code-layout.v1.garden");
    await db.codeGardenState.clear();
  });

  it("accepts command autocomplete, executes a mission, and unlocks the next one", async () => {
    const user = userEvent.setup();
    render(<CodeGardenGame />);
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    await user.type(editor, "mo");
    expect(await screen.findByRole("option", { name: /move\(\).*Move one tile/ })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expect(editor.value).toContain("move()");

    fireEvent.change(editor, { target: { value: 'move("east")\nmove("east")\nharvest()' } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    expect(await screen.findByText("Mission complete: 1/1.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await db.codeGardenState.get("default")).toMatchObject({
      completedMissionIds: ["first-harvest"],
      resources: { plants: 4, seeds: 6, energy: 14 },
      activeRun: { robot: { x: 2, y: 2 }, harvested: 1, completed: true },
    });

    await user.click(await screen.findByRole("button", { name: /Next mission/ }));
    expect(await screen.findByRole("heading", { name: "A row of crops" })).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement).value).toContain("repeat");
  });

  it("pauses and cancels a visible run without changing the saved world", async () => {
    const user = userEvent.setup();
    render(<CodeGardenGame />);
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: Array.from({ length: 16 }, () => "turn(left)").join("\n") } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(screen.getByText("Paused")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset run" }));
    expect(await db.codeGardenState.get("default")).toMatchObject({
      activeRun: { robot: { x: 0, y: 2, direction: "east" }, steps: 0 },
    });
  });

  it("resumes the saved mission and robot position after the view is reopened", async () => {
    const user = userEvent.setup();
    const first = render(<CodeGardenGame />);
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "move(east)" } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect(await db.codeGardenState.get("default")).toMatchObject({
        activeRun: { robot: { x: 1, y: 2 }, steps: 1 },
      });
    }, { timeout: 5000 });
    first.unmount();

    render(<CodeGardenGame />);
    await screen.findByRole("heading", { name: "First harvest" });
    expect((await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement).value).toBe("move(east)");
    expect(await db.codeGardenState.get("default")).toMatchObject({
      activeRun: { robot: { x: 1, y: 2 }, steps: 1 },
      programs: { "first-harvest": "move(east)" },
    });
  });

  it("researches the solar coil, unlocks its mission, and records the completed run", async () => {
    const user = userEvent.setup();
    const initial = await initializeCodeGarden();
    await saveCodeGardenState({
      ...initial,
      activeMissionId: "seed-cycle",
      completedMissionIds: GARDEN_MISSIONS.slice(0, 5).map((mission) => mission.id),
      resources: { ...initial.resources, wood: 3, stone: 2, energy: 20 },
    });
    render(<CodeGardenGame />);

    await user.click(await screen.findByRole("button", { name: "Research · 3 wood + 2 stone" }));
    await user.click(screen.getByRole("button", { name: /Solar relay/ }));
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    expect(editor.value).toContain("wait()");

    await user.click(screen.getByRole("button", { name: "Run program" }));
    expect(await screen.findByText("Mission complete: 4/4.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Best completed run|Run stats/)).toHaveTextContent("9 instructions");
    expect(await db.codeGardenState.get("default")).toMatchObject({
      upgrades: ["solar-coil"],
      completedMissionIds: [...GARDEN_MISSIONS.slice(0, 5).map((mission) => mission.id), "solar-relay"],
      bestResults: {
        "solar-relay": { instructions: 9, harvested: 4, energyConsumed: 4, energyGenerated: 2 },
      },
    });
  });

  it("explains scanner signals and runs the sensor mission against its mixed field", async () => {
    const user = userEvent.setup();
    const initial = await initializeCodeGarden();
    await saveCodeGardenState({
      ...initial,
      activeMissionId: "sensor-sweep",
      completedMissionIds: GARDEN_MISSIONS.slice(0, 6).map((mission) => mission.id),
      upgrades: ["solar-coil", "field-scanner"],
      resources: { ...initial.resources, plants: 20, energy: 12 },
    });
    render(<CodeGardenGame />);

    expect(await screen.findByText("Scanner signals")).toBeInTheDocument();
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: 'repeat(5) { move("east") if (tile_is("ripe")) { harvest() } }' },
    });
    await user.click(screen.getByRole("button", { name: "Run program" }));

    expect(await screen.findByText('Tile scan("ripe") → true', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("Mission complete: 3/3.", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(await db.codeGardenState.get("default")).toMatchObject({
      completedMissionIds: [...GARDEN_MISSIONS.slice(0, 6).map((mission) => mission.id), "sensor-sweep"],
      activeRun: { robot: { x: 5, y: 2 }, harvested: 3, completed: true },
    });
  });

  it("renders inspectable isometric tiles and persists window visibility", async () => {
    const user = userEvent.setup();
    const first = render(<CodeGardenGame />);
    const selected = await screen.findByRole("button", { name: /Tile 3, 3:/ });
    await user.click(selected);
    expect(screen.getByText("Selected tile")).toBeInTheDocument();
    expect(screen.getByText("3, 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Robot program" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("kxnodesk.code-layout.v1.garden") ?? "null") as { windows?: Array<{ id: string; open: boolean }> } | null;
      expect(saved?.windows?.find((window) => window.id === "editor")?.open).toBe(false);
    });
    first.unmount();

    render(<CodeGardenGame />);
    const windowMenu = await screen.findByText("Windows", { selector: "summary" });
    expect(screen.queryByRole("textbox", { name: "Robot program" })).not.toBeInTheDocument();
    await user.click(windowMenu);
    await user.click(screen.getByRole("button", { name: "Robot program" }));
    expect(await screen.findByRole("textbox", { name: "Robot program" })).toBeInTheDocument();
  });
});
