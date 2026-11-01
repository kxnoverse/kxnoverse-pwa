import { db } from "./db";
import type {
  CodeGardenState,
  GardenAdventurePlot,
  GardenAdventureSave,
  GardenCropId,
  GardenCropType,
  GardenMoonCropId,
  GardenMoonFarmSave,
  GardenMoonSkillId,
  GardenRobotId,
  GardenSkillId,
  GardenWorldId,
} from "./db";

export type GardenTileKind = "soil" | "plant" | "ripe" | "stone" | "wood" | "empty";
export type GardenDirection = "north" | "east" | "south" | "west";
export type GardenActionName = "move" | "harvest" | "plant" | "collect" | "wait" | "turn" | "water";
export type GardenFeatureName = GardenActionName | "repeat" | "if" | "let" | "function" | "sensors";
export type GardenSensorName = "tile_is" | "energy_at_least" | "storage_has_room";
export const GARDEN_DIRECTIONS = ["north", "south", "east", "west"] as const satisfies readonly GardenDirection[];
export const GARDEN_TURN_DIRECTIONS = ["left", "right"] as const;
export const GARDEN_TILE_KINDS = ["soil", "plant", "ripe", "stone", "wood", "empty"] as const satisfies readonly GardenTileKind[];
export const GARDEN_STORAGE_RESOURCES = ["wood", "stone"] as const;
export const GARDEN_CROPS = {
  turnip: { seedCost: 15, seedPack: 3, sellPrice: 12, growMs: 90_000 },
  carrot: { seedCost: 30, seedPack: 3, sellPrice: 24, growMs: 240_000 },
  berry: { seedCost: 54, seedPack: 3, sellPrice: 45, growMs: 480_000 },
  pumpkin: { seedCost: 90, seedPack: 3, sellPrice: 74, growMs: 720_000 },
} as const satisfies Record<GardenCropId, { seedCost: number; seedPack: number; sellPrice: number; growMs: number }>;
export const GARDEN_MOON_CROPS = {
  mooncap: { seedCost: 24, seedPack: 3, sellPrice: 42, growMs: 180_000 },
  moonleaf: { seedCost: 38, seedPack: 3, sellPrice: 68, growMs: 300_000 },
  prismberry: { seedCost: 62, seedPack: 3, sellPrice: 112, growMs: 480_000 },
} as const satisfies Record<GardenMoonCropId, { seedCost: number; seedPack: number; sellPrice: number; growMs: number }>;
function isEarthCrop(crop: GardenCropType): crop is GardenCropId {
  return Object.hasOwn(GARDEN_CROPS, crop);
}
export const GARDEN_MOON_EXPEDITION_COST = 250;
export const GARDEN_MOON_WATER_COST = 20;
export const GARDEN_MOON_WATER_PACK = 4;
export const GARDEN_MOON_SKILLS = [
  { id: "cryoseeding", costs: [80, 160], requires: [] },
  { id: "ice-condenser", costs: [120], requires: [{ id: "cryoseeding", level: 1 }] },
  { id: "prism-grafting", costs: [180], requires: [{ id: "cryoseeding", level: 2 }] },
  { id: "gravity-treads", costs: [210], requires: [{ id: "ice-condenser", level: 1 }] },
  { id: "lunar-yield", costs: [250], requires: [{ id: "prism-grafting", level: 1 }] },
] as const satisfies readonly {
  id: GardenMoonSkillId;
  costs: readonly number[];
  requires: readonly { id: GardenMoonSkillId; level: number }[];
}[];
export type GardenMoonSkillDefinition = (typeof GARDEN_MOON_SKILLS)[number];
export const GARDEN_SECOND_ROBOT_COST = 380;
export const GARDEN_SKILLS = [
  { id: "soil-science", branch: "agriculture", costs: [60, 130], requires: [] },
  { id: "abundant-harvest", branch: "agriculture", costs: [150], requires: [{ id: "soil-science", level: 1 }] },
  { id: "seed-diversity", branch: "agriculture", costs: [240], requires: [{ id: "abundant-harvest", level: 1 }] },
  { id: "quick-steps", branch: "automation", costs: [75, 125], requires: [] },
  { id: "energy-economy", branch: "automation", costs: [150], requires: [{ id: "quick-steps", level: 2 }] },
  { id: "solar-routines", branch: "automation", costs: [210], requires: [{ id: "energy-economy", level: 1 }] },
  { id: "precision-nozzle", branch: "equipment", costs: [70], requires: [] },
  { id: "deep-pantry", branch: "equipment", costs: [120, 180], requires: [{ id: "precision-nozzle", level: 1 }] },
  { id: "seed-sorting", branch: "equipment", costs: [190], requires: [{ id: "deep-pantry", level: 2 }] },
  { id: "field-survey", branch: "expansion", costs: [100, 220], requires: [] },
  { id: "robot-blueprints", branch: "expansion", costs: [240], requires: [{ id: "field-survey", level: 1 }] },
] as const satisfies readonly {
  id: GardenSkillId;
  branch: "agriculture" | "automation" | "equipment" | "expansion";
  costs: readonly number[];
  requires: readonly { id: GardenSkillId; level: number }[];
}[];
export type GardenSkillDefinition = (typeof GARDEN_SKILLS)[number];

export interface GardenLanguageEntry {
  id: string;
  category: "command" | "language" | "sensor";
  feature: GardenFeatureName;
  signature: string;
  example: string;
  requirement: string;
  name?: GardenSensorName;
  requiresUpgrade?: string;
  argumentValues?: readonly string[];
  suggestedValues?: readonly string[];
}

export const GARDEN_COMMANDS = [
  { id: "move", category: "command", feature: "move", signature: "move(direction?)", example: 'move("east")', requirement: "first-harvest", argumentValues: GARDEN_DIRECTIONS },
  { id: "turn", category: "command", feature: "turn", signature: "turn(direction)", example: 'turn("left")', requirement: "first-harvest", argumentValues: GARDEN_TURN_DIRECTIONS },
  { id: "harvest", category: "command", feature: "harvest", signature: "harvest()", example: "harvest()", requirement: "first-harvest" },
  { id: "plant", category: "command", feature: "plant", signature: "plant(crop?)", example: 'plant("turnip")', requirement: "garden-routine", argumentValues: ["turnip", "carrot", "berry", "pumpkin"] },
  { id: "collect", category: "command", feature: "collect", signature: "collect()", example: "collect()", requirement: "garden-routine" },
  { id: "wait", category: "command", feature: "wait", signature: "wait()", example: "wait()", requirement: "garden-routine" },
  { id: "water", category: "command", feature: "water", signature: "water()", example: "water()", requirement: "garden-routine" },
] as const satisfies readonly GardenLanguageEntry[];

export const GARDEN_SENSORS = [
  { id: "tileSensor", name: "tile_is", category: "sensor", feature: "sensors", signature: "tile_is(kind)", example: 'if (tile_is("ripe")) { harvest() }', requirement: "field-scanner", requiresUpgrade: "field-scanner", argumentValues: GARDEN_TILE_KINDS },
  { id: "energySensor", name: "energy_at_least", category: "sensor", feature: "sensors", signature: "energy_at_least(amount)", example: "if (energy_at_least(2)) { wait() }", requirement: "field-scanner", requiresUpgrade: "field-scanner", suggestedValues: ["0", "1", "2", "3"] },
  { id: "storageSensor", name: "storage_has_room", category: "sensor", feature: "sensors", signature: "storage_has_room(resource)", example: 'if (storage_has_room("wood")) { collect() }', requirement: "field-scanner", requiresUpgrade: "field-scanner", argumentValues: GARDEN_STORAGE_RESOURCES },
] as const satisfies readonly GardenLanguageEntry[];

export const GARDEN_LANGUAGE_CONSTRUCTS = [
  { id: "repeat", category: "language", feature: "repeat", signature: "repeat(count) { ... }", example: 'repeat(3) { move("east") harvest() }', requirement: "repeat-the-row", suggestedValues: ["1", "2", "3"] },
  { id: "condition", category: "language", feature: "if", signature: "if (condition) { ... }", example: 'if (tile == "ripe") { harvest() }', requirement: "read-the-ground" },
  { id: "variable", category: "language", feature: "let", signature: "let name = number", example: "let cycles = 2", requirement: "seed-cycle" },
  { id: "function", category: "language", feature: "repeat", signature: "function name() { ... }", example: `function harvest_row() {
  repeat(3) {
    move("east")
    harvest()
  }
}
harvest_row()`, requirement: "garden-routine" },
] as const satisfies readonly GardenLanguageEntry[];

export const GARDEN_REFERENCE_ENTRIES: readonly GardenLanguageEntry[] = [
  ...GARDEN_COMMANDS,
  ...GARDEN_LANGUAGE_CONSTRUCTS,
  ...GARDEN_SENSORS,
];
export type GardenAction = { kind: GardenActionName; argument?: string };
export interface GardenTile {
  x: number;
  y: number;
  kind: GardenTileKind;
  growth?: number;
  crop?: GardenCropType;
  plantedAt?: number;
  growthBonusMs?: number;
  watered?: boolean;
}
export interface GardenDecision {
  actionIndex: number;
  sensor: GardenSensorName;
  argument: string | number;
  matched: boolean;
}
const MAX_GARDEN_STATEMENT_EXECUTIONS = 10_000;
export interface GardenRunStats {
  instructions: number;
  harvested: number;
  collected: number;
  energyConsumed: number;
  energyGenerated: number;
}
export interface GardenMission {
  id: string;
  concept: string;
  objective: string;
  hint: string;
  width: number;
  height: number;
  robot: { x: number; y: number; direction: GardenDirection };
  tiles: GardenTile[];
  goal: { kind: "harvest" | "collect"; count: number };
  reward: { plants?: number; wood?: number; stone?: number; seeds?: number; energy?: number };
  maxSteps: number;
  unlocks: GardenFeatureName[];
  requiresUpgrade?: string;
  energyBudget?: number;
  sensorTutorial?: boolean;
}
export interface GardenRunState {
  missionId: string;
  robot: { x: number; y: number; direction: GardenDirection };
  tiles: GardenTile[];
  resources: { plants: number; wood: number; stone: number; seeds: number; energy: number };
  harvested: number;
  collected: number;
  steps: number;
  completed: boolean;
  storageCapacity: number;
  movementProgress?: number;
}

export function gardenCoordinatesAtPoint(
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } | null {
  const deltaX = (point.x - 380) / 48;
  const deltaY = (point.y - 42) / 25;
  const x = Math.round((deltaX + deltaY) / 2);
  const y = Math.round((deltaY - deltaX) / 2);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  const centerX = 380 + (x - y) * 48;
  const centerY = 42 + (x + y) * 25;
  const tileDistance = Math.abs((point.x - centerX) / 48) + Math.abs((point.y - centerY) / 25);
  return tileDistance <= 1 ? { x, y } : null;
}

export const GARDEN_MISSIONS: GardenMission[] = [
  {
    id: "first-harvest", concept: "movement", objective: "Reach the ripe plant and harvest it.",
    hint: 'Use move("east") twice, then harvest().',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 2, y: 2, kind: "ripe" }], goal: { kind: "harvest", count: 1 },
    reward: { plants: 3, seeds: 2, energy: 4 }, maxSteps: 16, unlocks: ["move", "harvest", "turn"],
  },
  {
    id: "repeat-the-row", concept: "loops", objective: "Harvest all three plants in a straight row.",
    hint: "A repeat block runs its instructions more than once. Move, then harvest, inside the block.",
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 1, y: 2, kind: "ripe" }, { x: 2, y: 2, kind: "ripe" }, { x: 3, y: 2, kind: "ripe" }],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 5, seeds: 2, energy: 5 }, maxSteps: 24,
    unlocks: ["move", "harvest", "turn", "repeat"],
  },
  {
    id: "read-the-ground", concept: "conditions", objective: "Move east across the patch and harvest only ripe plants.",
    hint: 'Check the tile with if (tile == "ripe") { harvest() }. The stone is safe to leave alone.',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [{ x: 1, y: 2, kind: "ripe" }, { x: 2, y: 2, kind: "stone" }, { x: 3, y: 2, kind: "ripe" }],
    goal: { kind: "harvest", count: 2 }, reward: { plants: 6, wood: 2, stone: 2, energy: 6 }, maxSteps: 32,
    unlocks: ["move", "harvest", "turn", "repeat", "if"],
  },
  {
    id: "garden-routine", concept: "functions", objective: "Write a reusable harvest_row() routine and use it to collect the whole row.",
    hint: "Define function harvest_row() { ... } once, then call harvest_row() to run it.",
    width: 7, height: 5, robot: { x: 0, y: 1, direction: "east" },
    tiles: [{ x: 1, y: 1, kind: "ripe" }, { x: 2, y: 1, kind: "ripe" }, { x: 3, y: 1, kind: "ripe" }],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 8, wood: 3, stone: 2, energy: 8 }, maxSteps: 40,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait"],
  },
  {
    id: "seed-cycle", concept: "variables", objective: "Plant, grow, and harvest a crop using a named repeat count.",
    hint: "Set let cycles = 2, then use repeat(cycles) { ... } to repeat your plant-and-wait routine.",
    width: 7, height: 5, robot: { x: 2, y: 2, direction: "east" },
    tiles: [], goal: { kind: "harvest", count: 2 }, reward: { plants: 10, wood: 4, energy: 10 }, maxSteps: 48,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let"],
  },
  {
    id: "solar-relay", concept: "energy", objective: "Automate a long crop row with a limited energy reserve. Wait to recharge, then continue.",
    hint: "Your solar coil turns each wait() into energy. A repeat block can move and harvest each tile.",
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [1, 2, 3, 4].map((x) => ({ x, y: 2, kind: "ripe" as const })),
    goal: { kind: "harvest", count: 4 }, reward: { plants: 8, seeds: 3, energy: 6 }, maxSteps: 20,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let", "function"],
    requiresUpgrade: "solar-coil",
    energyBudget: 3,
  },
  {
    id: "sensor-sweep", concept: "sensors", objective: "Scan a mixed row and harvest only the ripe plants. Empty soil and stone are safe to pass.",
    hint: 'First try tile_is("ripe") in an if condition. It reads the tile under the robot and returns true or false.',
    width: 7, height: 5, robot: { x: 0, y: 2, direction: "east" },
    tiles: [
      { x: 1, y: 2, kind: "ripe" },
      { x: 2, y: 2, kind: "soil" },
      { x: 3, y: 2, kind: "ripe" },
      { x: 4, y: 2, kind: "stone" },
      { x: 5, y: 2, kind: "ripe" },
    ],
    goal: { kind: "harvest", count: 3 }, reward: { plants: 8, seeds: 2, energy: 5 }, maxSteps: 16,
    unlocks: ["move", "harvest", "turn", "repeat", "if", "plant", "collect", "wait", "let", "function", "sensors"],
    requiresUpgrade: "field-scanner",
    sensorTutorial: true,
  },
];

export const GARDEN_RESEARCH = [
  {
    id: "storehouse",
    prerequisiteMission: "read-the-ground",
    cost: { wood: 2, stone: 1 },
  },
  {
    id: "solar-coil",
    prerequisiteMission: "seed-cycle",
    cost: { wood: 3, stone: 2 },
  },
  {
    id: "field-scanner",
    prerequisiteMission: "solar-relay",
    cost: { wood: 2, stone: 1 },
  },
] as const;
export type GardenResearchId = (typeof GARDEN_RESEARCH)[number]["id"];

export const DEFAULT_GARDEN_STATE: CodeGardenState = {
  id: "default",
  activeMissionId: GARDEN_MISSIONS[0].id,
  completedMissionIds: [],
  resources: { plants: 0, wood: 0, stone: 0, seeds: 4, energy: 12 },
  upgrades: [],
  programs: {},
  updatedAt: 0,
};

export function isGardenAdventureUnlocked(completedMissionIds: readonly string[]): boolean {
  return GARDEN_MISSIONS.every((mission) => completedMissionIds.includes(mission.id));
}

export function isGardenMoonExpeditionReady(farm: GardenAdventureSave): boolean {
  return Boolean(
    farm.secondRobot &&
    farm.expansions >= 1 &&
    getGardenSkillLevel(farm, "seed-diversity") >= 1,
  );
}

export function getGardenSkillLevel(farm: GardenAdventureSave, skillId: GardenSkillId): number {
  return farm.skillLevels?.[skillId] ?? 0;
}

export function getGardenMoonSkillLevel(farm: GardenMoonFarmSave, skillId: GardenMoonSkillId): number {
  return farm.skills?.[skillId] ?? 0;
}

function normalizeGardenMovementProgress(progress: number | undefined, energyDiscountActive: boolean): number {
  return energyDiscountActive && progress === 1 ? 1 : 0;
}

export function getGardenAvailableCrops(farm: GardenAdventureSave): GardenCropId[] {
  return getGardenSkillLevel(farm, "seed-diversity") > 0
    ? Object.keys(GARDEN_CROPS) as GardenCropId[]
    : (Object.keys(GARDEN_CROPS).filter((crop) => crop !== "pumpkin") as GardenCropId[]);
}

export function getGardenMoonAvailableCrops(farm: GardenMoonFarmSave): GardenMoonCropId[] {
  return getGardenMoonSkillLevel(farm, "prism-grafting") > 0
    ? Object.keys(GARDEN_MOON_CROPS) as GardenMoonCropId[]
    : ["mooncap", "moonleaf"];
}

export function getGardenSeedPack(farm: GardenAdventureSave, crop: GardenCropId): number {
  return GARDEN_CROPS[crop].seedPack + (getGardenSkillLevel(farm, "seed-sorting") > 0 ? 2 : 0);
}

export function getGardenMoonWaterCapacity(farm: GardenMoonFarmSave): number {
  return 10 + getGardenMoonSkillLevel(farm, "ice-condenser") * 4;
}

export function createGardenMoonFarm(farm: GardenAdventureSave, now = Date.now()): GardenMoonFarmSave {
  const width = 6;
  const height = 5;
  return {
    width,
    height,
    robots: {
      primary: { x: 0, y: 2, direction: "east", movementProgress: 0 },
      ...(farm.secondRobot
        ? { assistant: { x: width - 1, y: height - 1, direction: "west", movementProgress: 0 } }
        : {}),
    },
    plots: Array.from({ length: width * height }, (_, index) => ({ x: index % width, y: Math.floor(index / width) })),
    seeds: { mooncap: 5, moonleaf: 3, prismberry: 0 },
    harvest: { mooncap: 0, moonleaf: 0, prismberry: 0 },
    skills: {},
    credits: 0,
    water: 10,
    expansions: 0,
    updatedAt: now,
  };
}

export function unlockGardenMoonExpedition(farm: GardenAdventureSave): GardenAdventureSave {
  if (farm.moonFarm) throw new Error("The lunar expedition is already unlocked.");
  if (!isGardenMoonExpeditionReady(farm)) {
    throw new Error("Expand your Earth farm, unlock Seed diversity, and build the assistant robot first.");
  }
  if (farm.coins < GARDEN_MOON_EXPEDITION_COST) {
    throw new Error(`The lunar expedition requires ${GARDEN_MOON_EXPEDITION_COST} Earth coins.`);
  }
  return {
    ...farm,
    coins: farm.coins - GARDEN_MOON_EXPEDITION_COST,
    activeWorld: "moon",
    moonFarm: createGardenMoonFarm(farm),
    updatedAt: Date.now(),
  };
}

export function travelGardenWorld(farm: GardenAdventureSave, world: GardenWorldId): GardenAdventureSave {
  if (world === "moon" && !farm.moonFarm) throw new Error("Unlock the lunar expedition before traveling to the Moon.");
  if ((farm.activeWorld ?? "earth") === world) return farm;
  return { ...farm, activeWorld: world, updatedAt: Date.now() };
}

export function normalizeGardenAdventure(farm: GardenAdventureSave): GardenAdventureSave {
  const savedSeeds: Partial<Record<GardenCropId, number>> = farm.seeds;
  const savedHarvest: Partial<Record<GardenCropId, number>> = farm.harvest;
  const earthEnergyDiscount = getGardenSkillLevel(farm, "energy-economy") > 0;
  const moonEnergyDiscount = farm.moonFarm && getGardenMoonSkillLevel(farm.moonFarm, "gravity-treads") > 0;
  return {
    ...farm,
    seeds: {
      turnip: savedSeeds.turnip ?? 0,
      carrot: savedSeeds.carrot ?? 0,
      berry: savedSeeds.berry ?? 0,
      pumpkin: savedSeeds.pumpkin ?? 0,
    },
    harvest: {
      turnip: savedHarvest.turnip ?? 0,
      carrot: savedHarvest.carrot ?? 0,
      berry: savedHarvest.berry ?? 0,
      pumpkin: savedHarvest.pumpkin ?? 0,
    },
    skillLevels: farm.skillLevels ?? {},
    robotMovementProgress: normalizeGardenMovementProgress(farm.robotMovementProgress, earthEnergyDiscount),
    activeRobot: farm.activeRobot ?? "primary",
    secondRobot: farm.secondRobot
      ? {
          ...farm.secondRobot,
          movementProgress: normalizeGardenMovementProgress(farm.secondRobot.movementProgress, earthEnergyDiscount),
        }
      : undefined,
    activeWorld: farm.moonFarm && farm.activeWorld === "moon" ? "moon" : "earth",
    moonFarm: farm.moonFarm ? {
      ...farm.moonFarm,
      robots: {
        primary: farm.moonFarm.robots?.primary
          ? {
              ...farm.moonFarm.robots.primary,
              movementProgress: normalizeGardenMovementProgress(
                farm.moonFarm.robots.primary.movementProgress,
                Boolean(moonEnergyDiscount),
              ),
            }
          : { x: 0, y: 2, direction: "east", movementProgress: 0 },
        ...(farm.secondRobot ? {
          assistant: farm.moonFarm.robots?.assistant
            ? {
                ...farm.moonFarm.robots.assistant,
                movementProgress: normalizeGardenMovementProgress(
                  farm.moonFarm.robots.assistant.movementProgress,
                  Boolean(moonEnergyDiscount),
                ),
              }
            : {
                x: farm.moonFarm.width - 1,
                y: farm.moonFarm.height - 1,
                direction: "west",
                movementProgress: 0,
              },
        } : {}),
      },
      seeds: {
        mooncap: farm.moonFarm.seeds?.mooncap ?? 0,
        moonleaf: farm.moonFarm.seeds?.moonleaf ?? 0,
        prismberry: farm.moonFarm.seeds?.prismberry ?? 0,
      },
      harvest: {
        mooncap: farm.moonFarm.harvest?.mooncap ?? 0,
        moonleaf: farm.moonFarm.harvest?.moonleaf ?? 0,
        prismberry: farm.moonFarm.harvest?.prismberry ?? 0,
      },
      skills: farm.moonFarm.skills ?? {},
      water: farm.moonFarm.water ?? 0,
    } : undefined,
  };
}

export function createGardenAdventure(now = Date.now()): GardenAdventureSave {
  const width = 6;
  const height = 5;
  return {
    width,
    height,
    robot: { x: 0, y: 2, direction: "east" },
    robotMovementProgress: 0,
    activeRobot: "primary",
    plots: Array.from({ length: width * height }, (_, index) => ({ x: index % width, y: Math.floor(index / width) })),
    seeds: { turnip: 5, carrot: 2, berry: 0, pumpkin: 0 },
    harvest: { turnip: 0, carrot: 0, berry: 0, pumpkin: 0 },
    coins: 30,
    energy: 40,
    richSoil: false,
    wateringCan: false,
    expansions: 0,
    skillLevels: {},
    updatedAt: now,
  };
}

export function getGardenCropProgress(
  plot: GardenAdventurePlot,
  now: number,
  richSoil = false,
  soilScienceLevel = 0,
): { stage: number; progress: number; ready: boolean } {
  if (!plot.crop || plot.plantedAt === undefined) return { stage: 0, progress: 0, ready: false };
  const duration = GARDEN_CROPS[plot.crop].growMs * (richSoil ? 0.8 : 1) * Math.max(0.7, 1 - soilScienceLevel * 0.1);
  const elapsed = Math.max(0, now - plot.plantedAt + (plot.growthBonusMs ?? 0));
  const progress = Math.min(1, elapsed / duration);
  return { stage: Math.min(4, Math.floor(progress * 4)), progress, ready: progress >= 1 };
}

export function getGardenMoonCropProgress(
  plot: NonNullable<GardenMoonFarmSave["plots"][number]>,
  now: number,
  farm: GardenMoonFarmSave,
): { stage: number; progress: number; ready: boolean } {
  if (!plot.crop || plot.plantedAt === undefined) return { stage: 0, progress: 0, ready: false };
  const speed = Math.max(0.65, 1 - getGardenMoonSkillLevel(farm, "cryoseeding") * 0.15);
  const duration = GARDEN_MOON_CROPS[plot.crop].growMs * (plot.watered ? 1 : 1.5) * speed;
  const elapsed = Math.max(0, now - plot.plantedAt + (plot.growthBonusMs ?? 0));
  const progress = Math.min(1, elapsed / duration);
  return { stage: Math.min(4, Math.floor(progress * 4)), progress, ready: progress >= 1 };
}

export function createGardenAdventureMission(farm: GardenAdventureSave, now = Date.now()): GardenMission {
  if ((farm.activeWorld ?? "earth") === "moon") {
    if (!farm.moonFarm) throw new Error("The lunar expedition is not unlocked.");
    const moon = farm.moonFarm;
    const robot = moon.robots.primary ?? { x: 0, y: 2, direction: "east" };
    return {
      id: "moon-adventure",
      concept: "moon-expedition",
      objective: "Grow alien crops with the lunar water supply.",
      hint: 'Use plant("mooncap") to spend one water unit, then return when it glows.',
      width: moon.width,
      height: moon.height,
      robot: { ...robot, direction: robot.direction as GardenDirection },
      tiles: moon.plots.map((plot): GardenTile => {
        if (!plot.crop) return { x: plot.x, y: plot.y, kind: "soil" };
        const progress = getGardenMoonCropProgress(plot, now, moon);
        return { ...plot, kind: progress.ready ? "ripe" : "plant", growth: progress.stage };
      }),
      goal: { kind: "harvest", count: 0 },
      reward: {},
      maxSteps: 300,
      unlocks: ["move", "harvest", "plant", "collect", "wait", "turn", "water", "repeat", "if", "let", "function", "sensors"],
    };
  }
  return {
    id: "garden-adventure",
    concept: "adventure",
    objective: "Grow, water, and harvest your own crops.",
    hint: 'Use plant("turnip") on soil, then come back when it is ripe.',
    width: farm.width,
    height: farm.height,
    robot: { ...farm.robot, direction: farm.robot.direction as GardenDirection },
    tiles: farm.plots.map((plot): GardenTile => {
      if (!plot.crop) return { x: plot.x, y: plot.y, kind: "soil" };
      const progress = getGardenCropProgress(plot, now, farm.richSoil, getGardenSkillLevel(farm, "soil-science"));
      return {
        ...plot,
        kind: progress.ready ? "ripe" : "plant",
        growth: progress.stage,
      };
    }),
    goal: { kind: "harvest", count: 0 },
    reward: {},
    maxSteps: 200,
    unlocks: ["move", "harvest", "plant", "collect", "wait", "turn", "water", "repeat", "if", "let", "function", "sensors"],
  };
}

export function createGardenAdventureRun(
  farm: GardenAdventureSave,
  resources: CodeGardenState["resources"],
  now = Date.now(),
  robotId: GardenRobotId = farm.activeRobot ?? "primary",
): GardenRunState {
  const inMoon = (farm.activeWorld ?? "earth") === "moon";
  const moon = farm.moonFarm;
  const seeds = Object.values(inMoon && moon ? moon.seeds : farm.seeds).reduce((total, count) => total + count, 0);
  const run = createGardenRun(createGardenAdventureMission(farm, now), {
    ...resources,
    seeds,
    energy: robotId === "assistant" ? farm.secondRobot?.energy ?? 0 : farm.energy,
  });
  const robot = inMoon && moon
    ? moon.robots[robotId] ?? (robotId === "assistant" && farm.secondRobot
      ? { x: moon.width - 1, y: moon.height - 1, direction: "west" }
      : { x: 0, y: 2, direction: "east" })
    : robotId === "assistant" && farm.secondRobot ? farm.secondRobot : farm.robot;
  return {
    ...run,
    robot: { x: robot.x, y: robot.y, direction: robot.direction as GardenDirection },
    storageCapacity: 20 + getGardenSkillLevel(farm, "deep-pantry") * 15,
    movementProgress: inMoon
      ? moon?.robots[robotId]?.movementProgress ?? 0
      : robotId === "assistant" ? farm.secondRobot?.movementProgress ?? 0 : farm.robotMovementProgress ?? 0,
  };
}

export function applyGardenAdventureAction(
  farm: GardenAdventureSave,
  action: GardenAction,
  frame: GardenRunState,
  now = Date.now(),
  robotId: GardenRobotId = farm.activeRobot ?? "primary",
): GardenAdventureSave {
  const changedPlot = action.kind === "plant" || action.kind === "water" || action.kind === "harvest";
  const x = frame.robot.x;
  const y = frame.robot.y;
  if ((farm.activeWorld ?? "earth") === "moon") {
    const moon = farm.moonFarm;
    if (!moon) throw new Error("The lunar expedition is not unlocked.");
    const before = changedPlot ? moon.plots.find((plot) => plot.x === x && plot.y === y) : undefined;
    const frameTile = changedPlot ? frame.tiles.find((tile) => tile.x === x && tile.y === y) : undefined;
    const harvest = { ...moon.harvest };
    if (action.kind === "harvest" && before?.crop) {
      harvest[before.crop] += 1 + getGardenMoonSkillLevel(moon, "lunar-yield");
    }
    const plots = changedPlot && frameTile
      ? moon.plots.map((plot) => plot.x !== x || plot.y !== y
        ? plot
        : frameTile.crop
          ? {
              x,
              y,
              crop: frameTile.crop as GardenMoonCropId,
              plantedAt: frameTile.plantedAt ?? now,
              growthBonusMs: frameTile.growthBonusMs ?? 0,
              watered: frameTile.watered ?? false,
            }
          : { x, y })
      : moon.plots;
    const seeds = action.kind === "plant" && frameTile?.crop
      ? { ...moon.seeds, [frameTile.crop]: moon.seeds[frameTile.crop as GardenMoonCropId] - 1 }
      : moon.seeds;
    const robotPosition = {
      x,
      y,
      direction: frame.robot.direction,
      movementProgress: frame.movementProgress ?? 0,
    };
    const nextMoon = {
      ...moon,
      plots,
      harvest,
      seeds,
      water: moon.water - (action.kind === "plant" || action.kind === "water" ? 1 : 0),
      robots: { ...moon.robots, [robotId]: robotPosition },
      updatedAt: now,
    };
    return {
      ...farm,
      ...(robotId === "assistant" && farm.secondRobot
        ? { secondRobot: { ...farm.secondRobot, energy: frame.resources.energy } }
        : { energy: frame.resources.energy }),
      moonFarm: nextMoon,
      updatedAt: now,
    };
  }
  const before = changedPlot ? farm.plots.find((plot) => plot.x === x && plot.y === y) : undefined;
  const frameTile = changedPlot ? frame.tiles.find((tile) => tile.x === x && tile.y === y) : undefined;
  if ((action.kind === "plant" || action.kind === "water" || action.kind === "harvest") &&
    frameTile?.crop && !isEarthCrop(frameTile.crop)) {
    throw new Error("A lunar crop cannot be applied to the Earth farm.");
  }
  const harvest = { ...farm.harvest };
  if (action.kind === "harvest" && before?.crop) {
    harvest[before.crop] += 1 + getGardenSkillLevel(farm, "abundant-harvest");
  }
  const plots = changedPlot && frameTile
    ? farm.plots.map((plot) => plot.x !== x || plot.y !== y
      ? plot
      : frameTile.crop
        ? {
            x,
            y,
            crop: frameTile.crop as GardenCropId,
            plantedAt: frameTile.plantedAt ?? now,
            growthBonusMs: frameTile.growthBonusMs ?? 0,
            watered: frameTile.watered ?? false,
          }
        : { x, y })
    : farm.plots;
  const seeds = action.kind === "plant" && frameTile?.crop
    ? { ...farm.seeds, [frameTile.crop as GardenCropId]: farm.seeds[frameTile.crop as GardenCropId] - 1 }
    : farm.seeds;
  const robot = { ...frame.robot };
  const movementProgress = frame.movementProgress ?? 0;
  const nextFarm = {
    ...farm,
    plots,
    harvest,
    seeds,
    ...(robotId === "assistant" && farm.secondRobot
      ? { secondRobot: { ...farm.secondRobot, ...robot, energy: frame.resources.energy, movementProgress } }
      : { robot, energy: frame.resources.energy, robotMovementProgress: movementProgress }),
    updatedAt: now,
  };
  return nextFarm;
}

export function buyGardenSeeds(farm: GardenAdventureSave, crop: GardenCropId): GardenAdventureSave {
  const item = GARDEN_CROPS[crop];
  if (!getGardenAvailableCrops(farm).includes(crop)) throw new Error("Unlock seed diversity before buying pumpkin seeds.");
  if (farm.coins < item.seedCost) throw new Error("Not enough coins for those seeds.");
  return {
    ...farm,
    coins: farm.coins - item.seedCost,
    seeds: { ...farm.seeds, [crop]: farm.seeds[crop] + getGardenSeedPack(farm, crop) },
    updatedAt: Date.now(),
  };
}

export function sellGardenHarvest(farm: GardenAdventureSave): GardenAdventureSave {
  const earnings = (Object.keys(GARDEN_CROPS) as GardenCropId[])
    .reduce((total, crop) => total + farm.harvest[crop] * GARDEN_CROPS[crop].sellPrice, 0);
  if (earnings === 0) throw new Error("Harvest something before visiting the market.");
  return {
    ...farm,
    coins: farm.coins + earnings,
    harvest: { turnip: 0, carrot: 0, berry: 0, pumpkin: 0 },
    updatedAt: Date.now(),
  };
}

export function buyGardenMoonSeeds(farm: GardenMoonFarmSave, crop: GardenMoonCropId): GardenMoonFarmSave {
  const item = GARDEN_MOON_CROPS[crop];
  if (!getGardenMoonAvailableCrops(farm).includes(crop)) {
    throw new Error("Unlock Prism grafting before buying prismberry seeds.");
  }
  if (farm.credits < item.seedCost) throw new Error("Not enough lunar credits for those seeds.");
  return {
    ...farm,
    credits: farm.credits - item.seedCost,
    seeds: { ...farm.seeds, [crop]: farm.seeds[crop] + item.seedPack },
    updatedAt: Date.now(),
  };
}

export function sellGardenMoonHarvest(farm: GardenMoonFarmSave): GardenMoonFarmSave {
  const earnings = (Object.keys(GARDEN_MOON_CROPS) as GardenMoonCropId[])
    .reduce((total, crop) => total + farm.harvest[crop] * GARDEN_MOON_CROPS[crop].sellPrice, 0);
  if (earnings === 0) throw new Error("Harvest alien crops before visiting the lunar market.");
  return {
    ...farm,
    credits: farm.credits + earnings,
    harvest: { mooncap: 0, moonleaf: 0, prismberry: 0 },
    updatedAt: Date.now(),
  };
}

export function refillGardenMoonWater(farm: GardenMoonFarmSave): GardenMoonFarmSave {
  const capacity = getGardenMoonWaterCapacity(farm);
  if (farm.water >= capacity) throw new Error("The lunar reservoir is already full.");
  if (farm.credits < GARDEN_MOON_WATER_COST) throw new Error("Not enough lunar credits to refill the reservoir.");
  return {
    ...farm,
    credits: farm.credits - GARDEN_MOON_WATER_COST,
    water: Math.min(capacity, farm.water + GARDEN_MOON_WATER_PACK),
    updatedAt: Date.now(),
  };
}

export function expandGardenMoonFarm(farm: GardenMoonFarmSave): GardenMoonFarmSave {
  if (farm.expansions >= 4) throw new Error("The lunar farm has reached its current size limit.");
  const cost = 80 + farm.expansions * 60;
  if (farm.credits < cost) throw new Error("Not enough lunar credits to expand the farm.");
  const width = farm.width + 2;
  const existing = new Set(farm.plots.map((plot) => `${plot.x}:${plot.y}`));
  const added = Array.from({ length: farm.height * width }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
  })).filter((plot) => !existing.has(`${plot.x}:${plot.y}`));
  return {
    ...farm,
    width,
    plots: [...farm.plots, ...added],
    expansions: farm.expansions + 1,
    credits: farm.credits - cost,
    updatedAt: Date.now(),
  };
}

export function buyGardenMoonSkill(farm: GardenMoonFarmSave, skillId: GardenMoonSkillId): GardenMoonFarmSave {
  const skill = GARDEN_MOON_SKILLS.find((entry) => entry.id === skillId);
  if (!skill) throw new Error("That lunar skill is not available.");
  const level = getGardenMoonSkillLevel(farm, skillId);
  const cost = skill.costs[level];
  if (cost === undefined) throw new Error("This lunar skill is already at its maximum level.");
  for (const requirement of skill.requires) {
    if (getGardenMoonSkillLevel(farm, requirement.id) < requirement.level) {
      throw new Error("Unlock the connected lunar prerequisite first.");
    }
  }
  if (farm.credits < cost) throw new Error(`This lunar skill costs ${cost} credits.`);
  return {
    ...farm,
    credits: farm.credits - cost,
    skills: { ...farm.skills, [skillId]: level + 1 },
    updatedAt: Date.now(),
  };
}

export function buyGardenUpgrade(farm: GardenAdventureSave, upgrade: "richSoil" | "wateringCan"): GardenAdventureSave {
  if (farm[upgrade]) throw new Error("You already own that farm upgrade.");
  const cost = upgrade === "richSoil" ? 60 : 45;
  if (farm.coins < cost) throw new Error("Not enough coins for that upgrade.");
  return { ...farm, [upgrade]: true, coins: farm.coins - cost, updatedAt: Date.now() };
}

export function expandGarden(farm: GardenAdventureSave): GardenAdventureSave {
  const expansionLimit = 4 + getGardenSkillLevel(farm, "field-survey");
  if (farm.expansions >= expansionLimit) throw new Error("Your garden has reached its current size limit.");
  const cost = 50 + farm.expansions * 35;
  if (farm.coins < cost) throw new Error("Not enough coins to expand the garden.");
  const width = farm.width + 2;
  const existing = new Set(farm.plots.map((plot) => `${plot.x}:${plot.y}`));
  const added = Array.from({ length: farm.height * width }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
  })).filter((plot) => !existing.has(`${plot.x}:${plot.y}`));
  return {
    ...farm,
    width,
    plots: [...farm.plots, ...added],
    expansions: farm.expansions + 1,
    coins: farm.coins - cost,
    updatedAt: Date.now(),
  };
}

export function buyGardenSkill(farm: GardenAdventureSave, skillId: GardenSkillId): GardenAdventureSave {
  const skill = GARDEN_SKILLS.find((entry) => entry.id === skillId);
  if (!skill) throw new Error("That farming skill is not available.");
  const level = getGardenSkillLevel(farm, skillId);
  const cost = skill.costs[level];
  if (cost === undefined) throw new Error("This farming skill is already at its maximum level.");
  for (const requirement of skill.requires) {
    if (getGardenSkillLevel(farm, requirement.id) < requirement.level) {
      throw new Error("Unlock the connected prerequisite skill first.");
    }
  }
  if (farm.coins < cost) throw new Error(`This skill costs ${cost} coins.`);
  return {
    ...farm,
    coins: farm.coins - cost,
    skillLevels: { ...farm.skillLevels, [skillId]: level + 1 },
    updatedAt: Date.now(),
  };
}

export function buySecondGardenRobot(farm: GardenAdventureSave): GardenAdventureSave {
  if (getGardenSkillLevel(farm, "robot-blueprints") < 1) {
    throw new Error("Unlock the robot blueprints skill before purchasing another robot.");
  }
  if (farm.secondRobot) throw new Error("Your assistant robot is already on the farm.");
  if (farm.coins < GARDEN_SECOND_ROBOT_COST) throw new Error(`The assistant robot costs ${GARDEN_SECOND_ROBOT_COST} coins.`);
  return {
    ...farm,
    coins: farm.coins - GARDEN_SECOND_ROBOT_COST,
    secondRobot: {
      x: farm.width - 1,
      y: farm.height - 1,
      direction: "west",
      energy: 60,
      movementProgress: 0,
    },
    moonFarm: farm.moonFarm
      ? {
          ...farm.moonFarm,
          robots: {
            ...farm.moonFarm.robots,
            assistant: {
              x: farm.moonFarm.width - 1,
              y: farm.moonFarm.height - 1,
              direction: "west",
              movementProgress: 0,
            },
          },
        }
      : undefined,
    updatedAt: Date.now(),
  };
}

type Token = { value: string; line: number; column: number };
type Expression = { kind: "number"; value: number } | { kind: "variable"; name: string };
type GardenCondition =
  | { kind: "tile"; expected: GardenTileKind }
  | { kind: "sensor"; name: "tile_is"; argument: GardenTileKind }
  | { kind: "sensor"; name: "energy_at_least"; argument: number }
  | { kind: "sensor"; name: "storage_has_room"; argument: "wood" | "stone" };
type Statement =
  | { kind: "call"; name: string; argument?: string }
  | { kind: "repeat"; count: Expression; body: Statement[] }
  | { kind: "if"; condition: GardenCondition; body: Statement[]; otherwise: Statement[] }
  | { kind: "let"; name: string; value: number }
  | { kind: "function"; name: string; body: Statement[] };
type Program = Statement[];

export class GardenLanguageError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(message);
    this.name = "GardenLanguageError";
  }
}

function tokenize(source: string): Token[] {
  if (source.length > 12_000) throw new GardenLanguageError("Program is too long (12,000 characters maximum).", 1, 1);
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  while (index < source.length) {
    const character = source[index];
    if (character === "\n") { line += 1; column = 1; index += 1; continue; }
    if (/\s/.test(character)) { index += 1; column += 1; continue; }
    if (character === "#") {
      while (index < source.length && source[index] !== "\n") { index += 1; column += 1; }
      continue;
    }
    const startColumn = column;
    const start = index;
    if (/[A-Za-z_]/.test(character)) {
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) { index += 1; column += 1; }
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    if (/\d/.test(character)) {
      while (index < source.length && /\d/.test(source[index])) { index += 1; column += 1; }
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    if (character === '"' || character === "'") {
      index += 1;
      column += 1;
      while (index < source.length && source[index] !== character && source[index] !== "\n") { index += 1; column += 1; }
      if (source[index] !== character) throw new GardenLanguageError("Close this text value with a matching quote.", line, startColumn);
      index += 1;
      column += 1;
      tokens.push({ value: source.slice(start, index), line, column: startColumn });
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (pair === "==") { tokens.push({ value: pair, line, column }); index += 2; column += 2; continue; }
    if ("{}(),;=".includes(character)) { tokens.push({ value: character, line, column }); index += 1; column += 1; continue; }
    throw new GardenLanguageError(`I do not recognize "${character}".`, line, column);
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Program { return this.block(false); }

  private peek(): Token | undefined { return this.tokens[this.index]; }
  private consume(): Token {
    const token = this.peek();
    if (!token) throw new GardenLanguageError("The program ended before this statement was complete.", 1, 1);
    this.index += 1;
    return token;
  }
  private accept(value: string): boolean {
    if (this.peek()?.value !== value) return false;
    this.index += 1;
    return true;
  }
  private expect(value: string): Token {
    const token = this.peek();
    if (!token || token.value !== value) throw new GardenLanguageError(`Expected "${value}".`, token?.line ?? 1, token?.column ?? 1);
    return this.consume();
  }
  private identifier(): Token {
    const token = this.consume();
    if (!/^[A-Za-z_]\w*$/.test(token.value)) throw new GardenLanguageError("Expected a name here.", token.line, token.column);
    return token;
  }
  private expression(): Expression {
    const token = this.consume();
    if (/^\d+$/.test(token.value)) return { kind: "number", value: Number(token.value) };
    if (/^[A-Za-z_]\w*$/.test(token.value)) return { kind: "variable", name: token.value };
    throw new GardenLanguageError("Use a number or a variable name here.", token.line, token.column);
  }
  private block(braced: boolean): Program {
    const statements: Program = [];
    if (braced) this.expect("{");
    while (this.peek() && (!braced || this.peek()?.value !== "}")) {
      statements.push(this.statement());
      if (statements.length > 500) throw new GardenLanguageError("This block has too many statements.", this.peek()?.line ?? 1, this.peek()?.column ?? 1);
      this.accept(";");
    }
    if (braced) this.expect("}");
    return statements;
  }
  private statement(): Statement {
    const token = this.consume();
    if (token.value === "let") {
      const name = this.identifier();
      this.expect("=");
      const value = this.consume();
      if (!/^\d+$/.test(value.value)) throw new GardenLanguageError("Variables currently hold whole numbers.", value.line, value.column);
      return { kind: "let", name: name.value, value: Number(value.value) };
    }
    if (token.value === "repeat") {
      this.expect("(");
      const count = this.expression();
      this.expect(")");
      return { kind: "repeat", count, body: this.block(true) };
    }
    if (token.value === "if") {
      this.expect("(");
      const sensed = this.consume();
      let condition: GardenCondition;
      if (sensed.value === "tile") {
        this.expect("==");
        const expected = this.consume();
        const value = expected.value.replace(/^["']|["']$/g, "");
        if (!GARDEN_TILE_KINDS.includes(value as GardenTileKind)) {
          throw new GardenLanguageError("That is not a tile kind the robot can sense.", expected.line, expected.column);
        }
        condition = { kind: "tile", expected: value as GardenTileKind };
      } else {
        const sensors = GARDEN_SENSORS.map((sensor) => sensor.name);
        if (!sensors.includes(sensed.value as GardenSensorName)) {
          throw new GardenLanguageError(`Unknown sensor "${sensed.value}". Use tile_is, energy_at_least, or storage_has_room.`, sensed.line, sensed.column);
        }
        const name = sensed.value as GardenSensorName;
        const definition: GardenLanguageEntry | undefined = GARDEN_SENSORS.find((sensor) => sensor.name === name);
        if (!definition) throw new GardenLanguageError(`Unknown sensor "${name}".`, sensed.line, sensed.column);
        this.expect("(");
        const argument = this.consume();
        if (name === "energy_at_least") {
          if (!/^\d+$/.test(argument.value)) {
            throw new GardenLanguageError("energy_at_least() needs a whole-number energy amount.", argument.line, argument.column);
          }
          condition = { kind: "sensor", name, argument: Number(argument.value) };
        } else {
          const value = argument.value.replace(/^["']|["']$/g, "");
          const validValues = definition.argumentValues ?? [];
          if (!validValues.includes(value)) {
            throw new GardenLanguageError(
              name === "tile_is"
                ? "tile_is() needs a tile kind: soil, plant, ripe, stone, wood, or empty."
                : 'storage_has_room() needs "wood" or "stone".',
              argument.line,
              argument.column,
            );
          }
          condition = name === "tile_is"
            ? { kind: "sensor", name, argument: value as GardenTileKind }
            : { kind: "sensor", name, argument: value as "wood" | "stone" };
        }
        this.expect(")");
      }
      this.expect(")");
      const body = this.block(true);
      const otherwise = this.accept("else") ? this.block(true) : [];
      return { kind: "if", condition, body, otherwise };
    }
    if (token.value === "function") {
      const name = this.identifier();
      this.expect("(");
      this.expect(")");
      return { kind: "function", name: name.value, body: this.block(true) };
    }
    if (!/^[A-Za-z_]\w*$/.test(token.value)) throw new GardenLanguageError("Expected a command or programming statement.", token.line, token.column);
    const name = token.value;
    this.expect("(");
    let argument: string | undefined;
    if (!this.accept(")")) {
      const value = this.consume();
      argument = value.value.replace(/^["']|["']$/g, "");
      this.expect(")");
    }
    return { kind: "call", name, argument };
  }
}

export function parseGardenProgram(source: string): Program {
  return new Parser(tokenize(source)).parse();
}

export function createGardenRun(mission: GardenMission, resources = DEFAULT_GARDEN_STATE.resources, upgrades: string[] = []): GardenRunState {
  const bonusCapacity = upgrades.includes("storehouse") ? 8 : 0;
  const stored = { ...DEFAULT_GARDEN_STATE.resources, ...resources };
  const capacity = 12 + bonusCapacity;
  return {
    missionId: mission.id,
    robot: { ...mission.robot },
    tiles: Array.from({ length: mission.width * mission.height }, (_, index) => {
      const x = index % mission.width;
      const y = Math.floor(index / mission.width);
      return mission.tiles.find((tile) => tile.x === x && tile.y === y) ?? { x, y, kind: "soil" as const };
    }),
    resources: {
      plants: Math.min(capacity, stored.plants),
      wood: Math.min(capacity, stored.wood),
      stone: Math.min(capacity, stored.stone),
      seeds: stored.seeds,
      energy: mission.energyBudget === undefined ? stored.energy : Math.min(stored.energy, mission.energyBudget),
    },
    harvested: 0,
    collected: 0,
    steps: 0,
    completed: false,
    storageCapacity: capacity,
  };
}

export interface GardenExecution {
  run: GardenRunState;
  actions: GardenAction[];
  frames: GardenRunState[];
  decisions: GardenDecision[];
  message: string;
  unlocks: GardenFeatureName[];
  stats: GardenRunStats;
}

export interface GardenExecutionOptions {
  adventure?: {
    seeds: Partial<Record<GardenCropType, number>>;
    richSoil: boolean;
    wateringCan: boolean;
    now: number;
    availableCrops?: readonly GardenCropType[];
    harvestCapacity?: number;
    harvestedCount?: number;
    harvestYieldBonus?: number;
    wateringGrowthFraction?: number;
    moveEnergyEvery?: number;
    waitEnergyGain?: number;
    isMoon?: boolean;
    moonWater?: number;
  };
}

export function executeGardenProgram(
  source: string,
  mission: GardenMission,
  startingRun: GardenRunState,
  maxActions = mission.maxSteps,
  upgrades: readonly string[] = [],
  options: GardenExecutionOptions = {},
): GardenExecution {
  const ast = parseGardenProgram(source);
  const functions = new Map<string, Statement[]>();
  const program: Statement[] = [];
  for (const statement of ast) {
    if (statement.kind === "function") {
      if (functions.has(statement.name)) throw new GardenLanguageError(`Function "${statement.name}" is defined twice.`, 1, 1);
      functions.set(statement.name, statement.body);
    } else program.push(statement);
  }
  const run: GardenRunState = {
    ...startingRun,
    robot: { ...startingRun.robot },
    tiles: startingRun.tiles.map((tile) => ({ ...tile })),
    resources: { ...startingRun.resources },
    completed: false,
    storageCapacity: startingRun.storageCapacity,
  };
  const actions: GardenAction[] = [];
  const frames: GardenRunState[] = [];
  const decisions: GardenDecision[] = [];
  let energyConsumed = 0;
  let energyGenerated = 0;
  const variables = new Map<string, number>();
  const callStack: string[] = [];
  const permitted = new Set<GardenFeatureName>(mission.unlocks);
  const adventureSeeds = options.adventure ? { ...options.adventure.seeds } : undefined;
  let moonWater = options.adventure?.moonWater ?? 0;
  let harvestCount = options.adventure?.harvestedCount ?? 0;
  let movementProgress = run.movementProgress ?? 0;
  let evaluatedStatements = 0;
  const tileAtRobot = () => run.tiles.find((tile) => tile.x === run.robot.x && tile.y === run.robot.y)!;
  const runBlock = (statements: Statement[], depth: number): void => {
    if (depth > 12) throw new Error("Program nesting is too deep (maximum 12).");
    for (const statement of statements) {
      evaluatedStatements += 1;
      if (evaluatedStatements > MAX_GARDEN_STATEMENT_EXECUTIONS) {
        throw new Error(`Instruction limit reached (${MAX_GARDEN_STATEMENT_EXECUTIONS} statements).`);
      }
      if (statement.kind === "function") continue;
      if (statement.kind === "let") {
        if (!permitted.has("let")) throw new Error("Variables unlock in a later mission.");
        variables.set(statement.name, statement.value);
        continue;
      }
      if (statement.kind === "repeat") {
        if (!permitted.has("repeat")) throw new Error("Loops unlock after the first mission.");
        const count = statement.count.kind === "number" ? statement.count.value : variables.get(statement.count.name);
        if (count === undefined) {
          const name = statement.count.kind === "variable" ? statement.count.name : "value";
          throw new Error(`Variable "${name}" has not been set.`);
        }
        if (count < 0 || count > 100) throw new Error("A repeat count must be between 0 and 100.");
        for (let index = 0; index < count; index += 1) runBlock(statement.body, depth + 1);
        continue;
      }
      if (statement.kind === "if") {
        if (!permitted.has("if")) throw new Error("Conditions unlock after the second mission.");
        let matches: boolean;
        if (statement.condition.kind === "tile") {
          matches = tileAtRobot().kind === statement.condition.expected;
        } else {
          if (!permitted.has("sensors") || !upgrades.includes("field-scanner")) {
            throw new Error("Environmental sensors require the Field scanner research.");
          }
          const { name, argument } = statement.condition;
          if (name === "tile_is") {
            matches = tileAtRobot().kind === argument;
          } else if (name === "energy_at_least") {
            matches = run.resources.energy >= argument;
          } else {
            matches = run.resources[argument] < run.storageCapacity;
          }
          decisions.push({ actionIndex: actions.length, sensor: name, argument, matched: matches });
        }
        runBlock(matches ? statement.body : statement.otherwise, depth + 1);
        continue;
      }
      if (functions.has(statement.name)) {
        if (!permitted.has("repeat")) throw new Error("Reusable functions unlock in a later mission.");
        if (callStack.includes(statement.name)) throw new Error("A function cannot call itself in this version.");
        if (callStack.length >= 8) throw new Error("Function calls are nested too deeply.");
        callStack.push(statement.name);
        runBlock(functions.get(statement.name)!, depth + 1);
        callStack.pop();
        continue;
      }
      if (!permitted.has(statement.name as GardenFeatureName)) {
        throw new Error(`"${statement.name}" is not unlocked in this mission.`);
      }
      if (!GARDEN_COMMANDS.some((command) => command.id === statement.name)) {
        throw new Error(`I do not know the command "${statement.name}".`);
      }
      if (actions.length >= maxActions) throw new Error(`Program limit reached (${maxActions} actions). Shorten the program and run it again.`);
      const action = { kind: statement.name as GardenActionName, argument: statement.argument } satisfies GardenAction;
      if (action.kind === "move") {
        const direction = action.argument ?? run.robot.direction;
        if (!GARDEN_DIRECTIONS.includes(direction as (typeof GARDEN_DIRECTIONS)[number])) throw new Error('move() needs "north", "east", "south", or "west".');
        const delta = direction === "north" ? [0, -1] : direction === "east" ? [1, 0] : direction === "south" ? [0, 1] : [-1, 0];
        const missionWidth = mission.width;
        const x = run.robot.x + delta[0];
        const y = run.robot.y + delta[1];
        if (x < 0 || x >= missionWidth || y < 0 || y >= mission.height) throw new Error("The robot reached the edge of this garden.");
        const moveEnergyEvery = options.adventure?.moveEnergyEvery;
        const nextMovementProgress = movementProgress + 1;
        const energyCost = moveEnergyEvery
          ? nextMovementProgress >= moveEnergyEvery ? 1 : 0
          : 1;
        if (run.resources.energy < energyCost) throw new Error("The robot needs more energy to keep moving.");
        run.robot = { ...run.robot, x, y, direction: direction as GardenDirection };
        run.resources.energy -= energyCost;
        energyConsumed += energyCost;
        movementProgress = moveEnergyEvery
          ? nextMovementProgress >= moveEnergyEvery ? 0 : nextMovementProgress
          : 0;
        run.movementProgress = movementProgress;
      } else if (action.kind === "turn") {
        if (!GARDEN_TURN_DIRECTIONS.includes(action.argument as (typeof GARDEN_TURN_DIRECTIONS)[number])) throw new Error('turn() needs "left" or "right".');
        const directions: GardenDirection[] = ["north", "east", "south", "west"];
        const current = directions.indexOf(run.robot.direction);
        run.robot.direction = directions[(current + (action.argument === "right" ? 1 : 3)) % directions.length];
      } else if (action.kind === "harvest") {
        const tile = tileAtRobot();
        if (tile.kind !== "ripe") throw new Error("There is no ripe crop under the robot. Move to a ripe plant first.");
        const yieldCount = 1 + (options.adventure?.harvestYieldBonus ?? 0);
        if (options.adventure?.harvestCapacity !== undefined &&
          harvestCount + yieldCount > options.adventure.harvestCapacity) {
          throw new Error("Your harvest basket is full. Sell crops or improve your storage.");
        }
        tile.kind = "soil";
        delete tile.crop;
        delete tile.plantedAt;
        delete tile.growthBonusMs;
        delete tile.watered;
        run.resources.plants += yieldCount;
        run.harvested += yieldCount;
        harvestCount += yieldCount;
      } else if (action.kind === "plant") {
        const tile = tileAtRobot();
        if (tile.kind !== "soil") throw new Error("Planting needs an empty soil tile.");
        if (run.resources.seeds < 1) throw new Error("The seed pouch is empty.");
        const crop = action.argument ?? "turnip";
        if (adventureSeeds) {
          const moonCrop = options.adventure?.isMoon === true;
          const validCrop = moonCrop
            ? Object.hasOwn(GARDEN_MOON_CROPS, crop)
            : Object.hasOwn(GARDEN_CROPS, crop);
          if (!validCrop) throw new Error(moonCrop
            ? 'Choose "mooncap", "moonleaf", or an unlocked lunar crop.'
            : 'Choose "turnip", "carrot", "berry", or an unlocked crop for this seed.');
          if (options.adventure?.availableCrops && !options.adventure.availableCrops.includes(crop as GardenCropType)) {
            throw new Error("Unlock the crop's farming skill before planting it.");
          }
          if ((adventureSeeds[crop as GardenCropType] ?? 0) < 1) throw new Error(`You are out of ${crop} seeds.`);
          if (moonCrop && moonWater < 1) throw new Error("The lunar reservoir is empty. Refill it at the lunar market.");
          adventureSeeds[crop as GardenCropType] = adventureSeeds[crop as GardenCropType]! - 1;
          if (moonCrop) moonWater -= 1;
          tile.crop = crop as GardenCropType;
          tile.plantedAt = options.adventure!.now;
          tile.growthBonusMs = 0;
          tile.watered = false;
        }
        run.resources.seeds -= 1;
        tile.kind = "plant";
        tile.growth = 0;
      } else if (action.kind === "water") {
        const tile = tileAtRobot();
        if (!options.adventure) throw new Error("Watering is available in Adventure Mode.");
        if (tile.kind !== "plant" || !tile.crop || tile.plantedAt === undefined) throw new Error("There is no growing crop under the robot to water.");
        if (tile.watered) throw new Error("This crop has already been watered.");
        if (options.adventure.isMoon && moonWater < 1) throw new Error("The lunar reservoir is empty. Refill it at the lunar market.");
        const cropDuration = options.adventure.isMoon
          ? GARDEN_MOON_CROPS[tile.crop as GardenMoonCropId].growMs
          : GARDEN_CROPS[tile.crop as GardenCropId].growMs;
        if (options.adventure.isMoon) moonWater -= 1;
        tile.watered = true;
        tile.growthBonusMs = (tile.growthBonusMs ?? 0) +
          cropDuration * (options.adventure.richSoil ? 0.8 : 1) *
          (options.adventure.wateringGrowthFraction ?? (options.adventure.wateringCan ? 0.35 : 0.2));
      } else if (action.kind === "wait") {
        if (!options.adventure) {
          for (const tile of run.tiles) {
            if (tile.kind === "plant") {
              tile.growth = (tile.growth ?? 0) + 1;
              if (tile.growth >= 2) tile.kind = "ripe";
            }
          }
        }
        if (options.adventure || upgrades.includes("solar-coil")) {
          const capacity = options.adventure ? 100 : mission.energyBudget ?? 100;
          const charged = Math.min(capacity, run.resources.energy + (options.adventure?.waitEnergyGain ?? 2));
          energyGenerated += charged - run.resources.energy;
          run.resources.energy = charged;
        }
      } else if (action.kind === "collect") {
        const tile = tileAtRobot();
        if (tile.kind !== "stone" && tile.kind !== "wood") throw new Error("There is nothing to collect on this tile.");
        const kind = tile.kind;
        const resource = kind === "wood" ? "wood" : "stone";
        if (run.resources[resource] >= run.storageCapacity) throw new Error("Storage is full. Upgrade the storehouse to carry more.");
        run.resources[resource] += 1;
        tile.kind = "soil";
        run.collected += 1;
      }
      actions.push(action);
      run.steps += 1;
      frames.push({
        ...run,
        robot: { ...run.robot },
        resources: { ...run.resources },
        tiles: run.tiles.map((tile) => ({ ...tile })),
      });
    }
  };
  try {
    runBlock(program, 0);
  } catch (error) {
    return {
      run: { ...run, tiles: run.tiles.map((tile) => ({ ...tile })), resources: { ...run.resources }, robot: { ...run.robot } },
      actions,
      frames,
      decisions,
      message: error instanceof Error ? error.message : "The program stopped unexpectedly.",
      unlocks: [],
      stats: {
        instructions: actions.length,
        harvested: run.harvested - startingRun.harvested,
        collected: run.collected - startingRun.collected,
        energyConsumed,
        energyGenerated,
      },
    };
  }
  const achieved = mission.goal.kind === "harvest" ? run.harvested : run.collected;
  run.completed = achieved >= mission.goal.count;
  return {
    run,
    actions,
    frames,
    decisions,
    message: run.completed ? `Mission complete: ${achieved}/${mission.goal.count}.` : `Mission progress: ${achieved}/${mission.goal.count}.`,
    unlocks: run.completed ? mission.unlocks : [],
    stats: {
      instructions: actions.length,
      harvested: run.harvested - startingRun.harvested,
      collected: run.collected - startingRun.collected,
      energyConsumed,
      energyGenerated,
    },
  };
}

export function getGardenSuggestions(
  source: string,
  mission: GardenMission,
  cursor = source.length,
  upgrades: readonly string[] = [],
  adventureMode = false,
  availableCrops: readonly GardenCropType[] = ["turnip", "carrot", "berry"],
): Array<{ insert: string; signature: string; detailKey: string }> {
  const preceding = source.slice(0, cursor);
  const prefix = preceding.match(/[A-Za-z_]\w*$/)?.[0] ?? "";
  const makeValues = (values: readonly string[], group: string) => values.map((value) => ({
    insert: value,
    signature: value,
    detailKey: `codeLab.reference.valueGroups.${group}`,
  }));
  const argumentCall = preceding.match(/\b(move|turn|plant)\s*\(\s*["']?([\w]*)$/);
  if (argumentCall) {
    if (argumentCall[1] === "plant" && !adventureMode) return [];
    const values = argumentCall[1] === "turn" ? GARDEN_TURN_DIRECTIONS :
      argumentCall[1] === "plant" ? availableCrops : GARDEN_DIRECTIONS;
    const group = argumentCall[1] === "turn" ? "turnDirection" : argumentCall[1] === "plant" ? "crop" : "direction";
    return makeValues(values, group)
      .filter((item) => item.insert.startsWith(prefix));
  }

  const ifMatches = [...preceding.matchAll(/\bif\s*\(/g)];
  const lastIf = ifMatches.at(-1);
  const openParen = lastIf ? (lastIf.index ?? 0) + lastIf[0].lastIndexOf("(") : -1;
  let conditionDepth = 0;
  for (const character of preceding.slice(openParen)) {
    if (character === "(") conditionDepth += 1;
    if (character === ")") {
      conditionDepth -= 1;
      if (conditionDepth === 0) break;
    }
  }
  const insideCondition = openParen >= 0 && conditionDepth > 0;
  const sensorCall = insideCondition
    ? preceding.match(/\b(tile_is|energy_at_least|storage_has_room)\s*\(\s*["']?([\w]*)$/)
    : null;
  if (sensorCall) {
    const definition: GardenLanguageEntry | undefined = GARDEN_SENSORS.find((sensor) => sensor.name === sensorCall[1]);
    if (!definition || !mission.unlocks.includes("if") || !mission.unlocks.includes("sensors") ||
      !upgrades.includes(definition.requiresUpgrade ?? "")) return [];
    const group = definition.name === "tile_is" ? "tileKind"
      : definition.name === "storage_has_room" ? "resource" : "number";
    return makeValues(definition.argumentValues ?? definition.suggestedValues ?? [], group)
      .filter((item) => item.insert.startsWith(prefix));
  }

  if (insideCondition) {
    if (!mission.unlocks.includes("if")) return [];
    const validValues = preceding.match(/\btile\s*==\s*["']?([\w]*)$/);
    if (validValues) {
      return makeValues(GARDEN_TILE_KINDS, "tileKind")
        .filter((item) => item.insert.startsWith(prefix));
    }
    return [
      {
        insert: 'tile == "ripe"',
        signature: "tile == kind",
        detailKey: "codeLab.reference.entries.condition.description",
      },
      ...GARDEN_SENSORS
        .filter((sensor) => mission.unlocks.includes(sensor.feature) && upgrades.includes(sensor.requiresUpgrade ?? ""))
        .map((sensor) => ({
          insert: `${sensor.name}()`,
          signature: sensor.signature,
          detailKey: `codeLab.reference.entries.${sensor.id}.description`,
        })),
    ].filter((item) => item.insert.toLowerCase().startsWith(prefix.toLowerCase()));
  }

  const repeatArgument = preceding.match(/\brepeat\s*\(\s*([\w]*)$/);
  if (repeatArgument) {
    const variables = [...source.matchAll(/\blet\s+([A-Za-z_]\w*)\s*=/g)].map((match) => match[1]);
    const suggestedCounts = GARDEN_LANGUAGE_CONSTRUCTS.find((construct) => construct.id === "repeat")?.suggestedValues ?? [];
    return makeValues([...new Set([...suggestedCounts, ...variables])], "repeatCount")
      .filter((item) => item.insert.startsWith(prefix));
  }

  if (/\bfunction\s+[A-Za-z_]\w*$/.test(preceding)) return [];
  const declaredFunctions = [...source.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(\s*\)\s*\{/g)]
    .map((match) => match[1]);
  const userFunctions = declaredFunctions.map((name) => ({
    insert: `${name}()`,
    signature: `${name}()`,
    detailKey: "codeLab.reference.suggestions.userFunction",
  }));
  const builtIns = GARDEN_COMMANDS
    .filter((command) => mission.unlocks.includes(command.feature))
    .map((command) => ({
      insert: `${command.id}()`,
      signature: command.signature,
      detailKey: `codeLab.reference.entries.${command.id}.description`,
    }));
  const constructs = GARDEN_LANGUAGE_CONSTRUCTS
    .filter((construct) => mission.unlocks.includes(construct.feature))
    .filter((construct) => construct.id !== "function" || mission.unlocks.includes("repeat"))
    .map((construct) => ({
      insert: construct.id === "repeat" ? "repeat(3) {\n  \n}"
        : construct.id === "condition" ? 'if (tile == "ripe") {\n  \n}'
          : construct.id === "variable" ? "let cycles = 2"
            : "function name() {\n  \n}",
      signature: construct.signature,
      detailKey: `codeLab.reference.entries.${construct.id}.description`,
    }));
  const sensors = GARDEN_SENSORS
    .filter((sensor) => mission.unlocks.includes(sensor.feature) && upgrades.includes(sensor.requiresUpgrade ?? ""))
    .map((sensor) => ({
      insert: `${sensor.name}()`,
      signature: sensor.signature,
      detailKey: `codeLab.reference.entries.${sensor.id}.description`,
    }));
  const candidates = [...builtIns, ...constructs, ...sensors, ...userFunctions];
  return candidates
    .filter((item) => item.insert.toLowerCase().startsWith(prefix.toLowerCase()) && item.insert.toLowerCase() !== prefix.toLowerCase())
    .slice(0, 8);
}

export async function initializeCodeGarden(): Promise<CodeGardenState> {
  return db.transaction("rw", db.codeGardenState, async () => {
    const existing = await db.codeGardenState.get("default");
    if (existing) {
      if (!existing.adventure) return existing;
      const normalized = normalizeGardenAdventure(existing.adventure);
      if (JSON.stringify(existing.adventure) === JSON.stringify(normalized)) return existing;
      const saved = { ...existing, adventure: normalized, updatedAt: Date.now() };
      await db.codeGardenState.put(saved);
      return saved;
    }
    const initial = { ...DEFAULT_GARDEN_STATE, updatedAt: Date.now() };
    await db.codeGardenState.add(initial);
    return initial;
  });
}

export async function saveCodeGardenState(state: CodeGardenState): Promise<CodeGardenState> {
  const saved = { ...state, updatedAt: Date.now() };
  await db.codeGardenState.put(saved);
  return saved;
}

export async function saveCodeGardenProgram(missionId: string, program: string): Promise<CodeGardenState> {
  if (missionId !== "adventure" && missionId !== "adventure-assistant" && !GARDEN_MISSIONS.some((mission) => mission.id === missionId)) {
    throw new Error("That Code Garden program does not exist.");
  }
  if (program.length > 12_000) {
    throw new Error("The robot program is too long to save.");
  }
  return db.transaction("rw", db.codeGardenState, async () => {
    const current = await db.codeGardenState.get("default") ?? {
      ...DEFAULT_GARDEN_STATE,
      updatedAt: Date.now(),
    };
    if (missionId === "adventure-assistant" && !current.adventure?.secondRobot) {
      throw new Error("Purchase the assistant robot before saving its program.");
    }
    const saved = {
      ...current,
      programs: { ...current.programs, [missionId]: program },
      updatedAt: Date.now(),
    };
    await db.codeGardenState.put(saved);
    return saved;
  });
}

export async function researchGardenUpgrade(upgradeId: GardenResearchId): Promise<CodeGardenState> {
  const research = GARDEN_RESEARCH.find((entry) => entry.id === upgradeId);
  if (!research) throw new Error("That research is not available.");
  return db.transaction("rw", db.codeGardenState, async () => {
    const state = await db.codeGardenState.get("default") ?? { ...DEFAULT_GARDEN_STATE, updatedAt: Date.now() };
    if (state.upgrades.includes(upgradeId)) return state;
    if (!state.completedMissionIds.includes(research.prerequisiteMission)) {
      throw new Error("Complete the prerequisite mission before starting this research.");
    }
    if (state.resources.wood < research.cost.wood || state.resources.stone < research.cost.stone) {
      throw new Error(`This research needs ${research.cost.wood} wood and ${research.cost.stone} stone.`);
    }
    const saved: CodeGardenState = {
      ...state,
      resources: {
        ...state.resources,
        wood: state.resources.wood - research.cost.wood,
        stone: state.resources.stone - research.cost.stone,
      },
      upgrades: [...state.upgrades, upgradeId],
      updatedAt: Date.now(),
    };
    await db.codeGardenState.put(saved);
    return saved;
  });
}

function isGardenAdventureSave(value: unknown): value is GardenAdventureSave {
  if (!value || typeof value !== "object") return false;
  const farm = value as Partial<GardenAdventureSave>;
  const validCount = (amount: unknown) =>
    typeof amount === "number" && Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000;
  const skills = farm.skillLevels;
  const knownSkills = new Set(GARDEN_SKILLS.map((skill) => skill.id));
  const skillLevelsValid = skills === undefined || (
    typeof skills === "object" && !Array.isArray(skills) &&
    Object.entries(skills).every(([id, level]) => {
      const definition = GARDEN_SKILLS.find((skill) => skill.id === id);
      return Boolean(definition && Number.isInteger(level) && level! >= 0 && level! <= definition.costs.length);
    }) &&
    Object.keys(skills).every((id) => knownSkills.has(id as GardenSkillId)) &&
    GARDEN_SKILLS.every((skill) => (skills[skill.id] ?? 0) === 0 ||
      skill.requires.every((requirement) => (skills[requirement.id] ?? 0) >= requirement.level))
  );
  const validMoon = (moon: unknown): moon is GardenMoonFarmSave => {
    if (!moon || typeof moon !== "object") return false;
    const saved = moon as Partial<GardenMoonFarmSave>;
    const moonSkills = saved.skills;
    const knownMoonSkills = new Set(GARDEN_MOON_SKILLS.map((skill) => skill.id));
    const moonSkillLevelsValid = moonSkills === undefined || (
      typeof moonSkills === "object" && !Array.isArray(moonSkills) &&
      Object.entries(moonSkills).every(([id, level]) => {
        const definition = GARDEN_MOON_SKILLS.find((skill) => skill.id === id);
        return Boolean(definition && Number.isInteger(level) && level! >= 0 && level! <= definition.costs.length);
      }) &&
      Object.keys(moonSkills).every((id) => knownMoonSkills.has(id as GardenMoonSkillId)) &&
      GARDEN_MOON_SKILLS.every((skill) => (moonSkills[skill.id] ?? 0) === 0 ||
        skill.requires.every((requirement) => (moonSkills[requirement.id] ?? 0) >= requirement.level))
    );
    if (!Number.isInteger(saved.width) || !Number.isInteger(saved.height) ||
      saved.width !== 6 + (saved.expansions ?? -1) * 2 || saved.height !== 5 ||
      !Number.isInteger(saved.expansions) || saved.expansions! < 0 || saved.expansions! > 4 ||
      !validCount(saved.credits) || saved.credits! > 1_000_000 ||
      !validCount(saved.water) || saved.water! > getGardenMoonWaterCapacity(saved as GardenMoonFarmSave) ||
      !Array.isArray(saved.plots) || saved.plots.length !== saved.width * saved.height ||
      !saved.seeds || !saved.harvest || !saved.robots?.primary || !moonSkillLevelsValid ||
      typeof saved.updatedAt !== "number" || !Number.isFinite(saved.updatedAt)) return false;
    const moonCrops = Object.keys(GARDEN_MOON_CROPS) as GardenMoonCropId[];
    if (!moonCrops.every((crop) =>
      validCount(saved.seeds?.[crop]) && validCount(saved.harvest?.[crop]))) return false;
    if ((saved.seeds.prismberry > 0 || saved.harvest.prismberry > 0) &&
      (moonSkills?.["prism-grafting"] ?? 0) < 1) return false;
    const validateRobot = (robot: GardenMoonFarmSave["robots"][GardenRobotId] | undefined) =>
      Boolean(robot && Number.isInteger(robot.x) && robot.x >= 0 && robot.x < saved.width! &&
        Number.isInteger(robot.y) && robot.y >= 0 && robot.y < saved.height! &&
        GARDEN_DIRECTIONS.includes(robot.direction as GardenDirection) &&
        (robot.movementProgress === undefined ||
          Number.isInteger(robot.movementProgress) && robot.movementProgress >= 0 && robot.movementProgress <= 1));
    if (!validateRobot(saved.robots.primary) ||
      (farm.secondRobot ? !validateRobot(saved.robots.assistant) : saved.robots.assistant !== undefined)) return false;
    if (saved.robots.assistant && !farm.secondRobot) return false;
    const lunarPositions = new Set<string>();
    return saved.plots.every((plot) => {
      if (!plot || !Number.isInteger(plot.x) || plot.x < 0 || plot.x >= saved.width! ||
        !Number.isInteger(plot.y) || plot.y < 0 || plot.y >= saved.height!) return false;
      const key = `${plot.x}:${plot.y}`;
      if (lunarPositions.has(key)) return false;
      lunarPositions.add(key);
      if (plot.crop === undefined) {
        return plot.plantedAt === undefined && plot.growthBonusMs === undefined && plot.watered === undefined;
      }
      return moonCrops.includes(plot.crop) &&
        (plot.crop !== "prismberry" || (moonSkills?.["prism-grafting"] ?? 0) >= 1) &&
        typeof plot.plantedAt === "number" && Number.isFinite(plot.plantedAt) && plot.plantedAt >= 0 &&
        (plot.growthBonusMs === undefined ||
          typeof plot.growthBonusMs === "number" && Number.isFinite(plot.growthBonusMs) && plot.growthBonusMs >= 0) &&
        (plot.watered === undefined || typeof plot.watered === "boolean");
    });
  };
  if (!Number.isInteger(farm.width) || !Number.isInteger(farm.height) ||
    !Number.isInteger(farm.expansions) || farm.expansions! < 0 || farm.expansions! > 6 ||
    farm.width !== 6 + farm.expansions! * 2 || farm.height !== 5 ||
    (farm.expansions! > 4 && getGardenSkillLevel(farm as GardenAdventureSave, "field-survey") < farm.expansions! - 4) ||
    typeof farm.coins !== "number" || !Number.isInteger(farm.coins) || farm.coins < 0 || farm.coins > 1_000_000 ||
    !validCount(farm.energy) || farm.energy! > 100 ||
    typeof farm.richSoil !== "boolean" || typeof farm.wateringCan !== "boolean" ||
    !skillLevelsValid ||
    (farm.robotMovementProgress !== undefined && (!Number.isInteger(farm.robotMovementProgress) || farm.robotMovementProgress < 0 || farm.robotMovementProgress > 1)) ||
    (farm.activeRobot !== undefined && farm.activeRobot !== "primary" && farm.activeRobot !== "assistant") ||
    (farm.activeRobot === "assistant" && farm.secondRobot === undefined) ||
    (farm.activeWorld !== undefined && farm.activeWorld !== "earth" && farm.activeWorld !== "moon") ||
    (farm.activeWorld === "moon" && farm.moonFarm === undefined) ||
    (farm.moonFarm !== undefined && (!isGardenMoonExpeditionReady(farm as GardenAdventureSave) ||
      !validMoon(farm.moonFarm))) ||
    typeof farm.updatedAt !== "number" || !Number.isFinite(farm.updatedAt) ||
    !farm.robot || !Number.isInteger(farm.robot.x) || farm.robot.x < 0 || farm.robot.x >= farm.width ||
    !Number.isInteger(farm.robot.y) || farm.robot.y < 0 || farm.robot.y >= farm.height ||
    !GARDEN_DIRECTIONS.includes(farm.robot.direction as GardenDirection) ||
    !Array.isArray(farm.plots) || farm.plots.length !== farm.width * farm.height ||
    !farm.seeds || !farm.harvest) return false;
  const crops = Object.keys(GARDEN_CROPS) as GardenCropId[];
  if (!crops.every((crop) => crop === "pumpkin"
    ? (farm.seeds?.[crop] === undefined || validCount(farm.seeds[crop])) &&
      (farm.harvest?.[crop] === undefined || validCount(farm.harvest[crop]))
    : validCount(farm.seeds?.[crop]) && validCount(farm.harvest?.[crop]))) return false;
  if (farm.secondRobot !== undefined) {
    const robot = farm.secondRobot;
    if (getGardenSkillLevel(farm as GardenAdventureSave, "robot-blueprints") < 1 ||
      !Number.isInteger(robot.x) || robot.x < 0 || robot.x >= farm.width! ||
      !Number.isInteger(robot.y) || robot.y < 0 || robot.y >= farm.height! ||
      !GARDEN_DIRECTIONS.includes(robot.direction as GardenDirection) ||
      !validCount(robot.energy) || robot.energy! > 100 ||
      (robot.movementProgress !== undefined && (!Number.isInteger(robot.movementProgress) || robot.movementProgress < 0 || robot.movementProgress > 1))) return false;
  }
  if ((farm.seeds?.pumpkin ?? 0) > 0 || (farm.harvest?.pumpkin ?? 0) > 0) {
    if (getGardenSkillLevel(farm as GardenAdventureSave, "seed-diversity") < 1) return false;
  }
  const positions = new Set<string>();
  return farm.plots.every((plot) => {
    if (!plot || typeof plot !== "object") return false;
    if (!Number.isInteger(plot.x) || plot.x < 0 || plot.x >= farm.width! ||
      !Number.isInteger(plot.y) || plot.y < 0 || plot.y >= farm.height!) return false;
    const key = `${plot.x}:${plot.y}`;
    if (positions.has(key)) return false;
    positions.add(key);
    if (plot.crop === undefined) return plot.plantedAt === undefined && plot.growthBonusMs === undefined && plot.watered === undefined;
    return crops.includes(plot.crop) &&
      (plot.crop !== "pumpkin" || getGardenSkillLevel(farm as GardenAdventureSave, "seed-diversity") >= 1) &&
      typeof plot.plantedAt === "number" && Number.isFinite(plot.plantedAt) && plot.plantedAt >= 0 &&
      (plot.growthBonusMs === undefined || (typeof plot.growthBonusMs === "number" && Number.isFinite(plot.growthBonusMs) && plot.growthBonusMs >= 0)) &&
      (plot.watered === undefined || typeof plot.watered === "boolean");
  }) && (farm.moonFarm === undefined || validMoon(farm.moonFarm));
}

export function isCodeGardenState(value: unknown): value is CodeGardenState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CodeGardenState>;
  if (state.id !== "default" || typeof state.activeMissionId !== "string" ||
    !Array.isArray(state.completedMissionIds) || !state.completedMissionIds.every((id) => typeof id === "string") ||
    !Array.isArray(state.upgrades) || !state.upgrades.every((upgrade) => typeof upgrade === "string") ||
    typeof state.updatedAt !== "number" || !Number.isFinite(state.updatedAt) || !state.resources || typeof state.resources !== "object") return false;
  if (state.activeMode !== undefined && state.activeMode !== "missions" && state.activeMode !== "adventure") return false;
  if (state.adventure !== undefined && (!isGardenAdventureSave(state.adventure) ||
    !isGardenAdventureUnlocked(state.completedMissionIds))) return false;
  if (state.programs !== undefined && (!state.programs || typeof state.programs !== "object" || Array.isArray(state.programs) ||
    Object.entries(state.programs).some(([mission, program]) => (mission !== "adventure" && mission !== "adventure-assistant" && !GARDEN_MISSIONS.some((entry) => entry.id === mission)) ||
      (mission === "adventure-assistant" && !state.adventure?.secondRobot) ||
      typeof program !== "string" || program.length > 12_000))) return false;
  if (state.bestResults !== undefined && (!state.bestResults || typeof state.bestResults !== "object" || Array.isArray(state.bestResults) ||
    Object.entries(state.bestResults).some(([mission, result]) => !GARDEN_MISSIONS.some((entry) => entry.id === mission) ||
      !result || typeof result !== "object" ||
      ![result.instructions, result.harvested, result.collected, result.energyConsumed, result.energyGenerated]
        .every((amount) => Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000)))) return false;
  const resources = state.resources;
  if (!["plants", "wood", "stone", "seeds", "energy"].every((key) => {
    const amount = resources[key as keyof typeof resources];
    return typeof amount === "number" && Number.isInteger(amount) && amount >= 0 && amount <= 1_000_000;
  })) return false;
  if (state.activeRun === undefined) return true;
  const run = state.activeRun;
  return Boolean(run && typeof run === "object" && typeof run.missionId === "string" &&
    run.robot && Number.isInteger(run.robot.x) && Number.isInteger(run.robot.y) &&
    ["north", "east", "south", "west"].includes(run.robot.direction) &&
    Array.isArray(run.tiles) && run.tiles.length <= 1_000 &&
    run.tiles.every((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) &&
      ["soil", "plant", "ripe", "stone", "wood", "empty"].includes(tile.kind)) &&
    [run.harvested, run.collected, run.steps].every((count) => Number.isInteger(count) && count >= 0) &&
    Number.isInteger(run.storageCapacity) && run.storageCapacity >= 1 && run.storageCapacity <= 100 &&
    typeof run.completed === "boolean");
}
