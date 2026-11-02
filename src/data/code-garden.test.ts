import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyGardenAdventureAction,
  buyGardenMoonSeeds,
  buyGardenMoonSkill,
  buyGardenSkill,
  buySecondGardenRobot,
  buyGardenSeeds,
  buyGardenUpgrade,
  createGardenAdventure,
  createGardenAdventureMission,
  createGardenAdventureRun,
  expandGardenMoonFarm,
  getGardenMoonAvailableCrops,
  getGardenMoonCropProgress,
  getGardenMoonSkillLevel,
  getGardenMoonWaterCapacity,
  createGardenRun,
  expandGarden,
  getGardenCropProgress,
  GARDEN_REFERENCE_ENTRIES,
  GARDEN_MISSIONS,
  GARDEN_SECOND_ROBOT_COST,
  getGardenAvailableCrops,
  getGardenSeedPack,
  getGardenSkillLevel,
  getGardenSuggestions,
  GardenLanguageError,
  executeGardenProgram,
  gardenCoordinatesAtPoint,
  isCodeGardenState,
  isGardenAdventureUnlocked,
  isGardenMoonExpeditionReady,
  GARDEN_RESEARCH,
  initializeCodeGarden,
  parseGardenProgram,
  researchGardenUpgrade,
  saveCodeGardenProgram,
  saveCodeGardenState,
  sellGardenHarvest,
  sellGardenMoonHarvest,
  refillGardenMoonWater,
  travelGardenWorld,
  unlockGardenMoonExpedition,
  normalizeGardenAdventure,
} from "./code-garden";
import { CODE_REFERENCE_ENTRIES, getCodeReferenceEntries } from "./code-reference";
import { db, type GardenAdventureSave } from "./db";

function earthFarmReadyForMoon(coins = 1_600): GardenAdventureSave {
  const farm = {
    ...createGardenAdventure(1),
    coins: 2_000,
    skillLevels: {
      "soil-science": 1,
      "abundant-harvest": 1,
      "seed-diversity": 1,
      "field-survey": 1,
      "robot-blueprints": 1,
    },
    secondRobot: { x: 5, y: 4, direction: "west", energy: 60, movementProgress: 0 },
  };
  return { ...expandGarden(farm), coins, updatedAt: 1 };
}

describe("Code Garden language and simulation", () => {
  it("maps isometric view coordinates back to the real garden grid", () => {
    expect(gardenCoordinatesAtPoint({ x: 380, y: 42 }, 7, 5)).toEqual({ x: 0, y: 0 });
    expect(gardenCoordinatesAtPoint({ x: 428, y: 67 }, 7, 5)).toEqual({ x: 1, y: 0 });
    expect(gardenCoordinatesAtPoint({ x: 332, y: 67 }, 7, 5)).toEqual({ x: 0, y: 1 });
    expect(gardenCoordinatesAtPoint({ x: 380, y: 42 }, 0, 0)).toBeNull();
    expect(gardenCoordinatesAtPoint({ x: 20, y: 350 }, 7, 5)).toBeNull();
  });

  it("keeps tutorial unlocks intact and simulates persistent, time-grown Adventure crops", () => {
    const now = 1_000_000;
    const farm = createGardenAdventure(now);
    const completed = GARDEN_MISSIONS.map((mission) => mission.id);
    expect(isGardenAdventureUnlocked(completed)).toBe(true);
    expect(isGardenAdventureUnlocked(completed.slice(0, -1))).toBe(false);
    expect(isCodeGardenState({
      id: "default",
      activeMissionId: GARDEN_MISSIONS[0].id,
      activeMode: "adventure",
      completedMissionIds: completed,
      resources: { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
      upgrades: [],
      programs: {},
      adventure: farm,
      updatedAt: now,
    })).toBe(true);
    expect(isCodeGardenState({
      id: "default",
      activeMissionId: GARDEN_MISSIONS[0].id,
      completedMissionIds: [],
      resources: { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
      upgrades: [],
      adventure: farm,
      updatedAt: now,
    })).toBe(false);

    const mission = createGardenAdventureMission(farm, now);
    const run = createGardenAdventureRun(farm, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }, now);
    const options = { adventure: { seeds: farm.seeds, richSoil: false, wateringCan: false, now } };
    const planting = executeGardenProgram('plant("carrot")', mission, run, 200, [], options);
    expect(planting.actions).toEqual([{ kind: "plant", argument: "carrot" }]);
    const plantedFarm = applyGardenAdventureAction(farm, planting.actions[0], planting.frames[0], now);
    const carrot = plantedFarm.plots.find((plot) => plot.x === 0 && plot.y === 2)!;
    expect(carrot).toMatchObject({ crop: "carrot", plantedAt: now, watered: false });
    expect(plantedFarm.seeds.carrot).toBe(1);
    expect(getGardenCropProgress(carrot, now + 60_000)).toMatchObject({ stage: 1, ready: false });

    const plantedMission = createGardenAdventureMission(plantedFarm, now + 10_000);
    const plantedRun = createGardenAdventureRun(plantedFarm, run.resources, now + 10_000);
    const watering = executeGardenProgram("water()", plantedMission, plantedRun, 200, [], {
      adventure: { ...options.adventure, seeds: plantedFarm.seeds, now: now + 10_000 },
    });
    const wateredFarm = applyGardenAdventureAction(plantedFarm, watering.actions[0], watering.frames[0], now + 10_000);
    const wateredCarrot = wateredFarm.plots.find((plot) => plot.x === 0 && plot.y === 2)!;
    expect(wateredCarrot).toMatchObject({ watered: true, growthBonusMs: 48_000 });
    expect(getGardenCropProgress(wateredCarrot, now + 191_999).ready).toBe(false);
    expect(getGardenCropProgress(wateredCarrot, now + 192_000).ready).toBe(true);

    const ripeMission = createGardenAdventureMission(wateredFarm, now + 192_000);
    const ripeRun = createGardenAdventureRun(wateredFarm, run.resources, now + 192_000);
    const harvest = executeGardenProgram("harvest()", ripeMission, ripeRun, 200, [], {
      adventure: { ...options.adventure, seeds: wateredFarm.seeds, now: now + 192_000 },
    });
    const harvestedFarm = applyGardenAdventureAction(wateredFarm, harvest.actions[0], harvest.frames[0], now + 192_000);
    expect(harvestedFarm.harvest.carrot).toBe(1);
    expect(harvestedFarm.plots.find((plot) => plot.x === 0 && plot.y === 2)?.crop).toBeUndefined();
    expect(sellGardenHarvest(harvestedFarm)).toMatchObject({
      coins: 54,
      harvest: { turnip: 0, carrot: 0, berry: 0 },
    });
  });

  it("unlocks the Moon after Earth progression and runs isolated lunar crops, water, market, and robot state", async () => {
    const now = 1_000_000;
    const earth = earthFarmReadyForMoon(300);
    expect(isGardenMoonExpeditionReady(createGardenAdventure(now))).toBe(false);
    expect(isGardenMoonExpeditionReady(earth)).toBe(true);

    const unlocked = unlockGardenMoonExpedition(earth);
    expect(unlocked).toMatchObject({
      coins: 50,
      activeWorld: "moon",
      moonFarm: {
        credits: 0,
        water: 10,
        seeds: { mooncap: 5, moonleaf: 3, prismberry: 0 },
        robots: { primary: { x: 0, y: 2 }, assistant: { x: 5, y: 4 } },
      },
    });
    expect(() => unlockGardenMoonExpedition(unlocked)).toThrow("already unlocked");
    expect(travelGardenWorld(unlocked, "earth").activeWorld).toBe("earth");
    expect(travelGardenWorld(unlocked, "moon").activeWorld).toBe("moon");

    const moon = unlocked.moonFarm!;
    const mission = createGardenAdventureMission(unlocked, now);
    const run = createGardenAdventureRun(unlocked, { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 }, now);
    const options = {
      adventure: {
        seeds: moon.seeds,
        richSoil: true,
        wateringCan: false,
        now,
        availableCrops: getGardenMoonAvailableCrops(moon),
        isMoon: true,
        moonWater: moon.water,
        wateringGrowthFraction: 0.5,
      },
    };
    const planting = executeGardenProgram('plant("mooncap")\nwater()', mission, run, 300, [], options);
    expect(planting.actions).toEqual([{ kind: "plant", argument: "mooncap" }, { kind: "water" }]);
    let updated = unlocked;
    for (let index = 0; index < planting.actions.length; index += 1) {
      updated = applyGardenAdventureAction(updated, planting.actions[index], planting.frames[index], now);
    }
    expect(updated.moonFarm).toMatchObject({
      water: 8,
      seeds: { mooncap: 4 },
      plots: expect.arrayContaining([expect.objectContaining({ x: 0, y: 2, crop: "mooncap", watered: true, growthBonusMs: 90_000 })]),
    });
    const moonPlot = updated.moonFarm!.plots.find((plot) => plot.x === 0 && plot.y === 2)!;
    expect(getGardenMoonCropProgress(moonPlot, now + 89_999, updated.moonFarm!).ready).toBe(false);
    expect(getGardenMoonCropProgress(moonPlot, now + 90_000, updated.moonFarm!).ready).toBe(true);

    const ripeMission = createGardenAdventureMission(updated, now + 90_000);
    const ripeRun = createGardenAdventureRun(updated, run.resources, now + 90_000);
    const harvestExecution = executeGardenProgram("harvest()", ripeMission, ripeRun, 300, [], {
      adventure: { ...options.adventure, seeds: updated.moonFarm!.seeds, now: now + 90_000, moonWater: updated.moonFarm!.water },
    });
    updated = applyGardenAdventureAction(updated, harvestExecution.actions[0], harvestExecution.frames[0], now + 90_000);
    expect(updated.moonFarm?.harvest.mooncap).toBe(1);
    expect(sellGardenMoonHarvest(updated.moonFarm!)).toMatchObject({
      credits: 42,
      harvest: { mooncap: 0, moonleaf: 0, prismberry: 0 },
    });
    expect(() => executeGardenProgram('plant("mooncap")', mission, run, 300, [], {
      adventure: { ...options.adventure, moonWater: 0 },
    }).actions).toHaveLength(0);

    const assistantRun = createGardenAdventureRun(updated, run.resources, now, "assistant");
    const assistantExecution = executeGardenProgram('move("west")', mission, assistantRun, 300);
    const moved = applyGardenAdventureAction(updated, assistantExecution.actions[0], assistantExecution.frames[0], now, "assistant");
    expect(moved.robot).toEqual(updated.robot);
    expect(moved.secondRobot).toMatchObject({ x: updated.secondRobot?.x, y: updated.secondRobot?.y, energy: 59 });
    expect(moved.moonFarm?.robots.assistant).toMatchObject({ x: 4, y: 4, movementProgress: 0 });

    const primaryRun = createGardenAdventureRun(moved, run.resources, now, "primary");
    const primaryExecution = executeGardenProgram('move("east")', mission, primaryRun, 300);
    updated = applyGardenAdventureAction(moved, primaryExecution.actions[0], primaryExecution.frames[0], now, "primary");
    expect(updated.robot).toEqual(moved.robot);
    expect(updated.energy).toBe(moved.energy - 1);
    expect(updated.secondRobot?.energy).toBe(59);
    expect(updated.moonFarm?.robots.primary).toMatchObject({ x: 1, y: 2, movementProgress: 0 });

    const state = await initializeCodeGarden();
    const persisted = await saveCodeGardenState({
      ...state,
      activeMode: "adventure",
      completedMissionIds: GARDEN_MISSIONS.map((item) => item.id),
      adventure: updated,
    });
    expect(isCodeGardenState(persisted)).toBe(true);
    expect(await initializeCodeGarden()).toMatchObject({
      adventure: {
        coins: 50,
        energy: 39,
        secondRobot: { energy: 59 },
        activeWorld: "moon",
        moonFarm: { water: 8, harvest: { mooncap: 1 } },
      },
    });
  });

  it("enforces lunar skill prerequisites and applies growth, water capacity, crop, yield, and movement effects", () => {
    const base = earthFarmReadyForMoon();
    let save = unlockGardenMoonExpedition(base).moonFarm!;
    expect(() => buyGardenMoonSkill(save, "prism-grafting")).toThrow("prerequisite");
    save = { ...save, credits: 2_000 };
    save = buyGardenMoonSkill(save, "cryoseeding");
    save = buyGardenMoonSkill(save, "cryoseeding");
    save = buyGardenMoonSkill(save, "ice-condenser");
    save = buyGardenMoonSkill(save, "prism-grafting");
    save = buyGardenMoonSkill(save, "gravity-treads");
    save = buyGardenMoonSkill(save, "lunar-yield");
    expect(getGardenMoonSkillLevel(save, "cryoseeding")).toBe(2);
    expect(getGardenMoonWaterCapacity(save)).toBe(14);
    expect(getGardenMoonAvailableCrops(save)).toContain("prismberry");
    save = buyGardenMoonSeeds(save, "prismberry");
    expect(save.seeds.prismberry).toBe(3);

    const planted = {
      ...save.plots[0],
      x: 0,
      y: 2,
      crop: "mooncap" as const,
      plantedAt: 1,
    };
    const plot = { ...save, plots: save.plots.map((item) => item.x === 0 && item.y === 2 ? planted : item) };
    expect(getGardenMoonCropProgress(planted, 100_000, plot).progress).toBeGreaterThan(0.5);

    const farm = { ...base, activeWorld: "moon" as const, moonFarm: { ...plot, credits: 0 } };
    const run = createGardenAdventureRun(farm, { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 }, 100_000);
    const execution = executeGardenProgram('move("east")\nmove("west")', createGardenAdventureMission(farm, 100_000), run, 300, [], {
      adventure: {
        seeds: farm.moonFarm.seeds,
        richSoil: false,
        wateringCan: false,
        now: 100_000,
        isMoon: true,
        moonWater: farm.moonFarm.water,
        moveEnergyEvery: 2,
      },
    });
    expect(execution.run.resources.energy).toBe(run.resources.energy - 1);
    expect(execution.frames[1].movementProgress).toBe(0);

    const ripePlot = { ...planted, plantedAt: 0 };
    const ripeFarm = { ...farm, moonFarm: { ...farm.moonFarm, plots: farm.moonFarm.plots.map((item) => item.x === 0 && item.y === 2 ? ripePlot : item) } };
    const ripeRun = createGardenAdventureRun(ripeFarm, run.resources, 500_000);
    const harvest = executeGardenProgram("harvest()", createGardenAdventureMission(ripeFarm, 500_000), ripeRun, 300, [], {
      adventure: {
        seeds: ripeFarm.moonFarm.seeds,
        richSoil: false,
        wateringCan: false,
        now: 500_000,
        isMoon: true,
        moonWater: ripeFarm.moonFarm.water,
        harvestYieldBonus: getGardenMoonSkillLevel(ripeFarm.moonFarm, "lunar-yield"),
      },
    });
    const afterHarvest = applyGardenAdventureAction(ripeFarm, harvest.actions[0], harvest.frames[0], 500_000);
    expect(afterHarvest.moonFarm?.harvest.mooncap).toBe(2);
    expect(refillGardenMoonWater({ ...save, credits: 20, water: 8 })).toMatchObject({ credits: 0, water: 12 });
    expect(expandGardenMoonFarm({ ...save, credits: 80 })).toMatchObject({ expansions: 1, width: 8, credits: 0 });
  });

  it("sells crop seeds and upgrades atomically and preserves plot coordinates on expansion", () => {
    const farm = { ...createGardenAdventure(1), coins: 120 };
    const seeded = buyGardenSeeds(farm, "berry");
    expect(seeded).toMatchObject({ coins: 66, seeds: { berry: 3 } });
    const improved = buyGardenUpgrade(seeded, "richSoil");
    expect(improved).toMatchObject({ coins: 6, richSoil: true });
    expect(() => buyGardenUpgrade(improved, "richSoil")).toThrow("already own");
    const expanded = expandGarden(farm);
    expect(expanded).toMatchObject({ width: 8, height: 5, expansions: 1, coins: 70 });
    expect(expanded.plots).toHaveLength(40);
    expect(expanded.plots.find((plot) => plot.x === 0 && plot.y === 2)).toEqual(farm.plots.find((plot) => plot.x === 0 && plot.y === 2));
    expect(() => buyGardenSeeds({ ...farm, coins: 0 }, "carrot")).toThrow("Not enough coins");
  });

  it("enforces skill prerequisites and applies agriculture, equipment, and expansion unlocks", () => {
    let farm = { ...createGardenAdventure(1), coins: 2_000 };
    expect(() => buyGardenSkill(farm, "abundant-harvest")).toThrow("prerequisite");
    farm = buyGardenSkill(farm, "soil-science");
    expect(farm.coins).toBe(1_940);
    farm = buyGardenSkill(farm, "soil-science");
    expect(getGardenSkillLevel(farm, "soil-science")).toBe(2);
    expect(() => buyGardenSkill(farm, "soil-science")).toThrow("maximum level");
    farm = buyGardenSkill(farm, "abundant-harvest");
    expect(() => buyGardenSeeds(farm, "pumpkin")).toThrow("seed diversity");
    farm = buyGardenSkill(farm, "seed-diversity");
    expect(getGardenAvailableCrops(farm)).toContain("pumpkin");
    farm = buyGardenSeeds(farm, "pumpkin");
    expect(farm.seeds.pumpkin).toBe(3);
    const pumpkinPlanting = executeGardenProgram(
      'plant("pumpkin")',
      createGardenAdventureMission(farm, 1),
      createGardenAdventureRun(farm, { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 }, 1),
      200,
      [],
      { adventure: { seeds: farm.seeds, richSoil: farm.richSoil, wateringCan: farm.wateringCan, now: 1, availableCrops: getGardenAvailableCrops(farm) } },
    );
    expect(pumpkinPlanting.run.tiles.find((tile) => tile.x === 0 && tile.y === 2)).toMatchObject({ crop: "pumpkin" });

    expect(() => buyGardenSkill(farm, "deep-pantry")).toThrow("prerequisite");
    farm = buyGardenSkill(farm, "precision-nozzle");
    farm = buyGardenSkill(farm, "deep-pantry");
    farm = buyGardenSkill(farm, "deep-pantry");
    farm = buyGardenSkill(farm, "seed-sorting");
    expect(getGardenSeedPack(farm, "turnip")).toBe(5);
    expect(createGardenAdventureRun(farm, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }).storageCapacity).toBe(50);

    farm = buyGardenSkill(farm, "field-survey");
    farm = { ...farm, expansions: 4, width: 14, plots: Array.from({ length: 70 }, (_, index) => ({ x: index % 14, y: Math.floor(index / 14) })) };
    farm = expandGarden(farm);
    expect(farm).toMatchObject({ expansions: 5, width: 16 });
  });

  it("applies skill effects to crop growth, watering, yields, movement energy, and saved assistant robots", async () => {
    const now = 1_000_000;
    let farm = { ...createGardenAdventure(now), coins: 2_000 };
    farm = buyGardenSkill(farm, "soil-science");
    farm = buyGardenSkill(farm, "soil-science");
    farm = buyGardenSkill(farm, "abundant-harvest");
    farm = buyGardenSkill(farm, "quick-steps");
    farm = buyGardenSkill(farm, "quick-steps");
    farm = buyGardenSkill(farm, "energy-economy");
    farm = buyGardenSkill(farm, "precision-nozzle");
    const planted = { ...farm.plots[0], x: 0, y: 2, crop: "turnip" as const, plantedAt: now - 72_000 };
    farm = { ...farm, plots: farm.plots.map((plot) => plot.x === 0 && plot.y === 2 ? planted : plot) };
    expect(createGardenAdventureMission(farm, now).tiles.find((tile) => tile.x === 0 && tile.y === 2)?.kind).toBe("ripe");

    const unplantedFarm = {
      ...farm,
      plots: farm.plots.map((plot) => plot.x === 0 && plot.y === 2 ? { x: 0, y: 2 } : plot),
    };
    const waterRun = createGardenAdventureRun(
      unplantedFarm,
      { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
      now,
    );
    const watering = executeGardenProgram("plant()\nwater()", createGardenAdventureMission(unplantedFarm, now), waterRun, 200, [], {
      adventure: {
        seeds: farm.seeds, richSoil: farm.richSoil, wateringCan: farm.wateringCan, now,
        availableCrops: getGardenAvailableCrops(farm), wateringGrowthFraction: 0.5,
      },
    });
    expect(watering.frames[1].tiles.find((tile) => tile.x === 0 && tile.y === 2)?.growthBonusMs).toBe(45_000);

    const harvested = { ...farm, plots: farm.plots.map((plot) => plot.x === 0 && plot.y === 2
      ? { ...plot, crop: "turnip" as const, plantedAt: now - 90_000 }
      : plot) };
    const harvestRun = createGardenAdventureRun(harvested, { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 }, now);
    const harvestOptions = {
      adventure: {
        seeds: harvested.seeds, richSoil: harvested.richSoil, wateringCan: harvested.wateringCan, now,
        availableCrops: getGardenAvailableCrops(harvested), harvestCapacity: 50, harvestedCount: 0, harvestYieldBonus: 1,
      },
    };
    const harvestExecution = executeGardenProgram("harvest()", createGardenAdventureMission(harvested, now), harvestRun, 200, [], harvestOptions);
    const nextFarm = applyGardenAdventureAction(harvested, harvestExecution.actions[0], harvestExecution.frames[0], now);
    expect(nextFarm.harvest.turnip).toBe(2);
    expect(harvestExecution.run.harvested).toBe(2);
    const fullBasketRun = createGardenAdventureRun(
      { ...harvested, harvest: { ...harvested.harvest, turnip: 50 } },
      { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
      now,
    );
    const fullBasket = executeGardenProgram(
      "harvest()",
      createGardenAdventureMission(harvested, now),
      fullBasketRun,
      200,
      [],
      { adventure: { ...harvestOptions.adventure, harvestedCount: 50, harvestCapacity: 50 } },
    );
    expect(fullBasket.message).toMatch(/basket is full/i);
    expect(fullBasket.actions).toHaveLength(0);

    const mainRun = createGardenAdventureRun(farm, { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 }, now);
    const moveOptions = {
      adventure: {
        seeds: farm.seeds, richSoil: farm.richSoil, wateringCan: farm.wateringCan, now,
        moveEnergyEvery: 2,
      },
    };
    const firstMove = executeGardenProgram('move("east")', createGardenAdventureMission(farm, now), mainRun, 200, [], moveOptions);
    farm = applyGardenAdventureAction(farm, firstMove.actions[0], firstMove.frames[0], now);
    expect(farm.energy).toBe(40);
    expect(farm.robotMovementProgress).toBe(1);
    const secondMove = executeGardenProgram('move("west")', createGardenAdventureMission(farm, now), createGardenAdventureRun(farm, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }, now), 200, [], moveOptions);
    farm = applyGardenAdventureAction(farm, secondMove.actions[0], secondMove.frames[0], now);
    expect(farm.energy).toBe(39);
    expect(farm.robotMovementProgress).toBe(0);

    farm = buyGardenSkill(farm, "field-survey");
    farm = buyGardenSkill(farm, "robot-blueprints");
    expect(() => buySecondGardenRobot({ ...farm, coins: GARDEN_SECOND_ROBOT_COST - 1 })).toThrow("costs");
    farm = buySecondGardenRobot({ ...farm, coins: GARDEN_SECOND_ROBOT_COST });
    expect(farm.secondRobot).toMatchObject({ x: farm.width - 1, y: farm.height - 1, energy: 60 });
    const assistantRun = createGardenAdventureRun(farm, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }, now, "assistant");
    expect(assistantRun.robot).toMatchObject({ x: farm.width - 1, y: farm.height - 1 });
    const assistantMovement = executeGardenProgram('move("west")', createGardenAdventureMission(farm, now), assistantRun, 200);
    const movedAssistant = applyGardenAdventureAction(farm, assistantMovement.actions[0], assistantMovement.frames[0], now, "assistant");
    expect(movedAssistant.secondRobot).toMatchObject({ x: farm.width - 2, y: farm.height - 1, energy: 59 });
    expect(movedAssistant.robot).toEqual(farm.robot);

    const savedState = await initializeCodeGarden();
    const withFarm = {
      ...savedState,
      completedMissionIds: GARDEN_MISSIONS.map((mission) => mission.id),
      adventure: movedAssistant,
    };
    await saveCodeGardenState(withFarm);
    expect(await db.codeGardenState.get("default")).toMatchObject({
      adventure: { secondRobot: { x: farm.width - 2, energy: 59 }, skillLevels: { "robot-blueprints": 1 } },
    });
  });

  it("normalizes older farm saves without resetting their existing crops or resources", () => {
    const current = createGardenAdventure(2);
    const legacy = {
      ...current,
      seeds: { turnip: 8, carrot: 4, berry: 2 },
      harvest: { turnip: 5, carrot: 1, berry: 0 },
      plots: current.plots.map((plot) => plot.x === 2 ? { ...plot, crop: "carrot" as const, plantedAt: 1 } : plot),
    } as unknown as GardenAdventureSave;
    expect(normalizeGardenAdventure(legacy)).toMatchObject({
      seeds: { turnip: 8, carrot: 4, berry: 2, pumpkin: 0 },
      harvest: { turnip: 5, carrot: 1, berry: 0, pumpkin: 0 },
      skillLevels: {},
      plots: legacy.plots,
    });
  });

  it("keeps movement counters bounded and repairs counters from older saves", () => {
    const now = 10_000;
    const source = Array.from({ length: 4 }, () => 'move("east")\nmove("west")').join("\n");
    const earth = createGardenAdventure(now);
    const earthRun = createGardenAdventureRun(earth, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }, now);
    const earthExecution = executeGardenProgram(
      source,
      createGardenAdventureMission(earth, now),
      earthRun,
      300,
      [],
      { adventure: { seeds: earth.seeds, richSoil: false, wateringCan: false, now } },
    );
    let updatedEarth = earth;
    earthExecution.actions.forEach((action, index) => {
      updatedEarth = applyGardenAdventureAction(updatedEarth, action, earthExecution.frames[index], now);
    });
    expect(updatedEarth.robotMovementProgress).toBe(0);
    expect(updatedEarth.energy).toBe(earth.energy - 8);

    const moon = unlockGardenMoonExpedition(earthFarmReadyForMoon());
    const moonRun = createGardenAdventureRun(moon, {
      plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12,
    }, now);
    const moonExecution = executeGardenProgram(
      source,
      createGardenAdventureMission(moon, now),
      moonRun,
      300,
      [],
      { adventure: {
        seeds: moon.moonFarm!.seeds,
        richSoil: false,
        wateringCan: false,
        isMoon: true,
        moonWater: moon.moonFarm!.water,
        now,
      } },
    );
    let updatedMoon = moon;
    moonExecution.actions.forEach((action, index) => {
      updatedMoon = applyGardenAdventureAction(updatedMoon, action, moonExecution.frames[index], now);
    });
    expect(updatedMoon.moonFarm?.robots.primary?.movementProgress).toBe(0);

    const malformedLegacy = {
      ...updatedMoon,
      robotMovementProgress: 8,
      secondRobot: { ...updatedMoon.secondRobot!, movementProgress: 7 },
      moonFarm: {
        ...updatedMoon.moonFarm!,
        robots: {
          primary: { ...updatedMoon.moonFarm!.robots.primary!, movementProgress: 6 },
          assistant: { ...updatedMoon.moonFarm!.robots.assistant!, movementProgress: 5 },
        },
      },
    };
    const normalized = normalizeGardenAdventure(malformedLegacy);
    expect(normalized).toMatchObject({
      robotMovementProgress: 0,
      secondRobot: { movementProgress: 0 },
      moonFarm: {
        robots: {
          primary: { movementProgress: 0 },
          assistant: { movementProgress: 0 },
        },
      },
    });
    expect(isCodeGardenState({
      id: "default",
      activeMissionId: GARDEN_MISSIONS[0].id,
      activeMode: "adventure",
      completedMissionIds: GARDEN_MISSIONS.map((mission) => mission.id),
      resources: { plants: 0, wood: 0, stone: 0, seeds: 4, energy: normalized.energy },
      upgrades: [],
      adventure: normalized,
      updatedAt: now,
    })).toBe(true);
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

  it("suggests Adventure crop parameters and exposes watering in the generated reference", () => {
    const adventure = createGardenAdventure();
    const mission = createGardenAdventureMission(adventure);
    expect(getGardenSuggestions("plant(", mission, 6, [], true).map((item) => item.insert))
      .toEqual(["turnip", "carrot", "berry"]);
    const pumpkinUnlocked = { ...adventure, skillLevels: { "soil-science": 1, "abundant-harvest": 1, "seed-diversity": 1 } };
    expect(getGardenSuggestions("plant(", mission, 6, [], true, getGardenAvailableCrops(pumpkinUnlocked)).map((item) => item.insert))
      .toContain("pumpkin");
    expect(getGardenSuggestions("plant(", GARDEN_MISSIONS[3]).map((item) => item.insert)).toEqual([]);
    expect(GARDEN_REFERENCE_ENTRIES.map((entry) => entry.id)).toContain("water");
  });

  it("saves editor changes without overwriting current garden progress", async () => {
    const initial = await initializeCodeGarden();
    const run = createGardenRun(GARDEN_MISSIONS[0]);
    await saveCodeGardenState({
      ...initial,
      activeMissionId: GARDEN_MISSIONS[0].id,
      completedMissionIds: [GARDEN_MISSIONS[0].id],
      resources: { ...initial.resources, plants: 3, energy: 16 },
      activeRun: {
        missionId: run.missionId,
        robot: run.robot,
        tiles: run.tiles,
        harvested: 1,
        collected: 0,
        steps: 3,
        completed: true,
        storageCapacity: run.storageCapacity,
      },
    });

    await saveCodeGardenProgram(GARDEN_MISSIONS[1].id, "repeat(3) { harvest() }");

    expect(await db.codeGardenState.get("default")).toMatchObject({
      completedMissionIds: [GARDEN_MISSIONS[0].id],
      resources: { plants: 3, energy: 16 },
      activeRun: { missionId: GARDEN_MISSIONS[0].id, steps: 3, completed: true },
      programs: { [GARDEN_MISSIONS[1].id]: "repeat(3) { harvest() }" },
    });
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
      signature: "ripe",
      detailKey: "codeLab.reference.valueGroups.tileKind",
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
      {
        insert: "move()",
        signature: "move(direction?)",
        detailKey: "codeLab.reference.entries.move.description",
      },
    ]);
    expect(getGardenSuggestions("re", GARDEN_MISSIONS[0])).toEqual([]);
    expect(getGardenSuggestions("re", GARDEN_MISSIONS[1]).some((item) => item.insert.startsWith("repeat"))).toBe(true);
  });

  it("suggests defined reusable functions with their callable signature", () => {
    const suggestions = getGardenSuggestions(
      "function harvest_row() { harvest() }\nhar",
      GARDEN_MISSIONS[3],
    );
    expect(suggestions).toContainEqual({
      insert: "harvest_row()",
      signature: "harvest_row()",
      detailKey: "codeLab.reference.suggestions.userFunction",
    });
  });

  it("suggests valid arguments and condition options at the actual cursor", () => {
    expect(getGardenSuggestions('move("e', GARDEN_MISSIONS[0]).map((item) => item.insert)).toEqual(["east"]);
    expect(getGardenSuggestions("move (e", GARDEN_MISSIONS[0]).map((item) => item.insert)).toEqual(["east"]);
    expect(getGardenSuggestions("turn(l", GARDEN_MISSIONS[0]).map((item) => item.insert)).toEqual(["left"]);
    expect(getGardenSuggestions("if (", GARDEN_MISSIONS[2]).map((item) => item.insert)).toEqual(['tile == "ripe"']);
    expect(getGardenSuggestions('if (tile_is("ri', GARDEN_MISSIONS[6], undefined, ["field-scanner"])
      .map((item) => item.insert)).toContain("ripe");
    expect(getGardenSuggestions("repeat (", GARDEN_MISSIONS[1]).map((item) => item.insert)).toEqual(["1", "2", "3"]);
    expect(getGardenSuggestions('move("east")\nha\nrvest()', GARDEN_MISSIONS[0], 15)
      .map((item) => item.insert)).toContain("harvest()");
  });

  it("derives reference command, sensor, and language entries from the engine registry", () => {
    const referenceIds = new Set(CODE_REFERENCE_ENTRIES.map((entry) => entry.id));
    for (const entry of GARDEN_REFERENCE_ENTRIES) expect(referenceIds.has(entry.id)).toBe(true);
    expect(CODE_REFERENCE_ENTRIES.find((entry) => entry.id === "move")).toMatchObject({
      signature: "move(direction?)",
      argumentValues: ["north", "south", "east", "west"],
    });
  });

  it("shows crop values for the active world in the command reference", () => {
    expect(getCodeReferenceEntries("moon", ["mooncap", "moonleaf"]).find((entry) => entry.id === "plant"))
      .toMatchObject({
        example: 'plant("mooncap")',
        argumentValues: ["mooncap", "moonleaf"],
      });
    expect(getCodeReferenceEntries("earth", ["turnip", "carrot"]).find((entry) => entry.id === "plant"))
      .toMatchObject({
        example: 'plant("turnip")',
        argumentValues: ["turnip", "carrot"],
      });
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
    expect(getGardenSuggestions("wa", mission, 2, ["solar-coil"])[0].detailKey)
      .toBe("codeLab.reference.entries.wait.description");
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
