import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  BookOpen,
  Check,
  CircleHelp,
  Droplets,
  Globe2,
  Hammer,
  Leaf,
  Mountain,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  Trees,
  X,
  Zap,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CodeInput } from "../components/CodeInput";
import { CodeReference } from "../components/CodeReference";
import { CodeWorkspace } from "../components/CodeWorkspace";
import { GardenSkillTree } from "../components/GardenSkillTree";
import { GardenMoonSkillTree } from "../components/GardenMoonSkillTree";
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
  getGardenMoonSkillLevel,
  getGardenMoonWaterCapacity,
  createGardenRun,
  expandGarden,
  executeGardenProgram,
  GARDEN_CROPS,
  getGardenAvailableCrops,
  getGardenSeedPack,
  getGardenSkillLevel,
  gardenCoordinatesAtPoint,
  GARDEN_RESEARCH,
  GARDEN_MISSIONS,
  getGardenSuggestions,
  isGardenAdventureUnlocked,
  isGardenMoonExpeditionReady,
  GARDEN_MOON_CROPS,
  GARDEN_MOON_EXPEDITION_COST,
  GARDEN_MOON_WATER_COST,
  GARDEN_MOON_WATER_PACK,
  type GardenResearchId,
  initializeCodeGarden,
  researchGardenUpgrade,
  saveCodeGardenProgram,
  saveCodeGardenState,
  sellGardenHarvest,
  sellGardenMoonHarvest,
  refillGardenMoonWater,
  travelGardenWorld,
  unlockGardenMoonExpedition,
  type GardenAction,
  type GardenDirection,
  type GardenMission,
  type GardenRunStats,
  type GardenRunState,
} from "../data/code-garden";
import type { CodeGardenState } from "../data/db";
import type {
  GardenAdventureSave,
  GardenCropId,
  GardenCropType,
  GardenMoonCropId,
  GardenMoonFarmSave,
  GardenMoonSkillId,
  GardenRobotId,
  GardenSkillId,
  GardenWorldId,
} from "../data/db";

type RunStatus = "ready" | "running" | "paused";
type ResourceName = "plants" | "wood" | "stone" | "seeds" | "energy";
interface CodeGardenGameProps {
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
}

function initialProgram(missionId: string): string {
  switch (missionId) {
    case "first-harvest": return "# Move to the ripe plant, then harvest it.\n";
    case "repeat-the-row": return "# Repeat a move and a harvest.\nrepeat (3) {\n  \n}\n";
    case "read-the-ground": return "# Move onto the row, then check each tile.\n";
    case "garden-routine": return "# Define a reusable routine, then call it.\nfunction harvest_row() {\n  \n}\n";
    case "seed-cycle": return "# Name how many crop cycles you want.\nlet cycles = \n";
    case "solar-relay": return "# Harvest three tiles, recharge, then finish the row.\nrepeat (3) {\n  move(\"east\")\n  harvest()\n}\nwait()\nmove(\"east\")\nharvest()\n";
    case "sensor-sweep": return '# Inspect each tile before harvesting.\nrepeat (5) {\n  move("east")\n  if (tile_is("ripe")) {\n    \n  }\n}\n';
    default: return "";
  }
}

function adventureProgramId(robotId: GardenRobotId): string {
  return robotId === "assistant" ? "adventure-assistant" : "adventure";
}

function gardenRunFromSaved(state: CodeGardenState, mission: GardenMission): GardenRunState {
  const saved = state.activeRun;
  const base = createGardenRun(mission, state.resources, state.upgrades);
  if (!saved || saved.missionId !== mission.id) return base;
  return {
    ...base,
    robot: { ...saved.robot, direction: saved.robot.direction as GardenRunState["robot"]["direction"] },
    tiles: saved.tiles.map((tile) => ({ ...tile, kind: tile.kind as GardenRunState["tiles"][number]["kind"] })),
    harvested: saved.harvested,
    collected: saved.collected,
    steps: saved.steps,
    completed: saved.completed,
    storageCapacity: saved.storageCapacity,
  };
}

function saveableRun(run: GardenRunState): NonNullable<CodeGardenState["activeRun"]> {
  return {
    missionId: run.missionId,
    robot: run.robot,
    tiles: run.tiles,
    harvested: run.harvested,
    collected: run.collected,
    steps: run.steps,
    completed: run.completed,
    storageCapacity: run.storageCapacity,
  };
}

export function CodeGardenGame({ toolbarStart, toolbarEnd }: CodeGardenGameProps) {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState<CodeGardenState | null>(null);
  const [run, setRun] = useState<GardenRunState | null>(null);
  const [gameMode, setGameMode] = useState<"missions" | "adventure">("missions");
  const [adventure, setAdventure] = useState<GardenAdventureSave | null>(null);
  const [selectedRobot, setSelectedRobot] = useState<GardenRobotId>("primary");
  const [growthNow, setGrowthNow] = useState(() => Date.now());
  const [adventureError, setAdventureError] = useState("");
  const [marketBusy, setMarketBusy] = useState(false);
  const [missionId, setMissionId] = useState(GARDEN_MISSIONS[0].id);
  const [source, setSource] = useState(() => initialProgram(GARDEN_MISSIONS[0].id));
  const [status, setStatus] = useState<RunStatus>("ready");
  const [action, setAction] = useState<GardenAction | null>(null);
  const [sensorFeedback, setSensorFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [hintedMissionId, setHintedMissionId] = useState("");
  const [upgradeError, setUpgradeError] = useState("");
  const [stats, setStats] = useState<GardenRunStats | null>(null);
  const [showBestStats, setShowBestStats] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const runToken = useRef(0);
  const gameStateRef = useRef<CodeGardenState | null>(null);
  const currentMission = gameMode === "adventure" && adventure
    ? createGardenAdventureMission(adventure, growthNow)
    : GARDEN_MISSIONS.find((item) => item.id === missionId) ?? GARDEN_MISSIONS[0];
  const currentWorld: GardenWorldId = gameMode === "adventure" ? adventure?.activeWorld ?? "earth" : "earth";
  const moonFarm = adventure?.moonFarm;
  const availableAdventureCrops: readonly GardenCropType[] = currentWorld === "moon" && moonFarm
    ? getGardenMoonAvailableCrops(moonFarm)
    : adventure ? getGardenAvailableCrops(adventure) : ["turnip", "carrot", "berry"];
  const frameTimer = useRef<number | null>(null);
  gameStateRef.current = gameState;

  useEffect(() => {
    let active = true;
    initializeCodeGarden().then((saved) => {
      if (!active) return;
      const mission = GARDEN_MISSIONS.find((item) => item.id === saved.activeMissionId) ?? GARDEN_MISSIONS[0];
      const loadedMode = saved.activeMode === "adventure" && isGardenAdventureUnlocked(saved.completedMissionIds)
        ? "adventure"
        : "missions";
      const loadedAdventure = saved.adventure ?? (loadedMode === "adventure" ? createGardenAdventure() : null);
      setGameState(saved);
      gameStateRef.current = saved;
      setGameMode(loadedMode);
      setAdventure(loadedAdventure);
      const loadedRobot: GardenRobotId = loadedAdventure?.activeRobot === "assistant" && loadedAdventure.secondRobot
        ? "assistant"
        : "primary";
      setSelectedRobot(loadedRobot);
      setMissionId(mission.id);
      setSource(saved.programs?.[loadedMode === "adventure" ? adventureProgramId(loadedRobot) : mission.id] ??
        (loadedMode === "adventure" ? '# Plant a crop, then return to harvest it.\nplant("turnip")\n' : initialProgram(mission.id)));
      const loadedRun = loadedMode === "adventure" && loadedAdventure
        ? createGardenAdventureRun(loadedAdventure, saved.resources, Date.now(), loadedRobot)
        : gardenRunFromSaved(saved, mission);
      setRun(loadedRun);
      setSelectedTile({ x: loadedRun.robot.x, y: loadedRun.robot.y });
      setStats(saved.bestResults?.[mission.id] ?? null);
      setShowBestStats(Boolean(saved.bestResults?.[mission.id]));
    }).catch((error: unknown) => {
      if (active) setLoadingError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      active = false;
      runToken.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const timer = window.setTimeout(() => {
      const programId = gameMode === "adventure" ? adventureProgramId(selectedRobot) : missionId;
      void saveCodeGardenProgram(programId, source).then((saved) => {
        const latest = gameStateRef.current;
        if (latest) {
          gameStateRef.current = { ...latest, programs: saved.programs, updatedAt: saved.updatedAt };
        } else {
          gameStateRef.current = saved;
        }
        setGameState((current) => current
          ? { ...current, programs: saved.programs, updatedAt: saved.updatedAt }
          : saved);
      }).catch((error: unknown) => {
        setLoadingError(error instanceof Error ? error.message : String(error));
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [gameMode, missionId, selectedRobot, source]);

  const missionIndex = GARDEN_MISSIONS.findIndex((mission) => mission.id === missionId);
  const unlockedThrough = Math.min(
    GARDEN_MISSIONS.length - 1,
    gameState?.completedMissionIds.reduce((highest, id) => Math.max(highest, GARDEN_MISSIONS.findIndex((mission) => mission.id === id)), -1) ?? -1,
  ) + 1;
  const currentRun = gameMode === "adventure" && adventure
    ? run?.missionId === "garden-adventure" ? run : gameState ? createGardenAdventureRun(adventure, gameState.resources, growthNow, selectedRobot) : null
    : run ?? (gameState ? createGardenRun(currentMission, gameState.resources, gameState.upgrades) : null);

  async function persist(nextState: CodeGardenState, nextRun: GardenRunState, updateUi = true) {
    const saved = await saveCodeGardenState({
      ...nextState,
      resources: { ...nextRun.resources },
      activeMissionId: nextRun.missionId,
      activeRun: saveableRun(nextRun),
    });
    gameStateRef.current = saved;
    if (updateUi) setGameState(saved);
    return saved;
  }

  async function persistAdventureState(nextFarm: GardenAdventureSave) {
    const latest = gameStateRef.current ?? gameState;
    if (!latest) return;
    const saved = await saveCodeGardenState({
      ...latest,
      activeMode: "adventure",
      adventure: nextFarm,
      programs: { ...latest.programs, [adventureProgramId(selectedRobot)]: source },
    });
    gameStateRef.current = saved;
    setGameState(saved);
    setAdventure(nextFarm);
    setAdventureError("");
  }

  async function updateAdventure(update: (farm: GardenAdventureSave) => GardenAdventureSave) {
    if (!adventure || marketBusy || status !== "ready") return;
    setMarketBusy(true);
    try {
      const updated = update(adventure);
      await persistAdventureState(updated);
      const saved = gameStateRef.current;
      if (saved) {
        const nextRun = createGardenAdventureRun(updated, saved.resources, Date.now(), selectedRobot);
        setRun(nextRun);
        setSelectedTile({ x: nextRun.robot.x, y: nextRun.robot.y });
      }
    } catch (error) {
      setAdventureError(error instanceof Error ? error.message : String(error));
    } finally {
      setMarketBusy(false);
    }
  }

  async function updateMoonFarm(update: (farm: GardenMoonFarmSave) => GardenMoonFarmSave) {
    await updateAdventure((farm) => {
      if (!farm.moonFarm) throw new Error("The lunar expedition is not unlocked.");
      return { ...farm, moonFarm: update(farm.moonFarm), updatedAt: Date.now() };
    });
  }

  async function selectAdventureRobot(robotId: GardenRobotId) {
    if (!gameState || !adventure || status !== "ready" || selectedRobot === robotId) return;
    if (robotId === "assistant" && !adventure.secondRobot) return;
    try {
      const savedProgram = await saveCodeGardenProgram(adventureProgramId(selectedRobot), source);
      const nextFarm = { ...adventure, activeRobot: robotId };
      const saved = await saveCodeGardenState({
        ...savedProgram,
        activeMode: "adventure",
        adventure: nextFarm,
      });
      gameStateRef.current = saved;
      setGameState(saved);
      setAdventure(nextFarm);
      setSelectedRobot(robotId);
      setSource(saved.programs?.[adventureProgramId(robotId)] ??
        `# ${robotId === "assistant" ? "Assistant" : "Main"} robot routine.\n`);
      const nextRun = createGardenAdventureRun(nextFarm, saved.resources, Date.now(), robotId);
      setRun(nextRun);
      setSelectedTile({ x: nextRun.robot.x, y: nextRun.robot.y });
      setMessage("");
      setAdventureError("");
    } catch (error) {
      setAdventureError(error instanceof Error ? error.message : String(error));
    }
  }

  async function enterAdventure() {
    if (!gameState || !isGardenAdventureUnlocked(gameState.completedMissionIds)) return;
    try {
      const savedProgram = await saveCodeGardenProgram(missionId, source);
      const nextFarm = savedProgram.adventure ?? createGardenAdventure();
      const saved = await saveCodeGardenState({
        ...savedProgram,
        activeMode: "adventure",
        adventure: nextFarm,
      });
      gameStateRef.current = saved;
      setGameState(saved);
      setAdventure(nextFarm);
      setSelectedRobot(nextFarm.activeRobot === "assistant" && nextFarm.secondRobot ? "assistant" : "primary");
      setGameMode("adventure");
      setSource(saved.programs?.[adventureProgramId(nextFarm.activeRobot === "assistant" && nextFarm.secondRobot ? "assistant" : "primary")] ??
        '# Plant a crop, then return to harvest it.\nplant("turnip")\n');
      const activeRobot: GardenRobotId = nextFarm.activeRobot === "assistant" && nextFarm.secondRobot ? "assistant" : "primary";
      const nextRun = createGardenAdventureRun(nextFarm, saved.resources, Date.now(), activeRobot);
      setRun(nextRun);
      setSelectedTile({ x: nextRun.robot.x, y: nextRun.robot.y });
      setAdventureError("");
      setMessage("");
    } catch (error) {
      setAdventureError(error instanceof Error ? error.message : String(error));
    }
  }

  async function travelToWorld(world: GardenWorldId) {
    if (!gameState || !adventure || status !== "ready" || currentWorld === world) return;
    try {
      const savedProgram = await saveCodeGardenProgram(adventureProgramId(selectedRobot), source);
      const nextFarm = travelGardenWorld(adventure, world);
      const saved = await saveCodeGardenState({
        ...savedProgram,
        activeMode: "adventure",
        adventure: nextFarm,
      });
      gameStateRef.current = saved;
      setGameState(saved);
      setAdventure(nextFarm);
      const nextRun = createGardenAdventureRun(nextFarm, saved.resources, Date.now(), selectedRobot);
      setRun(nextRun);
      setSelectedTile({ x: nextRun.robot.x, y: nextRun.robot.y });
      setMessage("");
      setAdventureError("");
    } catch (error) {
      setAdventureError(error instanceof Error ? error.message : String(error));
    }
  }

  async function launchMoonExpedition() {
    if (!isGardenMoonExpeditionReady(adventure ?? createGardenAdventure()) || marketBusy || status !== "ready") return;
    await updateAdventure(unlockGardenMoonExpedition);
  }

  async function returnToMissions() {
    if (!gameState) return;
    try {
      const savedProgram = await saveCodeGardenProgram(adventureProgramId(selectedRobot), source);
      const saved = await saveCodeGardenState({ ...savedProgram, activeMode: "missions" });
      gameStateRef.current = saved;
      setGameState(saved);
      setGameMode("missions");
      setSelectedRobot("primary");
      const mission = GARDEN_MISSIONS.find((item) => item.id === missionId) ?? GARDEN_MISSIONS[0];
      setSource(saved.programs?.[mission.id] ?? initialProgram(mission.id));
      const nextRun = gardenRunFromSaved(saved, mission);
      setRun(nextRun);
      setSelectedTile({ x: nextRun.robot.x, y: nextRun.robot.y });
      setMessage("");
      setAdventureError("");
    } catch (error) {
      setAdventureError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (gameMode !== "adventure") return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setGrowthNow(now);
      const farm = gameStateRef.current?.adventure;
      if (!farm || statusRef.current === "running" || statusRef.current === "paused") return;
      setRun((current) => {
        if (!current || current.missionId !== "garden-adventure") return current;
        const fresh = createGardenAdventureRun(farm, current.resources, now, selectedRobot);
        return { ...current, tiles: fresh.tiles };
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [gameMode, selectedRobot]);

  async function finishExecution(
    execution: ReturnType<typeof executeGardenProgram>,
    originalState: CodeGardenState,
    completedMission: GardenMission,
  ) {
    const successful = execution.run.completed &&
      !originalState.completedMissionIds.includes(completedMission.id);
    const completed = execution.run.completed;
    let finalRun = execution.run;
    let completedIds = originalState.completedMissionIds;
    if (successful) {
      const capacity = finalRun.storageCapacity;
      const resources = { ...finalRun.resources };
      for (const [resource, count] of Object.entries(completedMission.reward) as Array<[ResourceName, number]>) {
        resources[resource] = resource === "energy" || resource === "seeds"
          ? resources[resource] + count
          : Math.min(capacity, resources[resource] + count);
      }
      finalRun = { ...finalRun, resources, completed: true };
      completedIds = [...completedIds, completedMission.id];
    }
    setRun(finalRun);
    const previousBest = originalState.bestResults?.[completedMission.id];
    const isBest = completed && (!previousBest || execution.stats.instructions < previousBest.instructions);
    const bestResults = isBest
      ? { ...originalState.bestResults, [completedMission.id]: execution.stats }
      : originalState.bestResults;
    if (isBest) setShowBestStats(true);
    setAction(execution.actions.at(-1) ?? null);
    setMessage(execution.message);
    setMessageIsError(!execution.run.completed && !execution.message.startsWith("Mission progress:"));
    await persist({ ...originalState, completedMissionIds: completedIds, bestResults }, finalRun);
  }

  async function runProgram() {
    if (!gameState || !currentRun || status === "running") return;
    const currentToken = ++runToken.current;
    const programId = gameMode === "adventure" ? adventureProgramId(selectedRobot) : currentMission.id;
    const executionState = {
      ...gameState,
      programs: { ...gameState.programs, [programId]: source },
      ...(gameMode === "adventure" ? { activeMode: "adventure" as const } : {}),
    };
    const initialRun = { ...currentRun, tiles: currentRun.tiles.map((tile) => ({ ...tile })), resources: { ...currentRun.resources } };
    setStatus("running");
    setMessage("");
    setMessageIsError(false);
    setAction(null);
    setSensorFeedback("");
    try {
      if (currentMission.requiresUpgrade && !gameState.upgrades.includes(currentMission.requiresUpgrade)) {
        throw new Error(t("codeLab.game.researchLocked"));
      }
      const execution = executeGardenProgram(
        source,
        currentMission,
        initialRun,
        gameMode === "adventure" && adventure && getGardenSkillLevel(adventure, "solar-routines") > 0
          ? 300
          : currentMission.maxSteps,
        gameState.upgrades,
        gameMode === "adventure" && adventure
          ? {
              adventure: {
                seeds: currentWorld === "moon" && adventure.moonFarm ? adventure.moonFarm.seeds : adventure.seeds,
                richSoil: adventure.richSoil,
                wateringCan: adventure.wateringCan,
                now: Date.now(),
                availableCrops: availableAdventureCrops,
                harvestCapacity: initialRun.storageCapacity,
                harvestedCount: Object.values(currentWorld === "moon" && adventure.moonFarm
                  ? adventure.moonFarm.harvest
                  : adventure.harvest).reduce((total, count) => total + count, 0),
                harvestYieldBonus: currentWorld === "moon" && adventure.moonFarm
                  ? getGardenMoonSkillLevel(adventure.moonFarm, "lunar-yield")
                  : getGardenSkillLevel(adventure, "abundant-harvest"),
                wateringGrowthFraction: currentWorld === "moon"
                  ? 0.5
                  : getGardenSkillLevel(adventure, "precision-nozzle") > 0
                    ? 0.5
                    : adventure.wateringCan ? 0.35 : 0.2,
                moveEnergyEvery: currentWorld === "moon" && adventure.moonFarm
                  ? getGardenMoonSkillLevel(adventure.moonFarm, "gravity-treads") > 0 ? 2 : undefined
                  : getGardenSkillLevel(adventure, "energy-economy") > 0 ? 2 : undefined,
                waitEnergyGain: getGardenSkillLevel(adventure, "solar-routines") > 0 ? 4 : 2,
                isMoon: currentWorld === "moon",
                moonWater: adventure.moonFarm?.water,
              },
            }
          : {},
      );
      setStats(execution.stats);
      setShowBestStats(false);
      let updatedFarm = adventure;
      let frameIndex = 0;
      while (frameIndex < execution.frames.length && runToken.current === currentToken) {
        if (statusRef.current === "paused") {
          await new Promise<void>((resolve) => {
            frameTimer.current = window.setTimeout(resolve, 80);
          });
          continue;
        }
        const frame = execution.frames[frameIndex];
        setRun(frame);
        setAction(execution.actions[frameIndex]);
        if (gameMode === "adventure" && updatedFarm) {
          updatedFarm = applyGardenAdventureAction(updatedFarm, execution.actions[frameIndex], frame, Date.now(), selectedRobot);
          await persistAdventureState(updatedFarm);
        }
        const decision = execution.decisions.find((entry) => entry.actionIndex === frameIndex);
        if (decision) {
          setSensorFeedback(t("codeLab.game.sensorDecision", {
            sensor: t(`codeLab.game.sensors.${decision.sensor}`),
            argument: typeof decision.argument === "string" ? `"${decision.argument}"` : decision.argument,
            result: decision.matched ? t("codeLab.game.trueValue") : t("codeLab.game.falseValue"),
          }));
        }
        if (gameMode !== "adventure") await persist(executionState, frame, false);
        frameIndex += 1;
        await new Promise<void>((resolve) => {
          const quickStepLevel = gameMode === "adventure" && adventure
            ? getGardenSkillLevel(adventure, "quick-steps")
            : 0;
          frameTimer.current = window.setTimeout(resolve, Math.max(100, 240 - quickStepLevel * 60));
        });
      }
      if (runToken.current !== currentToken) return;
      setStatus("ready");
      if (gameMode === "adventure") {
        const endedRun = execution.actions.length > 0 ? execution.run : initialRun;
        setRun(endedRun);
        const successful = execution.message.startsWith("Mission complete:");
        setMessage(successful ? t("codeLab.game.adventure.adventureRunDone") : execution.message);
        setMessageIsError(!successful);
        if (updatedFarm) await persistAdventureState(updatedFarm);
      } else if (execution.message.startsWith("Mission complete:")) {
        await finishExecution(execution, executionState, currentMission);
      } else {
        const endedRun = execution.actions.length > 0 ? execution.run : initialRun;
        setRun(endedRun);
        setMessage(execution.message);
        setMessageIsError(!execution.message.startsWith("Mission progress:"));
        await persist(executionState, endedRun);
      }
    } catch (error) {
      if (runToken.current !== currentToken) return;
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : String(error));
      setMessageIsError(true);
    }
  }

  const statusRef = useRef(status);
  statusRef.current = status;

  function pauseProgram() {
    setStatus("paused");
  }

  function resumeProgram() {
    statusRef.current = "running";
    setStatus("running");
  }

  async function resetRun() {
    if (!gameState) return;
    runToken.current += 1;
    setStatus("ready");
    if (gameMode === "adventure" && adventure) {
      const resetFarm = currentWorld === "moon" && adventure.moonFarm
        ? {
            ...adventure,
            moonFarm: {
              ...adventure.moonFarm,
              robots: {
                ...adventure.moonFarm.robots,
                [selectedRobot]: selectedRobot === "assistant"
                  ? { x: adventure.moonFarm.width - 1, y: adventure.moonFarm.height - 1, direction: "west", movementProgress: 0 }
                  : { x: 0, y: 2, direction: "east", movementProgress: 0 },
              },
            },
          }
        : selectedRobot === "assistant" && adventure.secondRobot
          ? {
              ...adventure,
              secondRobot: { ...adventure.secondRobot, x: adventure.width - 1, y: adventure.height - 1, direction: "west" },
            }
          : { ...adventure, robot: { x: 0, y: 2, direction: "east" } };
      const reset = createGardenAdventureRun(resetFarm, gameState.resources, Date.now(), selectedRobot);
      setAdventure(resetFarm);
      setRun(reset);
      setAction(null);
      setSensorFeedback("");
      setMessage("");
      setMessageIsError(false);
      try {
        await persistAdventureState(resetFarm);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        setMessageIsError(true);
      }
      return;
    }
    const reset = createGardenRun(currentMission, gameState.resources, gameState.upgrades);
    setRun(reset);
    setAction(null);
    setSensorFeedback("");
    setMessage("");
    setMessageIsError(false);
    setStats(gameState.bestResults?.[currentMission.id] ?? null);
    setShowBestStats(Boolean(gameState.bestResults?.[currentMission.id]));
    await persist({ ...gameState, activeMissionId: currentMission.id }, reset);
  }

  async function selectMission(mission: GardenMission) {
    if (!gameState || GARDEN_MISSIONS.indexOf(mission) > unlockedThrough || status === "running" || status === "paused") return;
    runToken.current += 1;
    setGameMode("missions");
    setSelectedRobot("primary");
    setMissionId(mission.id);
    setSource(gameState.programs?.[mission.id] ?? initialProgram(mission.id));
    setHintVisible(false);
    setHintedMissionId("");
    setMessage("");
    setAction(null);
    setSensorFeedback("");
    setStats(gameState.bestResults?.[mission.id] ?? null);
    setShowBestStats(Boolean(gameState.bestResults?.[mission.id]));
    const nextRun = createGardenRun(mission, gameState.resources, gameState.upgrades);
    setRun(nextRun);
    setSelectedTile({ x: mission.robot.x, y: mission.robot.y });
    setGameState((current) => current ? { ...current, activeMode: "missions", activeMissionId: mission.id } : current);
    await persist({ ...gameState, activeMode: "missions", activeMissionId: mission.id }, nextRun);
  }

  async function researchUpgrade(upgradeId: GardenResearchId) {
    try {
      const researched = await researchGardenUpgrade(upgradeId);
      gameStateRef.current = researched;
      setGameState(researched);
      setUpgradeError("");
      if (upgradeId === "storehouse") {
        const newRun = createGardenRun(currentMission, researched.resources, researched.upgrades);
        setRun(newRun);
        await persist(researched, newRun);
      }
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : String(error));
    }
  }

  function showHint() {
    setHintVisible(true);
    setHintedMissionId(currentMission.id);
  }

  if (!gameState || !currentRun) {
    return <section className="garden-game" aria-busy="true"><p role={loadingError ? "alert" : "status"}>{loadingError || t("app.loading")}</p></section>;
  }

  return (
    <section className="garden-game">
      {gameMode === "missions" && adventureError && <p className="garden-game__error" role="alert">{adventureError}</p>}
      <CodeWorkspace
        mode={gameMode === "adventure" ? "garden-adventure" : "garden"}
        workspaceStyle
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        labels={{
          add: t("codeLab.addWidget"),
          windows: t("codeLab.windowMenu"),
          layout: t("codeLab.layout"),
          reset: t("codeLab.resetLayout"),
          balanced: t("codeLab.layoutBalanced"),
          focus: t("codeLab.layoutFocus"),
          reference: t("codeLab.layoutReference"),
          minimize: t("codeLab.windowMinimize"),
          maximize: t("codeLab.windowMaximize"),
          restore: t("codeLab.windowRestore"),
          close: t("codeLab.windowClose"),
          openWindow: t("codeLab.windowOpen"),
          layoutError: t("codeLab.layoutError"),
          empty: t("codeLab.workspaceEmpty"),
          emptyHint: t("codeLab.workspaceEmptyHint"),
        }}
        windows={gameMode === "adventure" && adventure ? [
          {
            id: "farm",
            title: t("codeLab.gameWindows.world"),
            initial: { x: 0.015, y: 0.015, width: 0.65, height: 0.72 },
            minWidth: 320,
            minHeight: 260,
            content: (
              <div className={`garden-game__play garden-adventure__world${currentWorld === "moon" ? " garden-adventure__world--moon" : ""}`}>
                <div className={`garden-moon__masthead${currentWorld === "moon" ? " is-moon" : ""}`}>
                  <div className="garden-moon__identity">
                    <span className="garden-game__section-label">{currentWorld === "moon" ? t("codeLab.game.moon.kicker") : t("codeLab.game.adventure.kicker")}</span>
                    <h2>{currentWorld === "moon" ? t("codeLab.game.moon.title") : t("codeLab.game.adventure.title")}</h2>
                    {currentWorld === "moon" && <p>{t("codeLab.game.moon.subtitle")}</p>}
                  </div>
                  <div className="garden-moon__masthead-actions">
                    {moonFarm ? (
                      <div aria-label={t("codeLab.game.moon.worldSelector")} className="garden-moon__world-switch" role="group">
                        <button aria-pressed={currentWorld === "earth"} onClick={() => void travelToWorld("earth")} type="button">
                          <Globe2 size={12} />{t("codeLab.game.moon.earth")}
                        </button>
                        <button aria-pressed={currentWorld === "moon"} onClick={() => void travelToWorld("moon")} type="button">
                          <Orbit size={12} />{t("codeLab.game.moon.title")}
                        </button>
                      </div>
                    ) : isGardenMoonExpeditionReady(adventure) ? (
                      <button
                        className="garden-moon__launch"
                        disabled={marketBusy || status !== "ready" || adventure.coins < GARDEN_MOON_EXPEDITION_COST}
                        onClick={() => void launchMoonExpedition()}
                        type="button"
                      ><Orbit size={13} />{t("codeLab.game.moon.launch", { cost: GARDEN_MOON_EXPEDITION_COST })}</button>
                    ) : null}
                    <button className="garden-game__build" onClick={() => void returnToMissions()} type="button">{t("codeLab.game.adventure.tutorials")}</button>
                  </div>
                </div>
                <GardenBoard
                  mission={currentMission}
                  run={currentRun}
                  world={currentWorld}
                  secondaryRobot={currentWorld === "moon"
                    ? moonFarm?.robots[selectedRobot === "assistant" ? "primary" : "assistant"]
                    : selectedRobot === "assistant" ? adventure.robot : adventure.secondRobot}
                  action={action}
                  selectedTile={selectedTile}
                  onSelectTile={setSelectedTile}
                  labels={{
                    selected: t("codeLab.selectedTile"),
                    robot: t("codeLab.robotAtTile"),
                    growthMax: 4,
                    stage: t("codeLab.game.adventure.growthStage"),
                    ready: t("codeLab.game.adventure.ready"),
                    watered: t("codeLab.game.adventure.watered"),
                    secondaryRobot: t("codeLab.game.adventure.robotAssistant"),
                    moonBoard: t("codeLab.game.moon.boardLabel", { width: currentMission.width, height: currentMission.height }),
                    crops: {
                      turnip: t("codeLab.game.adventure.crops.turnip"),
                      carrot: t("codeLab.game.adventure.crops.carrot"),
                      berry: t("codeLab.game.adventure.crops.berry"),
                      pumpkin: t("codeLab.game.adventure.crops.pumpkin"),
                      mooncap: t("codeLab.game.moon.crops.mooncap"),
                      moonleaf: t("codeLab.game.moon.crops.moonleaf"),
                      prismberry: t("codeLab.game.moon.crops.prismberry"),
                    },
                    kinds: {
                      soil: t("codeLab.tileKinds.soil"),
                      plant: t("codeLab.tileKinds.plant"),
                      ripe: t("codeLab.tileKinds.ripe"),
                      stone: t("codeLab.tileKinds.stone"),
                      wood: t("codeLab.tileKinds.wood"),
                      empty: t("codeLab.tileKinds.empty"),
                    },
                  }}
                />
                <div className={`garden-game__telemetry${currentWorld === "moon" ? " garden-moon__telemetry" : ""}`}>
                  <span><b>{t("codeLab.game.action")}</b>{action ? `${action.kind}${action.argument ? `("${action.argument}")` : "()"}` : t("codeLab.game.noAction")}</span>
                  <span><b>{currentWorld === "moon" ? t("codeLab.game.moon.credits") : t("codeLab.game.adventure.coins")}</b>{currentWorld === "moon" ? moonFarm?.credits ?? 0 : adventure.coins}</span>
                  {currentWorld === "moon" && <span><b>{t("codeLab.game.moon.water")}</b>{moonFarm?.water ?? 0}/{moonFarm ? getGardenMoonWaterCapacity(moonFarm) : 0}</span>}
                  <span>{status === "running" ? t("codeLab.game.running") : status === "paused" ? t("codeLab.game.paused") : t("codeLab.game.ready")}</span>
                </div>
              </div>
            ),
          },
          {
            id: "farm-editor",
            title: t("codeLab.gameWindows.editor"),
            initial: { x: 0.68, y: 0.015, width: 0.305, height: 0.68 },
            minWidth: 280,
            minHeight: 280,
            content: (
              <div className="garden-game__program">
                <div className="garden-game__program-head">
                  <div className="garden-game__program-title">
                    <span className="garden-game__section-label">{t("codeLab.game.program")}</span>
                    <span className="garden-game__language">GARDEN</span>
                    {adventure.secondRobot && (
                      <div aria-label={t("codeLab.game.adventure.robotPrograms")} className="garden-adventure__robot-switch" role="group">
                        <button
                          aria-pressed={selectedRobot === "primary"}
                          onClick={() => void selectAdventureRobot("primary")}
                          type="button"
                        >{t("codeLab.game.adventure.robotPrimary")}</button>
                        <button
                          aria-pressed={selectedRobot === "assistant"}
                          onClick={() => void selectAdventureRobot("assistant")}
                          type="button"
                        >{t("codeLab.game.adventure.robotAssistant")}</button>
                      </div>
                    )}
                  </div>
                  <button aria-label={t("codeLab.reference.title")} className="garden-game__help" onClick={() => setReferenceOpen(true)} type="button"><BookOpen size={15} /></button>
                  <button aria-label={t("codeLab.hint")} className="garden-game__help" onClick={showHint} type="button"><CircleHelp size={15} /></button>
                </div>
                <CodeInput
                  disabled={status === "running" || status === "paused"}
                  label={t("codeLab.game.program")}
                  language="garden"
                  onChange={setSource}
                  suggestions={(value, cursor) => getGardenSuggestions(
                    value,
                    currentMission,
                    cursor,
                    gameState.upgrades,
                    true,
                    availableAdventureCrops,
                  ).map((suggestion) => ({
                    insert: suggestion.insert,
                    signature: suggestion.signature,
                    detail: t(suggestion.detailKey),
                  }))}
                  value={source}
                />
                {hintVisible && hintedMissionId === currentMission.id && <p className="garden-game__hint">{t("codeLab.game.adventure.hint")}</p>}
                <p className="garden-game__editor-hint">{t(currentWorld === "moon" ? "codeLab.game.moon.editorHint" : "codeLab.game.adventure.editorHint")}</p>
                <div className="garden-game__controls">
                  {status === "running"
                    ? <button className="garden-game__control garden-game__control--pause" onClick={pauseProgram} type="button"><Pause size={13} />{t("codeLab.game.pause")}</button>
                    : status === "paused"
                      ? <button className="garden-game__control garden-game__control--run" onClick={resumeProgram} type="button"><Play size={13} />{t("codeLab.game.resume")}</button>
                      : <button className="garden-game__control garden-game__control--run" onClick={() => void runProgram()} type="button"><Play size={13} />{t("codeLab.game.run")}</button>}
                  <button aria-label={t("codeLab.game.reset")} className="garden-game__control garden-game__control--reset" onClick={() => void resetRun()} type="button"><RotateCcw size={13} />{t("codeLab.game.reset")}</button>
                </div>
                {message && <p className={`garden-game__result${messageIsError ? " is-error" : " is-success"}`} role={messageIsError ? "alert" : "status"}>{message}</p>}
              </div>
            ),
          },
          {
            id: "market",
            title: currentWorld === "moon" ? t("codeLab.game.moon.market") : t("codeLab.gameWindows.workshop"),
            initial: { x: 0.015, y: 0.75, width: 0.65, height: 0.235 },
            minWidth: 320,
            minHeight: 180,
            content: (
              currentWorld === "moon" && moonFarm ? (
              <div className="garden-moon__market">
                <div className="garden-adventure__market-head">
                  <span><b>{moonFarm.credits}</b> {t("codeLab.game.moon.credits")}</span>
                  <span className="garden-moon__water-readout"><Droplets size={12} />{moonFarm.water}/{getGardenMoonWaterCapacity(moonFarm)} {t("codeLab.game.moon.water")}</span>
                  <button className="garden-game__build" disabled={marketBusy || status !== "ready" || !Object.values(moonFarm.harvest).some((amount) => amount > 0)} onClick={() => void updateMoonFarm(sellGardenMoonHarvest)} type="button">{t("codeLab.game.moon.sellAll")}</button>
                </div>
                <p className="garden-moon__environment"><Droplets size={12} />{t("codeLab.game.moon.environment")}</p>
                <div className="garden-moon__seed-list">
                  {(Object.keys(GARDEN_MOON_CROPS) as GardenMoonCropId[]).map((crop) => {
                    const available = getGardenMoonAvailableCrops(moonFarm).includes(crop);
                    const item = GARDEN_MOON_CROPS[crop];
                    return <div className={`garden-moon__seed garden-moon__seed--${crop}`} key={crop}>
                      <span className="garden-adventure__crop-mark" aria-hidden="true" />
                      <span><b>{t(`codeLab.game.moon.crops.${crop}`)}</b><small>{available
                        ? t("codeLab.game.adventure.seedStock", { count: moonFarm.seeds[crop] })
                        : t("codeLab.game.moon.cropLocked")}</small></span>
                      <button className="garden-game__build" disabled={marketBusy || status !== "ready" || !available || moonFarm.credits < item.seedCost} onClick={() => void updateMoonFarm((farm) => buyGardenMoonSeeds(farm, crop))} type="button">
                        {t("codeLab.game.moon.buySeeds", { count: item.seedPack, cost: item.seedCost })}
                      </button>
                    </div>;
                  })}
                </div>
                <div className="garden-moon__market-actions">
                  <button disabled={marketBusy || status !== "ready" || moonFarm.water >= getGardenMoonWaterCapacity(moonFarm) || moonFarm.credits < GARDEN_MOON_WATER_COST} onClick={() => void updateMoonFarm(refillGardenMoonWater)} type="button">
                    <b>{t("codeLab.game.moon.refillWater", { count: GARDEN_MOON_WATER_PACK, cost: GARDEN_MOON_WATER_COST })}</b>
                    <small>{t("codeLab.game.moon.waterReserve", { current: moonFarm.water, max: getGardenMoonWaterCapacity(moonFarm) })}</small>
                  </button>
                  <button disabled={marketBusy || status !== "ready" || moonFarm.expansions >= 4 || moonFarm.credits < 80 + moonFarm.expansions * 60} onClick={() => void updateMoonFarm(expandGardenMoonFarm)} type="button">
                    <b>{t("codeLab.game.moon.expand")}</b><small>{t("codeLab.game.moon.cost", { cost: 80 + moonFarm.expansions * 60 })}</small>
                  </button>
                </div>
                {adventureError && <p className="garden-game__error" role="alert">{adventureError}</p>}
              </div>
              ) : (
              <div className="garden-adventure__market">
                <div className="garden-adventure__market-head">
                  <span><b>{adventure.coins}</b> {t("codeLab.game.adventure.coins")}</span>
                  <button className="garden-game__build" disabled={marketBusy || status !== "ready" || !Object.values(adventure.harvest).some((amount) => amount > 0)} onClick={() => void updateAdventure(sellGardenHarvest)} type="button">{t("codeLab.game.adventure.sellAll")}</button>
                </div>
                <div className="garden-adventure__seed-list">
                  {(Object.keys(GARDEN_CROPS) as GardenCropId[]).map((crop) => {
                    const available = getGardenAvailableCrops(adventure).includes(crop);
                    const pack = getGardenSeedPack(adventure, crop);
                    return <div className={`garden-adventure__seed garden-adventure__seed--${crop}`} key={crop}>
                      <span className="garden-adventure__crop-mark" aria-hidden="true" />
                      <span><b>{t(`codeLab.game.adventure.crops.${crop}`)}</b><small>{available
                        ? t("codeLab.game.adventure.seedStock", { count: adventure.seeds[crop] })
                        : t("codeLab.game.adventure.cropLocked")}</small></span>
                      <button className="garden-game__build" disabled={marketBusy || status !== "ready" || !available || adventure.coins < GARDEN_CROPS[crop].seedCost} onClick={() => void updateAdventure((farm) => buyGardenSeeds(farm, crop))} type="button">
                        {t("codeLab.game.adventure.buySeeds", { count: pack, cost: GARDEN_CROPS[crop].seedCost })}
                      </button>
                    </div>;
                  })}
                </div>
                <div className="garden-adventure__upgrades">
                  <button className={adventure.richSoil ? "is-owned" : ""} disabled={marketBusy || status !== "ready" || adventure.richSoil || adventure.coins < 60} onClick={() => void updateAdventure((farm) => buyGardenUpgrade(farm, "richSoil"))} type="button">
                    <b>{t("codeLab.game.adventure.richSoil")}</b><small>{adventure.richSoil ? t("codeLab.game.owned") : t("codeLab.game.adventure.upgradeCost", { cost: 60 })}</small>
                  </button>
                  <button className={adventure.wateringCan ? "is-owned" : ""} disabled={marketBusy || status !== "ready" || adventure.wateringCan || adventure.coins < 45} onClick={() => void updateAdventure((farm) => buyGardenUpgrade(farm, "wateringCan"))} type="button">
                    <b>{t("codeLab.game.adventure.wateringCan")}</b><small>{adventure.wateringCan ? t("codeLab.game.owned") : t("codeLab.game.adventure.upgradeCost", { cost: 45 })}</small>
                  </button>
                  <button disabled={marketBusy || status !== "ready" || adventure.expansions >= 4 + getGardenSkillLevel(adventure, "field-survey") || adventure.coins < 50 + adventure.expansions * 35} onClick={() => void updateAdventure(expandGarden)} type="button">
                    <b>{t("codeLab.game.adventure.expand")}</b><small>{t("codeLab.game.adventure.upgradeCost", { cost: 50 + adventure.expansions * 35 })}</small>
                  </button>
                </div>
                {!moonFarm && (
                  <div className="garden-moon__expedition">
                    <div><Orbit size={15} /><span><b>{t("codeLab.game.moon.expeditionTitle")}</b><small>{t("codeLab.game.moon.expeditionRequirements")}</small></span></div>
                    <button
                      disabled={marketBusy || status !== "ready" || !isGardenMoonExpeditionReady(adventure) || adventure.coins < GARDEN_MOON_EXPEDITION_COST}
                      onClick={() => void launchMoonExpedition()}
                      type="button"
                    >{isGardenMoonExpeditionReady(adventure)
                        ? t("codeLab.game.moon.launch", { cost: GARDEN_MOON_EXPEDITION_COST })
                        : t("codeLab.game.moon.expeditionLocked")}</button>
                  </div>
                )}
                {adventureError && <p className="garden-game__error" role="alert">{adventureError}</p>}
              </div>
              )
            ),
          },
          {
            id: "farm-inventory",
            title: currentWorld === "moon" ? t("codeLab.game.moon.inventory") : t("codeLab.gameWindows.inventory"),
            initial: { x: 0.68, y: 0.72, width: 0.305, height: 0.265 },
            minWidth: 260,
            minHeight: 180,
            content: (
              currentWorld === "moon" && moonFarm ? (
              <div className="garden-moon__inventory">
                <span className="garden-game__section-label">{t("codeLab.game.moon.harvested")}</span>
                {(Object.keys(GARDEN_MOON_CROPS) as GardenMoonCropId[]).map((crop) => (
                  <div className={`garden-moon__crop-row garden-moon__crop-row--${crop}`} key={crop}>
                    <span className="garden-adventure__crop-mark" aria-hidden="true" />
                    <b>{t(`codeLab.game.moon.crops.${crop}`)}</b>
                    <span>{moonFarm.harvest[crop]} · {t("codeLab.game.moon.sellPrice", { price: GARDEN_MOON_CROPS[crop].sellPrice })}</span>
                  </div>
                ))}
                <div className="garden-game__inventory" aria-label={t("codeLab.game.resources")}>
                  <Resource icon={<Zap size={13} />} label={t("codeLab.game.energy")} value={currentRun.resources.energy} />
                  {adventure.secondRobot && <Resource icon={<Bot size={13} />} label={t("codeLab.game.adventure.assistantEnergy")} value={adventure.secondRobot.energy} />}
                  <Resource icon={<Droplets size={13} />} label={t("codeLab.game.moon.water")} value={`${moonFarm.water} / ${getGardenMoonWaterCapacity(moonFarm)}`} />
                  <Resource icon={<Sprout size={13} />} label={t("codeLab.game.moon.basket")} value={`${Object.values(moonFarm.harvest).reduce((total, count) => total + count, 0)} / ${currentRun.storageCapacity}`} />
                  <Resource icon={<Sprout size={13} />} label={t("codeLab.game.adventure.plots")} value={moonFarm.width * moonFarm.height} />
                </div>
              </div>
              ) : (
              <div className="garden-adventure__inventory">
                <span className="garden-game__section-label">{t("codeLab.game.adventure.harvested")}</span>
                {(Object.keys(GARDEN_CROPS) as GardenCropId[]).map((crop) => (
                  <div className={`garden-adventure__crop-row garden-adventure__crop-row--${crop}`} key={crop}>
                    <span className="garden-adventure__crop-mark" aria-hidden="true" />
                    <b>{t(`codeLab.game.adventure.crops.${crop}`)}</b>
                    <span>{adventure.harvest[crop]} · {t("codeLab.game.adventure.sellPrice", { price: GARDEN_CROPS[crop].sellPrice })}</span>
                  </div>
                ))}
                <div className="garden-game__inventory" aria-label={t("codeLab.game.resources")}>
                  <Resource icon={<Zap size={13} />} label={t("codeLab.game.energy")} value={currentRun.resources.energy} />
                  {adventure.secondRobot && (
                    <Resource icon={<Bot size={13} />} label={t("codeLab.game.adventure.assistantEnergy")} value={adventure.secondRobot.energy} />
                  )}
                  <Resource
                    icon={<Sprout size={13} />}
                    label={t("codeLab.game.adventure.basket")}
                    value={`${Object.values(adventure.harvest).reduce((total, count) => total + count, 0)} / ${currentRun.storageCapacity}`}
                  />
                  <Resource icon={<Sprout size={13} />} label={t("codeLab.game.adventure.plots")} value={adventure.width * adventure.height} />
                </div>
              </div>
              )
            ),
          },
          {
            id: "reference",
            title: t("codeLab.reference.title"),
            initial: { x: 0.3, y: 0.1, width: 0.4, height: 0.7 },
            minWidth: 300,
            minHeight: 250,
            openByDefault: false,
            content: <CodeReference />,
          },
          {
            id: "skill-tree",
            title: t("codeLab.game.skillTree.title"),
            initial: { x: 0.18, y: 0.16, width: 0.64, height: 0.68 },
            minWidth: 350,
            minHeight: 300,
            openByDefault: false,
            content: (
              <GardenSkillTree
                busy={marketBusy || status !== "ready"}
                farm={adventure}
                onPurchase={(skill: GardenSkillId) => void updateAdventure((farm) => buyGardenSkill(farm, skill))}
                onPurchaseRobot={() => void updateAdventure(buySecondGardenRobot)}
              />
            ),
          },
          ...(moonFarm ? [{
            id: "moon-skill-tree",
            title: t("codeLab.game.skillTree.moonSkillTree.title"),
            initial: { x: 0.18, y: 0.16, width: 0.62, height: 0.63 },
            minWidth: 360,
            minHeight: 280,
            openByDefault: false,
            content: (
              <GardenMoonSkillTree
                busy={marketBusy || status !== "ready"}
                farm={moonFarm}
                onPurchase={(skill: GardenMoonSkillId) => void updateMoonFarm((farm) => buyGardenMoonSkill(farm, skill))}
              />
            ),
          }] : []),
        ] : [
          {
            id: "missions",
            title: t("codeLab.gameWindows.mission"),
            initial: { x: 0.01, y: 0.015, width: 0.22, height: 0.43 },
            minWidth: 250,
            minHeight: 180,
            openByDefault: true,
            content: (
              <div className="garden-game__missions">
                <div className="garden-game__panel-heading"><span>{t("codeLab.game.mission")}</span><span>{gameState.completedMissionIds.length}/{GARDEN_MISSIONS.length}</span></div>
                <div className="garden-game__mission-list">
            {GARDEN_MISSIONS.map((mission, index) => {
              const isLocked = index > unlockedThrough ||
                Boolean(mission.requiresUpgrade && !gameState.upgrades.includes(mission.requiresUpgrade));
              const done = gameState.completedMissionIds.includes(mission.id);
              return (
                <button
                  aria-current={mission.id === missionId ? "step" : undefined}
                  className={`${mission.id === missionId ? "is-active " : ""}${done ? "is-done" : ""}`}
                  disabled={isLocked}
                  key={mission.id}
                  onClick={() => void selectMission(mission)}
                  title={isLocked ? t("codeLab.game.locked") : undefined}
                  type="button"
                >
                  <span>{done ? <Check size={12} /> : `0${index + 1}`}</span>
                  <span><b>{t(`codeLab.game.missionNames.${mission.id}.name`)}</b><small>{t(`codeLab.game.missionNames.${mission.id}.concept`)}</small></span>
                  {isLocked && <i aria-hidden="true">·</i>}
                </button>
              );
            })}
                </div>
                {isGardenAdventureUnlocked(gameState.completedMissionIds) && (
                  <button className="garden-adventure__launch" onClick={() => void enterAdventure()} type="button">
                    <Sprout size={14} />{t("codeLab.game.adventure.enter")}
                  </button>
                )}
              </div>
            ),
          },
          {
            id: "instructions",
            title: t("codeLab.gameWindows.instructions"),
            initial: { x: 0.01, y: 0.47, width: 0.22, height: 0.51 },
            minWidth: 250,
            minHeight: 180,
            openByDefault: false,
            content: (
              <div className="garden-game__instructions">
                <span className="garden-game__section-label">{t("codeLab.game.missionGoal")}</span>
                <p>{t(`codeLab.game.missionNames.${currentMission.id}.objective`)}</p>
                <span className="garden-game__concept">{t(`codeLab.game.missionNames.${currentMission.id}.concept`)}</span>
                {currentMission.sensorTutorial && (
                  <div className="garden-game__sensor-guide">
                    <b>{t("codeLab.game.sensorGuideTitle")}</b>
                    <span><code>tile_is(kind)</code> {t("codeLab.game.sensorTileHelp")}</span>
                    <span><code>energy_at_least(amount)</code> {t("codeLab.game.sensorEnergyHelp")}</span>
                    <span><code>storage_has_room(resource)</code> {t("codeLab.game.sensorStorageHelp")}</span>
                  </div>
                )}
                {hintVisible && hintedMissionId === missionId && <p className="garden-game__hint">{currentMission.hint}</p>}
              </div>
            ),
          },
          {
            id: "world",
            title: t("codeLab.gameWindows.world"),
            initial: { x: 0.245, y: 0.015, width: 0.48, height: 0.66 },
            minWidth: 320,
            minHeight: 250,
            content: (
              <div className="garden-game__play">
                <div className="garden-game__world-head">
                  <div><span className="garden-game__section-label">{t("codeLab.game.world")}</span><h2>{t(`codeLab.game.missionNames.${currentMission.id}.name`)}</h2></div>
                  <span className="garden-game__concept">{t(`codeLab.game.missionNames.${currentMission.id}.concept`)}</span>
                </div>
                <GardenBoard
                  mission={currentMission}
                  run={currentRun}
                  action={action}
                  selectedTile={selectedTile}
                  onSelectTile={setSelectedTile}
                  labels={{
                    selected: t("codeLab.selectedTile"),
                    robot: t("codeLab.robotAtTile"),
                    kinds: {
                      soil: t("codeLab.tileKinds.soil"),
                      plant: t("codeLab.tileKinds.plant"),
                      ripe: t("codeLab.tileKinds.ripe"),
                      stone: t("codeLab.tileKinds.stone"),
                      wood: t("codeLab.tileKinds.wood"),
                      empty: t("codeLab.tileKinds.empty"),
                    },
                  }}
                />
                <div className="garden-game__telemetry">
                  <span><b>{t("codeLab.game.action")}</b>{action ? `${action.kind}${action.argument ? `("${action.argument}")` : "()"}` : t("codeLab.game.noAction")}</span>
                  <span><b>{t("codeLab.game.steps")}</b>{currentRun.steps}/{currentMission.maxSteps}</span>
                  <span className={status === "paused" ? "is-paused" : ""}>{status === "running" ? t("codeLab.game.running") : status === "paused" ? t("codeLab.game.paused") : t("codeLab.game.ready")}</span>
                </div>
                {sensorFeedback && <div className="garden-game__sensor-feedback" aria-live="polite">{sensorFeedback}</div>}
              </div>
            ),
          },
          {
            id: "editor",
            title: t("codeLab.gameWindows.editor"),
            initial: { x: 0.735, y: 0.015, width: 0.255, height: 0.66 },
            minWidth: 280,
            minHeight: 280,
            content: (
              <div className="garden-game__program">
                <div className="garden-game__program-head">
                  <div><span className="garden-game__section-label">{t("codeLab.game.program")}</span><span className="garden-game__language">GARDEN</span></div>
                  <button aria-label={t("codeLab.reference.title")} className="garden-game__help" onClick={() => setReferenceOpen(true)} type="button"><BookOpen size={15} /></button>
                  <button aria-label={t("codeLab.hint")} className="garden-game__help" onClick={showHint} type="button"><CircleHelp size={15} /></button>
                </div>
                <CodeInput
                  disabled={status === "running" || status === "paused"}
                  label={t("codeLab.game.program")}
                  language="garden"
                  onChange={(value) => setSource(value)}
                  suggestions={(value, cursor) => getGardenSuggestions(value, currentMission, cursor, gameState.upgrades, false).map((suggestion) => ({
                    insert: suggestion.insert,
                    signature: suggestion.signature,
                    detail: t(suggestion.detailKey),
                  }))}
                  value={source}
                />
                <p className="garden-game__editor-hint">{t("codeLab.game.codeHint")}</p>
                <div className="garden-game__controls">
                  {status === "running"
                    ? <button className="garden-game__control garden-game__control--pause" onClick={pauseProgram} type="button"><Pause size={13} />{t("codeLab.game.pause")}</button>
                    : status === "paused"
                      ? <button className="garden-game__control garden-game__control--run" onClick={resumeProgram} type="button"><Play size={13} />{t("codeLab.game.resume")}</button>
                      : <button className="garden-game__control garden-game__control--run" onClick={() => void runProgram()} type="button"><Play size={13} />{t("codeLab.game.run")}</button>}
                  <button aria-label={t("codeLab.game.reset")} className="garden-game__control garden-game__control--reset" onClick={() => void resetRun()} type="button"><RotateCcw size={13} />{t("codeLab.game.reset")}</button>
                </div>
                {gameState.completedMissionIds.includes(currentMission.id) && currentMission.id !== GARDEN_MISSIONS.at(-1)?.id && (
                  <button className="garden-game__next" onClick={() => void selectMission(GARDEN_MISSIONS[missionIndex + 1])} type="button">
                    {t("codeLab.game.nextMission")}<span>→</span>
                  </button>
                )}
              </div>
            ),
          },
          {
            id: "workshop",
            title: t("codeLab.gameWindows.workshop"),
            initial: { x: 0.245, y: 0.69, width: 0.27, height: 0.3 },
            minWidth: 250,
            minHeight: 180,
            openByDefault: false,
            content: (
              <div className="garden-game__upgrade">
            <div className="garden-game__upgrade-title"><Hammer size={13} /><span>{t("codeLab.game.research")}</span></div>
            {GARDEN_RESEARCH.map((research) => {
              const owned = gameState.upgrades.includes(research.id);
              const unlocked = gameState.completedMissionIds.includes(research.prerequisiteMission);
              const canAfford = gameState.resources.wood >= research.cost.wood && gameState.resources.stone >= research.cost.stone;
              const storehouse = research.id === "storehouse";
              return (
                <div className="garden-game__research-node" key={research.id}>
                  <b>{t(`codeLab.game.researchNames.${research.id}`)}</b>
                  <p>{t(`codeLab.game.researchEffects.${research.id}`)}</p>
                  {owned
                    ? <span className="garden-game__built"><Check size={12} />{t("codeLab.game.owned")}</span>
                    : unlocked
                      ? <button
                          className="garden-game__build"
                          disabled={!canAfford}
                          onClick={() => void researchUpgrade(research.id)}
                          type="button"
                        >{t(storehouse ? "codeLab.game.buy" : "codeLab.game.researchCost", research.cost)}</button>
                      : <span className="garden-game__locked-upgrade">{t("codeLab.game.availableAfter", {
                          mission: t(`codeLab.game.missionNames.${research.prerequisiteMission}.name`),
                        })}</span>}
                </div>
              );
            })}
            {upgradeError && <p className="garden-game__error" role="alert">{upgradeError}</p>}
              </div>
            ),
          },
          {
            id: "inventory",
            title: t("codeLab.gameWindows.inventory"),
            initial: { x: 0.525, y: 0.69, width: 0.2, height: 0.3 },
            minWidth: 250,
            minHeight: 180,
            openByDefault: false,
            content: (
              <div className="garden-game__inventory-window">
                <div className="garden-game__inventory" aria-label={t("codeLab.game.resources")}>
                  <Resource icon={<Leaf size={13} />} label={t("codeLab.game.plants")} value={currentRun.resources.plants} />
                  <Resource icon={<Trees size={13} />} label={t("codeLab.game.wood")} value={currentRun.resources.wood} />
                  <Resource icon={<Mountain size={13} />} label={t("codeLab.game.stone")} value={currentRun.resources.stone} />
                  <Resource icon={<Sprout size={13} />} label={t("codeLab.game.seeds")} value={currentRun.resources.seeds} />
                  <Resource icon={<Zap size={13} />} label={t("codeLab.game.energy")} value={currentRun.resources.energy} />
                </div>
                {stats && (
                  <div className="garden-game__stats" aria-label={t(showBestStats ? "codeLab.game.bestRun" : "codeLab.game.runStats")}>
                    <span>{t(showBestStats ? "codeLab.game.bestRun" : "codeLab.game.runStats")}</span>
                    <b>{t("codeLab.game.instructionsStat", { count: stats.instructions })}</b>
                    <b>{t("codeLab.game.harvestedStat", { count: stats.harvested })}</b>
                    <b>{t("codeLab.game.collectedStat", { count: stats.collected })}</b>
                    <b>{t("codeLab.game.energyStat", { consumed: stats.energyConsumed, generated: stats.energyGenerated })}</b>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "output",
            title: t("codeLab.gameWindows.output"),
            initial: { x: 0.735, y: 0.69, width: 0.255, height: 0.3 },
            minWidth: 250,
            minHeight: 180,
            content: (
              <div className="garden-game__output">
                {message
                  ? <p className={`garden-game__result${messageIsError ? " is-error" : currentRun.completed ? " is-success" : ""}`} role={messageIsError ? "alert" : "status"}>
                      {currentRun.completed && <Check size={14} />}{message}
                    </p>
                  : <p className="garden-game__output-empty">{t("codeLab.game.outputEmpty")}</p>}
                {messageIsError && <p className="garden-game__next-step">{t("codeLab.game.tryAgain")}</p>}
              </div>
            ),
          },
          {
            id: "reference",
            title: t("codeLab.reference.title"),
            initial: { x: 0.54, y: 0.13, width: 0.32, height: 0.72 },
            minWidth: 300,
            minHeight: 250,
            openByDefault: false,
            content: <CodeReference />,
          },
        ]}
      />
      {referenceOpen && createPortal(
        <div className="garden-game__reference-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReferenceOpen(false);
        }}>
          <section aria-labelledby="garden-reference-title" aria-modal="true" className="garden-game__reference-dialog" onKeyDown={(event) => {
            if (event.key === "Escape") setReferenceOpen(false);
          }} role="dialog">
            <header>
              <h2 id="garden-reference-title">{t("codeLab.reference.title")}</h2>
              <button aria-label={t("codeLab.windowClose")} autoFocus onClick={() => setReferenceOpen(false)} type="button"><X size={16} /></button>
            </header>
            <CodeReference />
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function Resource({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return <span className="garden-game__resource">{icon}<small>{label}</small><b>{value}</b></span>;
}

function GardenBoard({
  mission,
  run,
  world = "earth",
  secondaryRobot,
  action,
  selectedTile,
  onSelectTile,
  labels,
}: {
  mission: GardenMission;
  run: GardenRunState;
  world?: GardenWorldId;
  secondaryRobot?: { x: number; y: number; direction: string };
  action: GardenAction | null;
  selectedTile: { x: number; y: number } | null;
  onSelectTile: (tile: { x: number; y: number }) => void;
  labels: {
    selected: string;
    robot: string;
    kinds: Record<string, string>;
    crops?: Partial<Record<GardenCropType, string>>;
    growthMax?: number;
    stage?: string;
    ready?: string;
    watered?: string;
    secondaryRobot?: string;
    moonBoard?: string;
  };
}) {
  const selected = selectedTile ?? run.robot;
  const selectedWorldTile = run.tiles.find((tile) => tile.x === selected.x && tile.y === selected.y);
  const isRobotHere = selected.x === run.robot.x && selected.y === run.robot.y;
  const isSecondaryRobotHere = selected.x === secondaryRobot?.x && selected.y === secondaryRobot?.y;

  function selectAtPoint(clientX: number, clientY: number, svg: SVGSVGElement) {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const viewWidth = (mission.width + mission.height - 2) * 48 + 108;
    const viewHeight = (mission.width + mission.height - 2) * 25 + 70;
    const minX = 380 - (mission.height - 1) * 48 - 54;
    const point = {
      x: minX + (clientX - bounds.left) * viewWidth / bounds.width,
      y: (clientY - bounds.top) * viewHeight / bounds.height,
    };
    const tile = gardenCoordinatesAtPoint(point, mission.width, mission.height);
    if (tile) onSelectTile(tile);
  }

  const viewWidth = (mission.width + mission.height - 2) * 48 + 108;
  const viewHeight = (mission.width + mission.height - 2) * 25 + 70;
  const viewMinX = 380 - (mission.height - 1) * 48 - 54;

  return (
    <div className={`garden-board${world === "moon" ? " garden-board--moon" : ""}`}>
      <div className="garden-board__stage">
        <svg
          aria-label={world === "moon"
            ? labels.moonBoard ?? `${mission.width} × ${mission.height} lunar farm.`
            : `${mission.width} × ${mission.height} isometric garden. Click or focus a tile to inspect it.`}
          className="garden-board__svg"
          onClick={(event) => selectAtPoint(event.clientX, event.clientY, event.currentTarget)}
          role="group"
          viewBox={`${viewMinX} 0 ${viewWidth} ${viewHeight}`}
        >
          <title>{world === "moon" ? "Moon expedition garden" : `${mission.width} × ${mission.height} isometric garden`}</title>
          {world === "moon" && <MoonSkyBackdrop viewMinX={viewMinX} viewWidth={viewWidth} viewHeight={viewHeight} />}
          {run.tiles
            .slice()
            .sort((a, b) => a.x + a.y - (b.x + b.y) || a.y - b.y)
            .map((tile) => {
              const centerX = 380 + (tile.x - tile.y) * 48;
              const centerY = 42 + (tile.x + tile.y) * 25;
              const robotHere = tile.x === run.robot.x && tile.y === run.robot.y;
              const secondaryRobotHere = tile.x === secondaryRobot?.x && tile.y === secondaryRobot?.y;
              const tileSelected = tile.x === selected.x && tile.y === selected.y;
              const TileIcon = tile.kind === "ripe" || tile.kind === "plant" ? Sprout :
                tile.kind === "stone" ? Mountain : tile.kind === "wood" ? Trees : null;
              const direction = { north: 0, east: 90, south: 180, west: 270 }[run.robot.direction];
              const cropLabel = tile.crop ? labels.crops?.[tile.crop] ?? tile.crop : "";
              const tileDescription = tile.crop
                ? `${cropLabel}, ${tile.kind === "ripe" ? labels.ready ?? labels.kinds.ripe : `${labels.stage ?? "Growth"} ${tile.growth ?? 0}/${labels.growthMax ?? 2}`}`
                : labels.kinds[tile.kind] ?? tile.kind;
              return (
                <g
                  aria-label={`Tile ${tile.x + 1}, ${tile.y + 1}: ${tileDescription}${robotHere ? `, ${labels.robot}` : ""}${secondaryRobotHere ? `, ${labels.secondaryRobot ?? ""}` : ""}`}
                  className={`garden-board__tile garden-board__tile--${tile.kind}${tileSelected ? " is-selected" : ""}`}
                  key={`${tile.x}:${tile.y}`}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectTile({ x: tile.x, y: tile.y });
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectTile({ x: tile.x, y: tile.y });
                  }}
                  role="button"
                  tabIndex={0}
                  transform={`translate(${centerX} ${centerY})`}
                >
                  <path className="garden-board__side garden-board__side--left" d="M-48 0 0 24 0 34 -48 10Z" />
                  <path className="garden-board__side garden-board__side--right" d="M0 24 48 0 48 10 0 34Z" />
                  <path className="garden-board__surface" d="M0 -24 48 0 0 24 -48 0Z" />
                  {world === "moon" && <MoonTileDetail />}
                  {tileSelected && <path className="garden-board__selection" d="M0 -22 44 0 0 22 -44 0Z" />}
                  {tile.crop ? (
                    <CropSprite crop={tile.crop} stage={tile.growth ?? 0} />
                  ) : TileIcon && (
                    <TileIcon
                      className={`garden-board__object garden-board__object--${tile.kind}`}
                      height={tile.kind === "stone" ? 24 : 22}
                      width={tile.kind === "stone" ? 24 : 22}
                      x={-11}
                      y={-28}
                      strokeWidth={1.8}
                    />
                  )}
                  {secondaryRobotHere && (
                    <g
                      className="garden-board__robot garden-board__robot--secondary"
                      transform={`translate(0 -38) rotate(${({ north: 0, east: 90, south: 180, west: 270 } satisfies Record<GardenDirection, number>)[secondaryRobot.direction as GardenDirection]})`}
                      aria-hidden="true"
                    >
                      <ellipse className="garden-board__robot-shadow" cx="0" cy="13" rx="20" ry="8" />
                      <path className="garden-board__robot-base" d="M-17 -5 -10 -17 10 -17 17 -5 13 10 -13 10Z" />
                      <Bot className="garden-board__robot-icon" x={-12} y={-15} width={24} height={24} strokeWidth={1.8} />
                      <path className="garden-board__robot-nose" d="M0 -23 3 -17 -3 -17Z" />
                    </g>
                  )}
                  {robotHere && (
                    <g
                      className={`garden-board__robot garden-board__robot--${action?.kind ?? "idle"}`}
                      transform={`translate(0 -38) rotate(${direction})`}
                      aria-hidden="true"
                    >
                      <ellipse className="garden-board__robot-shadow" cx="0" cy="13" rx="20" ry="8" />
                      <path className="garden-board__robot-base" d="M-17 -5 -10 -17 10 -17 17 -5 13 10 -13 10Z" />
                      <Bot className="garden-board__robot-icon" x={-12} y={-15} width={24} height={24} strokeWidth={1.8} />
                      <path className="garden-board__robot-nose" d="M0 -23 3 -17 -3 -17Z" />
                    </g>
                  )}
                  <text className="garden-board__coordinates" x="0" y="13">{tile.x + 1},{tile.y + 1}</text>
                </g>
              );
            })}
        </svg>
      </div>
      <div className="garden-board__inspector" aria-live="polite">
        <span>{labels.selected}</span>
        <b>{selected.x + 1}, {selected.y + 1}</b>
        <span>{labels.kinds[selectedWorldTile?.kind ?? "empty"] ?? labels.kinds.empty}</span>
        {selectedWorldTile?.growth !== undefined && <span>{selectedWorldTile.growth}/{labels.growthMax ?? 2}</span>}
        {selectedWorldTile?.watered && labels.watered && <span>{labels.watered}</span>}
        {isRobotHere && <span className="garden-board__robot-presence"><Bot size={12} />{labels.robot}</span>}
        {isSecondaryRobotHere && <span className="garden-board__robot-presence"><Bot size={12} />{labels.secondaryRobot}</span>}
      </div>
    </div>
  );
}

function MoonSkyBackdrop({ viewMinX, viewWidth, viewHeight }: { viewMinX: number; viewWidth: number; viewHeight: number }) {
  const stars = [
    [0.08, 0.11, 1.1], [0.2, 0.23, 0.8], [0.33, 0.08, 1.2], [0.48, 0.2, 0.7],
    [0.63, 0.1, 0.9], [0.82, 0.22, 1.2], [0.92, 0.09, 0.8], [0.71, 0.34, 0.7],
    [0.12, 0.38, 0.65], [0.39, 0.34, 0.8], [0.9, 0.4, 0.9],
  ];
  return (
    <g className="garden-moon__sky" aria-hidden="true">
      <rect x={viewMinX} y="0" width={viewWidth} height={viewHeight} fill="#11152b" />
      <path d={`M${viewMinX} 112 Q${viewMinX + viewWidth * 0.24} 58 ${viewMinX + viewWidth * 0.49} 102 T${viewMinX + viewWidth} 82 V${viewHeight} H${viewMinX}Z`} fill="#272b47" />
      {stars.map(([x, y, radius], index) => (
        <circle className="garden-moon__star" cx={viewMinX + viewWidth * x} cy={viewHeight * y} key={index} r={radius} />
      ))}
      <g className="garden-moon__distant-planet" transform={`translate(${viewMinX + viewWidth * 0.78} 40)`}>
        <circle r="25" fill="#4a5484" />
        <path d="M-24 -5 Q-8 -17 5 -11 T24 -16 V8 Q5 20 -13 9Z" fill="#6674ad" />
        <ellipse cx="-7" cy="-4" rx="8" ry="3" fill="#8793c2" opacity=".38" />
        <path d="M-29 1 Q0 16 30 -1" fill="none" stroke="#ad9bd5" strokeOpacity=".46" strokeWidth="2" />
      </g>
      <g className="garden-moon__habitat" transform={`translate(${viewMinX + viewWidth * 0.18} 91)`}>
        <path d="M-18 2 A18 18 0 0 1 18 2Z" fill="#6e8d9f" fillOpacity=".45" stroke="#a4cfdf" strokeWidth="1.5" />
        <path d="M-17 2H17L22 7H-22Z" fill="#65788c" stroke="#a4cfdf" strokeWidth="1" />
        <path d="M0 -14V2M-9 -9 0 2 9 -9" fill="none" stroke="#bce9ee" strokeOpacity=".65" strokeWidth="1" />
        <rect x="-3" y="4" width="6" height="3" fill="#92d7d0" />
      </g>
      <path d={`M${viewMinX} ${viewHeight - 38} Q${viewMinX + 88} ${viewHeight - 68} ${viewMinX + 178} ${viewHeight - 38} T${viewMinX + viewWidth} ${viewHeight - 42} V${viewHeight} H${viewMinX}Z`} fill="#45435b" opacity=".7" />
    </g>
  );
}

function MoonTileDetail() {
  return (
    <g className="garden-moon__tile-detail" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M0 -20 40 0 0 20 -40 0Z" fill="#78778c" fillOpacity=".88" stroke="#bab1cf" strokeWidth="1.3" />
      <path d="M0 -16 31 0 0 16 -31 0Z" fill="#625f79" stroke="#9893ae" strokeWidth=".8" />
      <ellipse cx="-13" cy="-2" rx="8" ry="4" fill="#4e4c66" stroke="#817f98" strokeWidth="1" />
      <ellipse cx="9" cy="3" rx="5" ry="2.5" fill="#504e68" stroke="#87849d" strokeWidth=".8" />
      <path d="M-1 -9 4 -7 2 -4 -3 -5ZM20 -1 23 0 21 2 18 1Z" fill="#a5a0b7" />
      <rect x="-37" y="-1" width="3" height="2" fill="#d2c4dd" />
      <rect x="34" y="-1" width="3" height="2" fill="#d2c4dd" />
    </g>
  );
}

function CropSprite({ crop, stage }: { crop: GardenCropType; stage: number }) {
  if (crop === "mooncap" || crop === "moonleaf" || crop === "prismberry") {
    return <MoonCropSprite crop={crop} stage={stage} />;
  }
  const ripe = stage >= 4;
  return (
    <g className={`garden-board__crop garden-board__crop--${crop} garden-board__crop--stage-${stage}`} transform="translate(0 -30)" aria-hidden="true">
      <ellipse cx="0" cy="21" rx="9" ry="3" fill="rgb(17 28 20 / 30%)" />
      <g shapeRendering="crispEdges">
        {stage === 0 && <><rect x="-3" y="15" width="6" height="4" fill="#c6a878" /><rect x="-1" y="16" width="2" height="2" fill="#ead4a6" /></>}
        {stage >= 1 && <><rect x="-1" y="8" width="3" height="10" fill="#6ba66a" /><rect x="-7" y="8" width="6" height="3" fill="#86bd77" /><rect x="-9" y="5" width="5" height="3" fill="#86bd77" /><rect x="1" y="4" width="6" height="3" fill="#9cca7c" /></>}
        {stage >= 2 && <><rect x="4" y="7" width="5" height="3" fill="#76af6a" /><rect x="-5" y="2" width="4" height="4" fill="#7fb871" /><rect x="2" y="1" width="4" height="4" fill="#a2cf7d" /></>}
        {stage >= 3 && crop === "turnip" && (
          <>
            <rect x="-5" y="10" width="10" height="6" fill={ripe ? "#c95c88" : "#b96d89"} />
            <rect x="-3" y="15" width="6" height="4" fill={ripe ? "#e68eaa" : "#ce879c"} />
            <rect x="-1" y="19" width="2" height="2" fill="#e5b3b0" />
          </>
        )}
        {stage >= 3 && crop === "carrot" && (
          <>
            <rect x="-4" y="10" width="8" height="3" fill="#db853e" />
            <rect x="-3" y="13" width="6" height="3" fill="#ed9846" />
            <rect x="-2" y="16" width="4" height="3" fill="#dc8138" />
            <rect x="-1" y="19" width="2" height="2" fill="#bc682d" />
            <rect x="-2" y="12" width="2" height="2" fill="#ffd28a" />
          </>
        )}
        {stage >= 3 && crop === "berry" && (
          <>
            <rect x="-7" y="9" width="5" height="5" fill={ripe ? "#ba5275" : "#8a6488"} />
            <rect x="3" y="10" width="5" height="5" fill={ripe ? "#d3637c" : "#8e7189"} />
            <rect x="-2" y="13" width="5" height="5" fill={ripe ? "#d87583" : "#9c7b8d"} />
            {ripe && <rect x="4" y="11" width="2" height="2" fill="#f3b2a1" />}
            {ripe && <rect x="-1" y="14" width="2" height="2" fill="#f3b2a1" />}
          </>
        )}
        {stage >= 3 && crop === "pumpkin" && (
          <>
            <rect x="-7" y="10" width="14" height="8" fill={ripe ? "#e1893d" : "#b77a48"} />
            <rect x="-5" y="8" width="10" height="3" fill={ripe ? "#eea14d" : "#c48a53"} />
            <rect x="-3" y="11" width="2" height="7" fill="#bd6f34" />
            <rect x="2" y="11" width="2" height="7" fill="#bd6f34" />
            {ripe && <rect x="-1" y="6" width="2" height="3" fill="#719b56" />}
          </>
        )}
      </g>
    </g>
  );
}

function MoonCropSprite({ crop, stage }: { crop: GardenMoonCropId; stage: number }) {
  const ripe = stage >= 4;
  return (
    <g className={`garden-moon__crop garden-moon__crop--${crop} garden-moon__crop--stage-${stage}${ripe ? " is-ripe" : ""}`} transform="translate(0 -30)" aria-hidden="true">
      <ellipse cx="0" cy="22" rx="10" ry="3" fill="#0b1021" fillOpacity=".7" />
      <g shapeRendering="crispEdges">
        {stage === 0 && (
          <>
            <rect x="-3" y="14" width="6" height="5" fill="#a3d8d1" />
            <rect x="-1" y="15" width="2" height="3" fill="#e1fff0" />
            <rect x="-6" y="19" width="12" height="2" fill="#587280" />
          </>
        )}
        {stage >= 1 && (
          <>
            <rect x="-2" y="8" width="4" height="11" fill="#73b9b1" />
            <rect x="-7" y="7" width="6" height="4" fill="#75d0bf" />
            <rect x="2" y="5" width="6" height="4" fill="#a0e2c8" />
            <rect x="-8" y="6" width="3" height="2" fill="#b9f1d4" />
          </>
        )}
        {stage >= 2 && (
          <>
            <rect x="-4" y="3" width="4" height="6" fill="#95ddc7" />
            <rect x="2" y="0" width="4" height="7" fill="#83d1c5" />
            <rect x="-9" y="11" width="4" height="3" fill="#6ab7b0" />
            <rect x="6" y="9" width="4" height="3" fill="#7fc9b6" />
          </>
        )}
        {stage >= 3 && crop === "mooncap" && (
          <>
            <rect x="-9" y="8" width="18" height="5" fill={ripe ? "#62d8d0" : "#5797a4"} />
            <rect x="-7" y="5" width="14" height="4" fill={ripe ? "#a4f3df" : "#72bac0"} />
            <rect x="-4" y="3" width="8" height="3" fill="#c6ffeb" />
            <rect x="-3" y="13" width="6" height="6" fill="#b0d9b8" />
            {ripe && <><rect x="-6" y="7" width="2" height="2" fill="#f3ffe4" /><rect x="4" y="6" width="2" height="2" fill="#f3ffe4" /></>}
          </>
        )}
        {stage >= 3 && crop === "moonleaf" && (
          <>
            <rect x="-10" y="9" width="7" height="5" fill="#81d58d" />
            <rect x="-7" y="5" width="7" height="6" fill={ripe ? "#a4e78f" : "#72b98a"} />
            <rect x="2" y="7" width="8" height="6" fill={ripe ? "#c0ee91" : "#8bc987"} />
            <rect x="-3" y="11" width="6" height="7" fill="#a5cf8f" />
            {ripe && <><rect x="-6" y="7" width="2" height="2" fill="#efffc0" /><rect x="6" y="9" width="2" height="2" fill="#efffc0" /></>}
          </>
        )}
        {stage >= 3 && crop === "prismberry" && (
          <>
            <path d="M-8 15 -7 8 -3 5 0 8 -1 16Z" fill={ripe ? "#bd7cff" : "#8069aa"} />
            <path d="M1 15 3 6 7 3 10 8 8 16Z" fill={ripe ? "#73d9ed" : "#647ea7"} />
            <path d="M-2 17 0 10 4 8 6 13 4 18Z" fill={ripe ? "#f5a9ed" : "#a57daa"} />
            <path d="M-6 9 -3 5 0 8 -3 10ZM4 7 7 3 10 8 7 9Z" fill="#f4d5ff" fillOpacity=".82" />
          </>
        )}
      </g>
      {ripe && <circle className="garden-moon__crop-glow" cx="0" cy="11" r={crop === "prismberry" ? 14 : 11} />}
    </g>
  );
}
