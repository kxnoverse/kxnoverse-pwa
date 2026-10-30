import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGardenRun,
  GARDEN_MISSIONS,
  getGardenSuggestions,
  GardenLanguageError,
  executeGardenProgram,
  gardenCoordinatesAtPoint,
  GARDEN_RESEARCH,
  initializeCodeGarden,
  parseGardenProgram,
  researchGardenUpgrade,
  saveCodeGardenState,
} from "./code-garden";
import { db } from "./db";

describe("Code Garden language and simulation", () => {
  it("maps isometric view coordinates back to the real garden grid", () => {
    expect(gardenCoordinatesAtPoint({ x: 380, y: 42 }, 7, 5)).toEqual({ x: 0, y: 0 });
    expect(gardenCoordinatesAtPoint({ x: 428, y: 67 }, 7, 5)).toEqual({ x: 1, y: 0 });
    expect(gardenCoordinatesAtPoint({ x: 332, y: 67 }, 7, 5)).toEqual({ x: 0, y: 1 });
    expect(gardenCoordinatesAtPoint({ x: 380, y: 42 }, 0, 0)).toBeNull();
    expect(gardenCoordinatesAtPoint({ x: 20, y: 350 }, 7, 5)).toBeNull();
  });

  beforeEach(async () => {
    await db.open();
    await db.codeGardenState.clear();
  });

  afterEach(async () => {
    await db.codeGardenState.clear();
  });

  it("parses sequential commands, nested loops, conditions, variables, and routines", () => {
    expect(parseGardenProgram('move("east")\nharvest()')).toHaveLength(2);
    expect(parseGardenProgram('repeat(2) { if (tile == "ripe") { harvest() } }')).toHaveLength(1);
    expect(parseGardenProgram("let cycles = 2\nfunction harvest_row() { repeat(cycles) { move(east) } }")).toHaveLength(2);
    expect(() => parseGardenProgram("move(east")).toThrow(GardenLanguageError);
    expect(() => parseGardenProgram("move(sideways!)")).toThrow(GardenLanguageError);
  });

  it("executes movement and harvesting against the real mission world", () => {
    const mission = GARDEN_MISSIONS[0];
    const result = executeGardenProgram(
      'move("east")\nmove("east")\nharvest()',
      mission,
      createGardenRun(mission),
    );

    expect(result.message).toBe("Mission complete: 1/1.");
    expect(result.run.robot).toMatchObject({ x: 2, y: 2 });
    expect(result.run.resources.plants).toBe(1);
    expect(result.run.tiles.find((tile) => tile.x === 2 && tile.y === 2)?.kind).toBe("soil");
    expect(result.frames).toHaveLength(3);
  });

  it("runs counted loops and branches using the tile currently under the robot", () => {
    const rowMission = GARDEN_MISSIONS[1];
    const row = executeGardenProgram(
      "repeat(3) { move(east) harvest() }",
      rowMission,
      createGardenRun(rowMission),
    );
    expect(row.run.completed).toBe(true);
    expect(row.run.harvested).toBe(3);

    const conditionalMission = GARDEN_MISSIONS[2];
    const conditional = executeGardenProgram(
      'move(east)\nrepeat(3) { if (tile == "ripe") { harvest() } move(east) }',
      conditionalMission,
      createGardenRun(conditionalMission),
    );
    expect(conditional.run.completed).toBe(true);
    expect(conditional.run.harvested).toBe(2);
    expect(conditional.run.tiles.find((tile) => tile.kind === "stone")).toBeDefined();
  });

  it("uses scanner conditions to adapt harvesting to mixed, live tile states", () => {
    const mission = GARDEN_MISSIONS[6];
    const start = createGardenRun(mission, undefined, ["field-scanner"]);
    const blind = executeGardenProgram(
      'repeat(5) { move("east") harvest() }',
      mission,
      start,
      mission.maxSteps,
      ["field-scanner"],
    );
    expect(blind.message).toContain("There is no ripe crop");
    expect(blind.run.harvested).toBe(1);

    const result = executeGardenProgram(
      'repeat(5) { move("east") if (tile_is("ripe")) { harvest() } }',
      mission,
      start,
      mission.maxSteps,
      ["field-scanner"],
    );
    expect(result.run.completed).toBe(true);
    expect(result.run.harvested).toBe(3);
    expect(result.decisions.map((decision) => decision.matched)).toEqual([true, false, true, false, true]);
    expect(result.decisions.map((decision) => decision.actionIndex)).toEqual([1, 3, 4, 6, 7]);
    expect(result.stats).toMatchObject({ instructions: 8, harvested: 3, energyConsumed: 5 });
  });

  it("returns sensor values from current plant, energy, and storage state", () => {
    const mission = GARDEN_MISSIONS[6];
    const sensors = ["field-scanner"];
    const start = createGardenRun(mission, undefined, sensors);
    start.tiles = start.tiles.map((tile) => tile.x === 1 && tile.y === 2 ? { ...tile, kind: "plant" as const, growth: 0 } : tile);
    const plant = executeGardenProgram(
      'move("east") if (tile_is("plant")) { turn(left) }',
      mission,
      start,
      mission.maxSteps,
      sensors,
    );
    expect(plant.decisions[0]).toMatchObject({ sensor: "tile_is", argument: "plant", matched: true });
    expect(plant.run.robot.direction).toBe("north");

    const stoneStart = {
      ...start,
      robot: { ...start.robot, x: 4 },
    };
    const stone = executeGardenProgram(
      'if (tile_is("stone")) { turn(left) }',
      mission,
      stoneStart,
      mission.maxSteps,
      sensors,
    );
    expect(stone.decisions[0]).toMatchObject({ argument: "stone", matched: true });

    const emptyStart = {
      ...start,
      tiles: start.tiles.map((tile) => tile.x === 0 && tile.y === 2 ? { ...tile, kind: "empty" as const } : tile),
    };
    const empty = executeGardenProgram(
      'if (tile_is("empty")) { turn(left) }',
      mission,
      emptyStart,
      mission.maxSteps,
      sensors,
    );
    expect(empty.decisions[0]).toMatchObject({ argument: "empty", matched: true });

    const enoughEnergy = executeGardenProgram(
      "if (energy_at_least(12)) { turn(left) } else { turn(right) }",
      mission,
      start,
      mission.maxSteps,
      sensors,
    );
    expect(enoughEnergy.decisions[0]).toMatchObject({ sensor: "energy_at_least", argument: 12, matched: true });

    const lowEnergyStart = { ...start, resources: { ...start.resources, energy: 11 } };
    const lowEnergy = executeGardenProgram(
      "if (energy_at_least(12)) { turn(left) } else { turn(right) }",
      mission,
      lowEnergyStart,
      mission.maxSteps,
      sensors,
    );
    expect(lowEnergy.decisions[0].matched).toBe(false);
    expect(lowEnergy.run.robot.direction).toBe("south");

    const fullStorageStart = {
      ...start,
      robot: { ...start.robot, x: 4 },
      tiles: start.tiles.map((tile) => tile.x === 4 && tile.y === 2 ? { ...tile, kind: "wood" as const } : tile),
      resources: { ...start.resources, wood: 12 },
    };
    const fullStorage = executeGardenProgram(
      'if (storage_has_room("wood")) { collect() } else { turn(left) }',
      mission,
      fullStorageStart,
      mission.maxSteps,
      sensors,
    );
    expect(fullStorage.decisions[0]).toMatchObject({ sensor: "storage_has_room", argument: "wood", matched: false });
    expect(fullStorage.run.resources.wood).toBe(12);
    expect(fullStorage.run.robot.direction).toBe("north");

    const roomStorage = executeGardenProgram(
      'if (storage_has_room("wood")) { collect() }',
      mission,
      { ...fullStorageStart, resources: { ...fullStorageStart.resources, wood: 11 } },
      mission.maxSteps,
      sensors,
    );
    expect(roomStorage.decisions[0].matched).toBe(true);
    expect(roomStorage.run.resources.wood).toBe(12);
    expect(roomStorage.run.tiles.find((tile) => tile.x === 4 && tile.y === 2)?.kind).toBe("soil");
  });

  it("rejects unknown sensors, invalid arguments, and sensor access before research", () => {
    expect(() => parseGardenProgram('if (soil_is("ripe")) { harvest() }')).toThrow('Unknown sensor "soil_is"');
    expect(() => parseGardenProgram('if (tile_is("lava")) { harvest() }')).toThrow("tile_is() needs a tile kind");
    expect(() => parseGardenProgram('if (storage_has_room("seeds")) { collect() }')).toThrow('needs "wood" or "stone"');
    expect(() => parseGardenProgram("if (energy_at_least(energy)) { wait() }")).toThrow("whole-number");
    expect(() => parseGardenProgram('if (tile_is("ripe") == true) { harvest() }')).toThrow('Expected ")"');

    const mission = GARDEN_MISSIONS[6];
    const locked = executeGardenProgram(
      'if (tile_is("ripe")) { harvest() }',
      mission,
      createGardenRun(mission),
      mission.maxSteps,
      [],
    );
    expect(locked.message).toContain("Field scanner research");
  });

  it("limits sensor-driven actions and suggests scanner features only after unlock", () => {
    const mission = GARDEN_MISSIONS[6];
    const limited = executeGardenProgram(
      'repeat(100) { if (tile_is("soil")) { turn(left) } }',
      mission,
      createGardenRun(mission, undefined, ["field-scanner"]),
      5,
      ["field-scanner"],
    );
    expect(limited.actions).toHaveLength(5);
    expect(limited.message).toContain("Program limit");
    expect(getGardenSuggestions("tile_", mission)).toEqual([]);
    expect(getGardenSuggestions("tile_", mission, undefined, ["field-scanner"])[0].insert).toBe("tile_is()");
    expect(getGardenSuggestions('if (tile_is("ri', mission, undefined, ["field-scanner"])).toContainEqual({
      insert: "ripe",
      detail: "Sensor value",
    });

    const emptyLoop = executeGardenProgram(
      "repeat(100) { repeat(100) { repeat(100) { let cycles = 1 } } }",
      mission,
      createGardenRun(mission, undefined, ["field-scanner"]),
      mission.maxSteps,
      ["field-scanner"],
    );
    expect(emptyLoop.message).toContain("Instruction limit reached");
  });

  it("supports reusable functions and variables in later missions", () => {
    const functionMission = GARDEN_MISSIONS[3];
    const functions = executeGardenProgram(
      "function harvest_row() { repeat(3) { move(east) harvest() } }\nharvest_row()",
      functionMission,
      createGardenRun(functionMission),
    );
    expect(functions.run.completed).toBe(true);
    expect(functions.run.harvested).toBe(3);

    const variableMission = GARDEN_MISSIONS[4];
    const variables = executeGardenProgram(
      "let cycles = 2\nrepeat(cycles) { plant() wait() wait() harvest() }",
      variableMission,
      createGardenRun(variableMission),
    );
    expect(variables.run.completed).toBe(true);
    expect(variables.run.harvested).toBe(2);
    expect(variables.run.resources.seeds).toBe(2);
  });

  it("returns useful runtime errors without allowing edge movement or unbounded execution", () => {
    const first = GARDEN_MISSIONS[0];
    const edge = executeGardenProgram("move(west)", first, createGardenRun(first));
    expect(edge.run.robot).toEqual(first.robot);
    expect(edge.message).toContain("edge");

    const row = GARDEN_MISSIONS[1];
    const limited = executeGardenProgram("repeat(100) { turn(left) }", row, createGardenRun(row), 5);
    expect(limited.actions).toHaveLength(5);
    expect(limited.run.steps).toBe(5);
    expect(limited.message).toContain("Program limit");

    const unavailable = executeGardenProgram("repeat(2) { move(east) }", first, createGardenRun(first));
    expect(unavailable.message).toContain("Loops unlock");
  });

  it("offers only commands unlocked for the active mission", () => {
    expect(getGardenSuggestions("mo", GARDEN_MISSIONS[0])).toEqual([
      { insert: "move()", detail: 'Move one tile: move("east")' },
    ]);
    expect(getGardenSuggestions("re", GARDEN_MISSIONS[0])).toEqual([]);
    expect(getGardenSuggestions("re", GARDEN_MISSIONS[1]).some((item) => item.insert.startsWith("repeat"))).toBe(true);
  });

  it("researches the solar coil with real costs and makes wait recharge the energy-limited relay", async () => {
    const state = await initializeCodeGarden();
    await saveCodeGardenState({
      ...state,
      completedMissionIds: GARDEN_MISSIONS.slice(0, 5).map((mission) => mission.id),
      resources: { ...state.resources, wood: 3, stone: 2, energy: 20 },
    });

    await expect(researchGardenUpgrade("solar-coil")).resolves.toMatchObject({
      upgrades: ["solar-coil"],
      resources: { wood: 0, stone: 0 },
    });
    const mission = GARDEN_MISSIONS[5];
    const run = createGardenRun(mission, { ...state.resources, energy: 20 }, ["solar-coil"]);
    expect(run.resources.energy).toBe(3);

    const relayProgram = 'repeat(3) { move("east") harvest() }\nwait()\nmove("east")\nharvest()';
    const unpowered = executeGardenProgram(
      relayProgram,
      mission,
      run,
      mission.maxSteps,
    );
    expect(unpowered.run.completed).toBe(false);
    expect(unpowered.message).toContain("needs more energy");

    const result = executeGardenProgram(
      relayProgram,
      mission,
      run,
      mission.maxSteps,
      ["solar-coil"],
    );
    expect(result.run.completed).toBe(true);
    expect(result.run.robot.x).toBe(4);
    expect(result.stats).toEqual({
      instructions: 9,
      harvested: 4,
      collected: 0,
      energyConsumed: 4,
      energyGenerated: 2,
    });
    expect(result.run.resources.energy).toBe(1);
    expect(getGardenSuggestions("wa", mission, 2, ["solar-coil"])[0].detail).toContain("recharge 2 energy");
  });

  it("requires the prior mission and materials before researching a capability", async () => {
    const state = await initializeCodeGarden();
    await saveCodeGardenState({
      ...state,
      resources: { ...state.resources, wood: 3, stone: 2 },
    });
    await expect(researchGardenUpgrade("solar-coil")).rejects.toThrow("prerequisite mission");
    await saveCodeGardenState({
      ...(await db.codeGardenState.get("default"))!,
      completedMissionIds: ["seed-cycle"],
      resources: { ...state.resources, wood: 0, stone: 0 },
    });
    await expect(researchGardenUpgrade("solar-coil")).rejects.toThrow("needs 3 wood and 2 stone");
    const research = GARDEN_RESEARCH.find((entry) => entry.id === "solar-coil");
    expect(research?.prerequisiteMission).toBe("seed-cycle");
  });

  it("researches the field scanner only after the solar relay and pays its actual cost", async () => {
    const state = await initializeCodeGarden();
    await saveCodeGardenState({
      ...state,
      completedMissionIds: GARDEN_MISSIONS.slice(0, 6).map((mission) => mission.id),
      resources: { ...state.resources, wood: 2, stone: 1 },
    });
    const researched = await researchGardenUpgrade("field-scanner");
    expect(researched.upgrades).toContain("field-scanner");
    expect(researched.resources).toMatchObject({ wood: 0, stone: 0 });
    expect(GARDEN_RESEARCH.find((entry) => entry.id === "field-scanner")).toMatchObject({
      prerequisiteMission: "solar-relay",
      cost: { wood: 2, stone: 1 },
    });
  });

  it("persists mission, world, supplies, and upgrade state", async () => {
    const initial = await initializeCodeGarden();
    const mission = GARDEN_MISSIONS[0];
    const run = createGardenRun(mission);
    const saved = await saveCodeGardenState({
      ...initial,
      completedMissionIds: [mission.id],
      activeRun: {
        missionId: run.missionId,
        robot: run.robot,
        tiles: run.tiles,
        harvested: 1,
        collected: 0,
        steps: 3,
        completed: true,
        storageCapacity: 20,
      },
      resources: { ...run.resources, plants: 4, wood: 2, stone: 1 },
      upgrades: ["storehouse"],
    });

    expect(await db.codeGardenState.get("default")).toEqual(saved);
    expect(await initializeCodeGarden()).toMatchObject({
      activeMissionId: "first-harvest",
      completedMissionIds: ["first-harvest"],
      resources: { plants: 4, wood: 2, stone: 1 },
      upgrades: ["storehouse"],
      activeRun: { harvested: 1, completed: true, storageCapacity: 20 },
    });
  });
});
