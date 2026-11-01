import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../data/db";
import { createGardenAdventure, expandGarden, GARDEN_MISSIONS, initializeCodeGarden, saveCodeGardenState } from "../data/code-garden";
import { i18n, i18nReady } from "../i18n";
import { CodeGardenGame } from "./CodeGardenGame";

describe("playable Code Garden", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    localStorage.removeItem("kxnodesk.code-layout.v1.garden");
    localStorage.removeItem("kxnodesk.code-layout.v1.garden-adventure");
    await db.open();
    await db.codeGardenState.clear();
  });

  afterEach(async () => {
    cleanup();
    localStorage.removeItem("kxnodesk.code-layout.v1.garden");
    localStorage.removeItem("kxnodesk.code-layout.v1.garden-adventure");
    await db.codeGardenState.clear();
  });

  async function addGardenPanel(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(await screen.findByText("Add", { selector: "summary" }));
    await user.click(screen.getByRole("menuitem", { name }));
  }

  it("accepts command autocomplete, executes a mission, and unlocks the next one", async () => {
    const user = userEvent.setup();
    render(<CodeGardenGame />);
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    await user.type(editor, "mo");
    expect(await screen.findByRole("option", { name: /move\(direction\?\).*Move the robot one tile/ })).toBeInTheDocument();
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

  it("opens a searchable, registry-backed command reference from the editor", async () => {
    const user = userEvent.setup();
    render(<CodeGardenGame />);

    await user.click(await screen.findByRole("button", { name: "Programming reference" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "move(direction?)" })).toBeInTheDocument();
    expect(within(dialog).getByText("north", { selector: "code" })).toBeInTheDocument();
    expect(within(dialog).getByText(/function harvest_row/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    await waitFor(async () => {
      expect(await db.codeGardenState.get("default")).toMatchObject({
        activeRun: { robot: { x: 0, y: 2, direction: "east" }, steps: 0 },
      });
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

    await addGardenPanel(user, "Workshop");
    await addGardenPanel(user, "Resources & run stats");
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

    await addGardenPanel(user, "Mission instructions");
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
    const addMenu = await screen.findByText("Add", { selector: "summary" });
    expect(screen.queryByRole("textbox", { name: "Robot program" })).not.toBeInTheDocument();
    await user.click(addMenu);
    await user.click(screen.getByRole("menuitem", { name: "Robot program" }));
    expect(await screen.findByRole("textbox", { name: "Robot program" })).toBeInTheDocument();
  });

  it("offers every garden panel as an independent workspace widget", async () => {
    const user = userEvent.setup();
    const workspaceBefore = await db.workspace.get("default");
    render(<CodeGardenGame />);

    await screen.findByRole("textbox", { name: "Robot program" });
    await user.click(screen.getByText("Add", { selector: "summary" }));
    const menu = screen.getByRole("menu", { name: "Add" });
    for (const name of [
      "Missions",
      "Mission instructions",
      "Garden world",
      "Robot program",
      "Workshop",
      "Resources & run stats",
      "Run output",
      "Programming reference",
    ]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }

    await user.click(within(menu).getByRole("menuitem", { name: "Mission instructions" }));
    expect(await screen.findByText("Reach the ripe plant and harvest it.")).toBeInTheDocument();
    expect(await db.workspace.get("default")).toEqual(workspaceBefore);
    expect(await db.codeGardenState.get("default")).toMatchObject({ activeMissionId: "first-harvest" });
  });

  it("unlocks the persistent farm after all tutorials and runs planting, watering, harvesting, market, and expansion", async () => {
    const user = userEvent.setup();
    const initial = await initializeCodeGarden();
    const farm = { ...createGardenAdventure(), coins: 200 };
    await saveCodeGardenState({
      ...initial,
      activeMissionId: GARDEN_MISSIONS.at(-1)!.id,
      completedMissionIds: GARDEN_MISSIONS.map((mission) => mission.id),
      adventure: farm,
    });
    const first = render(<CodeGardenGame />);
    await user.click(await screen.findByRole("button", { name: "Open Adventure Farm" }));
    expect(await screen.findByRole("heading", { name: "Your garden" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3 seeds · 30 coins" }));
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure).toMatchObject({
        coins: 170,
        seeds: { carrot: 5 },
      });
    });
    await user.click(screen.getByRole("button", { name: /Rich soil.*60 coins/ }));
    await waitFor(async () => expect((await db.codeGardenState.get("default"))?.adventure?.richSoil).toBe(true));
    await user.click(screen.getByRole("button", { name: /Better watering can.*45 coins/ }));
    await waitFor(async () => expect((await db.codeGardenState.get("default"))?.adventure?.wateringCan).toBe(true));
    await user.click(screen.getByRole("button", { name: /Expand field.*50 coins/ }));
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure).toMatchObject({
        coins: 15,
        width: 8,
        richSoil: true,
        wateringCan: true,
        expansions: 1,
      });
    });

    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "move(east)\nmove(west)" } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect(await db.codeGardenState.get("default")).toMatchObject({
        resources: { energy: 12 },
        adventure: { energy: 38, robot: { x: 0, y: 2 } },
      });
    }, { timeout: 5000 });
    await screen.findByRole("button", { name: "Run program" });

    fireEvent.change(editor, { target: { value: 'plant("carrot")\nwater()' } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect(await db.codeGardenState.get("default")).toMatchObject({
        activeMode: "adventure",
        adventure: {
          seeds: { carrot: 4 },
          plots: expect.arrayContaining([
            expect.objectContaining({ x: 0, y: 2, crop: "carrot", watered: true, growthBonusMs: 67_200 }),
          ]),
        },
        programs: { adventure: 'plant("carrot")\nwater()' },
      });
    }, { timeout: 5000 });
    first.unmount();

    const reopened = render(<CodeGardenGame />);
    expect(await screen.findByRole("heading", { name: "Your garden" })).toBeInTheDocument();
    expect((await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement).value)
      .toBe('plant("carrot")\nwater()');
    let saved = await db.codeGardenState.get("default");
    expect(saved?.adventure?.plots.find((plot) => plot.x === 0 && plot.y === 2)?.watered).toBe(true);

    const matureAt = Date.now() - 300_000;
    await saveCodeGardenState({
      ...saved!,
      adventure: {
        ...saved!.adventure!,
        plots: saved!.adventure!.plots.map((plot) => plot.x === 0 && plot.y === 2 ? { ...plot, plantedAt: matureAt } : plot),
      },
    });
    reopened.unmount();

    const mature = render(<CodeGardenGame />);
    const ripeTile = await screen.findByRole("button", { name: /Tile 1, 3: Carrot, Ready to harvest/ }, { timeout: 5000 });
    expect(ripeTile).toBeInTheDocument();
    const harvestEditor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(harvestEditor, { target: { value: "harvest()" } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure?.harvest.carrot).toBe(1);
    }, { timeout: 5000 });

    expect(await screen.findByRole("button", { name: "Run program" }, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sell harvest" }));
    await waitFor(async () => {
      const current = await db.codeGardenState.get("default");
      expect(current?.adventure).toMatchObject({
        coins: 39,
        harvest: { turnip: 0, carrot: 0, berry: 0 },
      });
    });
    await user.click(screen.getByRole("button", { name: /Tile 8, 5: Tilled soil/ }));
    expect(screen.getByText("8, 5")).toBeInTheDocument();
    expect((await db.codeGardenState.get("default"))?.adventure).toMatchObject({ width: 8, expansions: 1 });
    expect((await db.codeGardenState.get("default"))?.completedMissionIds).toEqual(GARDEN_MISSIONS.map((mission) => mission.id));
    mature.unmount();
  });

  it("launches the Moon expedition, switches worlds, runs lunar farming, and restores the lunar save", async () => {
    const user = userEvent.setup();
    const initial = await initializeCodeGarden();
    const readyFarm = {
      ...createGardenAdventure(),
      coins: 2_000,
      skillLevels: {
        "soil-science": 1,
        "abundant-harvest": 1,
        "seed-diversity": 1,
        "field-survey": 1,
        "robot-blueprints": 1,
      },
      secondRobot: { x: 5, y: 4, direction: "west", energy: 60 },
    };
    const expandedFarm = { ...expandGarden(readyFarm), coins: 300 };
    await saveCodeGardenState({
      ...initial,
      activeMode: "adventure",
      activeMissionId: GARDEN_MISSIONS.at(-1)!.id,
      completedMissionIds: GARDEN_MISSIONS.map((mission) => mission.id),
      adventure: expandedFarm,
    });

    const first = render(<CodeGardenGame />);
    await screen.findByRole("heading", { name: "Your garden" });
    await user.click(screen.getAllByRole("button", { name: /Launch expedition · 250 coins/ })[0]);
    expect(await screen.findByRole("heading", { name: "Moon" })).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure).toMatchObject({
        coins: 50,
        activeWorld: "moon",
        moonFarm: { water: 10, credits: 0 },
      });
    });

    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'plant("mooncap")\nwater()' } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure?.moonFarm).toMatchObject({
        water: 8,
        seeds: { mooncap: 4 },
        plots: expect.arrayContaining([expect.objectContaining({ x: 0, y: 2, crop: "mooncap", watered: true })]),
      });
    }, { timeout: 5000 });
    await screen.findByRole("button", { name: "Run program" });
    await addGardenPanel(user, "Moon Skill Tree");
    expect(await screen.findByRole("heading", { name: "Moon Skill Tree" })).toBeInTheDocument();
    first.unmount();

    const reopened = render(<CodeGardenGame />);
    const selector = await screen.findByRole("group", { name: "Select farm world" });
    expect(await screen.findByRole("heading", { name: "Moon" })).toBeInTheDocument();
    expect(await db.codeGardenState.get("default")).toMatchObject({
      adventure: {
        activeWorld: "moon",
        moonFarm: { water: 8, seeds: { mooncap: 4 } },
      },
      programs: { adventure: 'plant("mooncap")\nwater()' },
    });
    await user.click(within(selector).getByRole("button", { name: "Earth" }));
    await waitFor(async () => expect((await db.codeGardenState.get("default"))?.adventure?.activeWorld).toBe("earth"));
    await user.click(within(selector).getByRole("button", { name: "Moon" }));
    await waitFor(async () => expect((await db.codeGardenState.get("default"))?.adventure?.activeWorld).toBe("moon"));
    expect((await db.codeGardenState.get("default"))?.adventure?.plots).toEqual(expandedFarm.plots);
    reopened.unmount();
  });

  it("purchases the second robot through the skill tree and restores its own program and energy", async () => {
    const user = userEvent.setup();
    const initial = await initializeCodeGarden();
    const farm = {
      ...createGardenAdventure(),
      coins: 1_000,
      skillLevels: { "field-survey": 1, "robot-blueprints": 1 },
    };
    await saveCodeGardenState({
      ...initial,
      activeMode: "adventure",
      activeMissionId: GARDEN_MISSIONS.at(-1)!.id,
      completedMissionIds: GARDEN_MISSIONS.map((mission) => mission.id),
      adventure: farm,
    });

    const first = render(<CodeGardenGame />);
    await screen.findByRole("textbox", { name: "Robot program" });
    await addGardenPanel(user, "Farming Skill Tree");
    expect(await screen.findByRole("button", { name: /Build assistant robot · 380 coins/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Build assistant robot · 380 coins/ }));
    await waitFor(async () => {
      expect((await db.codeGardenState.get("default"))?.adventure).toMatchObject({
        coins: 620,
        secondRobot: { x: 5, y: 4, energy: 60 },
      });
    });

    const assistantButton = screen.getByRole("button", { name: "Assistant robot" });
    await user.click(assistantButton);
    const editor = await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'move("west")' } });
    await user.click(screen.getByRole("button", { name: "Run program" }));
    await waitFor(async () => {
      expect(await db.codeGardenState.get("default")).toMatchObject({
        adventure: {
          robot: { x: 0, y: 2 },
          secondRobot: { x: 4, y: 4, energy: 59 },
        },
        programs: { "adventure-assistant": 'move("west")' },
      });
    }, { timeout: 5000 });
    await screen.findByRole("button", { name: "Run program" });
    first.unmount();

    render(<CodeGardenGame />);
    expect(await screen.findByRole("button", { name: "Assistant robot" })).toHaveAttribute("aria-pressed", "true");
    expect((await screen.findByRole("textbox", { name: "Robot program" }) as HTMLTextAreaElement).value)
      .toBe('move("west")');
    expect(await db.codeGardenState.get("default")).toMatchObject({
      adventure: { activeRobot: "assistant", secondRobot: { x: 4, y: 4, energy: 59 } },
    });
  });
});
