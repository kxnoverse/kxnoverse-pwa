import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  CircleHelp,
  Hammer,
  Leaf,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  Trees,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CodeInput } from "../components/CodeInput";
import { CodeReference } from "../components/CodeReference";
import { CodeWorkspace } from "../components/CodeWorkspace";
import {
  createGardenRun,
  executeGardenProgram,
  gardenCoordinatesAtPoint,
  GARDEN_RESEARCH,
  GARDEN_MISSIONS,
  getGardenSuggestions,
  type GardenResearchId,
  initializeCodeGarden,
  researchGardenUpgrade,
  saveCodeGardenProgram,
  saveCodeGardenState,
  type GardenAction,
  type GardenMission,
  type GardenRunStats,
  type GardenRunState,
} from "../data/code-garden";
import type { CodeGardenState } from "../data/db";

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
  const [missionId, setMissionId] = useState(GARDEN_MISSIONS[0].id);
  const [source, setSource] = useState(() => initialProgram(GARDEN_MISSIONS[0].id));
  const [status, setStatus] = useState<RunStatus>("ready");
  const [action, setAction] = useState<GardenAction | null>(null);
  const [sensorFeedback, setSensorFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [hintedMissionId, setHintedMissionId] = useState("");
  const [upgradeError, setUpgradeError] = useState("");
  const [stats, setStats] = useState<GardenRunStats | null>(null);
  const [showBestStats, setShowBestStats] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ x: number; y: number } | null>(null);
  const runToken = useRef(0);
  const gameStateRef = useRef<CodeGardenState | null>(null);
  const currentMission = GARDEN_MISSIONS.find((item) => item.id === missionId) ?? GARDEN_MISSIONS[0];
  const frameTimer = useRef<number | null>(null);
  gameStateRef.current = gameState;

  useEffect(() => {
    let active = true;
    initializeCodeGarden().then((saved) => {
      if (!active) return;
      const mission = GARDEN_MISSIONS.find((item) => item.id === saved.activeMissionId) ?? GARDEN_MISSIONS[0];
      setGameState(saved);
      gameStateRef.current = saved;
      setMissionId(mission.id);
      setSource(saved.programs?.[mission.id] ?? initialProgram(mission.id));
      setRun(gardenRunFromSaved(saved, mission));
      setSelectedTile({ x: mission.robot.x, y: mission.robot.y });
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
      void saveCodeGardenProgram(missionId, source).then((saved) => {
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
  }, [missionId, source]);

  const missionIndex = GARDEN_MISSIONS.findIndex((mission) => mission.id === missionId);
  const unlockedThrough = Math.min(
    GARDEN_MISSIONS.length - 1,
    gameState?.completedMissionIds.reduce((highest, id) => Math.max(highest, GARDEN_MISSIONS.findIndex((mission) => mission.id === id)), -1) ?? -1,
  ) + 1;
  const currentRun = run ?? (gameState ? createGardenRun(currentMission, gameState.resources, gameState.upgrades) : null);

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
    const executionState = { ...gameState, programs: { ...gameState.programs, [currentMission.id]: source } };
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
      const execution = executeGardenProgram(source, currentMission, initialRun, currentMission.maxSteps, gameState.upgrades);
      setStats(execution.stats);
      setShowBestStats(false);
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
        const decision = execution.decisions.find((entry) => entry.actionIndex === frameIndex);
        if (decision) {
          setSensorFeedback(t("codeLab.game.sensorDecision", {
            sensor: t(`codeLab.game.sensors.${decision.sensor}`),
            argument: typeof decision.argument === "string" ? `"${decision.argument}"` : decision.argument,
            result: decision.matched ? t("codeLab.game.trueValue") : t("codeLab.game.falseValue"),
          }));
        }
        await persist(executionState, frame, false);
        frameIndex += 1;
        await new Promise<void>((resolve) => {
          frameTimer.current = window.setTimeout(resolve, 240);
        });
      }
      if (runToken.current !== currentToken) return;
      setStatus("ready");
      if (execution.message.startsWith("Mission complete:")) {
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
    setGameState((current) => current ? { ...current, activeMissionId: mission.id } : current);
    await persist({ ...gameState, activeMissionId: mission.id }, nextRun);
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
      <CodeWorkspace
        mode="garden"
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
        windows={[
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
                  <button aria-label={t("codeLab.hint")} className="garden-game__help" onClick={showHint} type="button"><CircleHelp size={15} /></button>
                </div>
                <CodeInput
                  disabled={status === "running" || status === "paused"}
                  label={t("codeLab.game.program")}
                  language="garden"
                  onChange={(value) => setSource(value)}
                  suggestions={getGardenSuggestions(source, currentMission, source.length, gameState.upgrades)}
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
    </section>
  );
}

function Resource({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <span className="garden-game__resource">{icon}<small>{label}</small><b>{value}</b></span>;
}

function GardenBoard({
  mission,
  run,
  action,
  selectedTile,
  onSelectTile,
  labels,
}: {
  mission: GardenMission;
  run: GardenRunState;
  action: GardenAction | null;
  selectedTile: { x: number; y: number } | null;
  onSelectTile: (tile: { x: number; y: number }) => void;
  labels: { selected: string; robot: string; kinds: Record<string, string> };
}) {
  const selected = selectedTile ?? run.robot;
  const selectedWorldTile = run.tiles.find((tile) => tile.x === selected.x && tile.y === selected.y);
  const isRobotHere = selected.x === run.robot.x && selected.y === run.robot.y;

  function selectAtPoint(clientX: number, clientY: number, svg: SVGSVGElement) {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const point = {
      x: 120 + (clientX - bounds.left) * 600 / bounds.width,
      y: (clientY - bounds.top) * 370 / bounds.height,
    };
    const tile = gardenCoordinatesAtPoint(point, mission.width, mission.height);
    if (tile) onSelectTile(tile);
  }

  return (
    <div className="garden-board">
      <div className="garden-board__stage">
        <svg
          aria-label={`${mission.width} × ${mission.height} isometric garden. Click or focus a tile to inspect it.`}
          className="garden-board__svg"
          onClick={(event) => selectAtPoint(event.clientX, event.clientY, event.currentTarget)}
          role="group"
          viewBox="120 0 600 370"
        >
          <title>{mission.width} × {mission.height} isometric garden</title>
          {run.tiles
            .slice()
            .sort((a, b) => a.x + a.y - (b.x + b.y) || a.y - b.y)
            .map((tile) => {
              const centerX = 380 + (tile.x - tile.y) * 48;
              const centerY = 42 + (tile.x + tile.y) * 25;
              const robotHere = tile.x === run.robot.x && tile.y === run.robot.y;
              const tileSelected = tile.x === selected.x && tile.y === selected.y;
              const TileIcon = tile.kind === "ripe" || tile.kind === "plant" ? Sprout :
                tile.kind === "stone" ? Mountain : tile.kind === "wood" ? Trees : null;
              const direction = { north: 0, east: 90, south: 180, west: 270 }[run.robot.direction];
              return (
                <g
                  aria-label={`Tile ${tile.x + 1}, ${tile.y + 1}: ${labels.kinds[tile.kind] ?? tile.kind}${tile.growth === undefined ? "" : `, growth ${tile.growth}`}${robotHere ? `, ${labels.robot}` : ""}`}
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
                  {tileSelected && <path className="garden-board__selection" d="M0 -22 44 0 0 22 -44 0Z" />}
                  {TileIcon && (
                    <TileIcon
                      className={`garden-board__object garden-board__object--${tile.kind}`}
                      height={tile.kind === "stone" ? 24 : 22}
                      width={tile.kind === "stone" ? 24 : 22}
                      x={-11}
                      y={-28}
                      strokeWidth={1.8}
                    />
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
        {selectedWorldTile?.growth !== undefined && <span>{selectedWorldTile.growth}/2</span>}
        {isRobotHere && <span className="garden-board__robot-presence"><Bot size={12} />{labels.robot}</span>}
      </div>
    </div>
  );
}
