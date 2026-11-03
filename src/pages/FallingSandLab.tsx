import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CirclePause, CirclePlay, Eraser, FolderOpen, Pipette, RotateCcw, Save, Sparkles, Thermometer, Trash2, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db, type ArcadeRecord } from "../data/db";
import {
  clearSandWorld,
  countSandParticles,
  createSandWorld,
  eraseSandBrush,
  heatSandBrush,
  loadSandPreset,
  paintSandBrush,
  restoreSandScene,
  SAND_GRID_HEIGHT,
  SAND_GRID_WIDTH,
  SAND_MATERIALS,
  sampleSandMaterial,
  serializeSandScene,
  setSandWind,
  stepSandWorld,
  type SandMaterial,
  type SandMaterialName,
  type SandPresetName,
  type SandWorld,
} from "../data/falling-sand";

const MATERIAL_NAMES = [
  "sand", "water", "stone", "wood", "fire", "smoke", "lava", "oil",
  "acid", "ice", "snow", "steam", "plant", "metal", "salt", "explosive",
] as const satisfies readonly SandMaterialName[];
const SELECTABLE_MATERIAL_NAMES = [
  "sand", "water", "stone", "wood", "fire", "smoke", "lava", "oil",
  "acid", "ice", "snow", "plant", "metal", "explosive",
] as const satisfies readonly SandMaterialName[];
const MATERIAL_COLORS: Record<SandMaterialName, readonly [number, number, number]> = {
  sand: [223, 180, 103],
  water: [74, 160, 219],
  stone: [137, 147, 155],
  wood: [137, 89, 58],
  fire: [255, 115, 49],
  smoke: [164, 174, 181],
  lava: [255, 76, 24],
  oil: [56, 49, 37],
  acid: [139, 221, 69],
  ice: [153, 216, 240],
  snow: [230, 241, 247],
  steam: [207, 220, 226],
  plant: [80, 175, 96],
  metal: [164, 183, 197],
  salt: [231, 227, 207],
  explosive: [218, 91, 62],
};
const SAND_SCENE_PREFIX = "falling-sand:scene:";
const MAX_SAVED_SCENES = 20;
const PRESETS = ["lava", "frozen", "forest", "explosive", "water"] as const satisfies readonly SandPresetName[];
type SandTool = "draw" | "erase" | "sample" | "temperature";
const EMPTY_SCENE_RECORDS: ArcadeRecord[] = [];

function paintWorld(context: CanvasRenderingContext2D, image: ImageData, world: SandWorld) {
  const pixels = image.data;
  for (let index = 0; index < world.cells.length; index += 1) {
    const material = world.cells[index];
    const pixel = index * 4;
    const effect = world.effect[index];
    if (material === SAND_MATERIALS.empty) {
      pixels[pixel] = effect > 0 ? 255 : 0;
      pixels[pixel + 1] = effect > 0 ? 176 : 0;
      pixels[pixel + 2] = effect > 0 ? 92 : 0;
      pixels[pixel + 3] = effect;
      continue;
    }
    const name = MATERIAL_NAMES[material - 1];
    const color = MATERIAL_COLORS[name];
    const variation = ((index * 17 + world.life[index] * 13) % 11) - 5;
    const heatTint = Math.max(0, Math.min(0.35, (world.temperature[index] - 25) / 180 + effect / 900));
    pixels[pixel] = Math.max(0, Math.min(255, color[0] + variation + (255 - color[0]) * heatTint));
    pixels[pixel + 1] = Math.max(0, Math.min(255, color[1] + variation - color[1] * heatTint * 0.6));
    pixels[pixel + 2] = Math.max(0, Math.min(255, color[2] + variation - color[2] * heatTint));
    pixels[pixel + 3] = name === "smoke" || name === "steam"
      ? Math.min(220, 76 + world.life[index] * 4)
      : 255;
    if (name === "wood" && world.life[index] > 0) {
      const char = 1 - world.life[index] / 70;
      pixels[pixel] = Math.round(pixels[pixel] * (1 - char * 0.78));
      pixels[pixel + 1] = Math.round(pixels[pixel + 1] * (1 - char * 0.86));
      pixels[pixel + 2] = Math.round(pixels[pixel + 2] * (1 - char * 0.9));
    }
    if (name === "fire" || name === "lava") {
      pixels[pixel] = 255;
      pixels[pixel + 1] = name === "fire" ? 85 + (world.life[index] % 9) * 12 : 44 + (index % 5) * 9;
      pixels[pixel + 2] = name === "fire" ? 24 : 10;
    }
    if (name === "explosive" && (index + world.life[index]) % 5 === 0) pixels[pixel + 1] = 153;
  }
  context.putImageData(image, 0, 0);
}

function savedSceneName(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && "name" in parsed && typeof parsed.name === "string") return parsed.name;
  } catch {
    return "";
  }
  return "";
}

export function FallingSandLab() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<SandWorld>(createSandWorld());
  const drawingRef = useRef(false);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const materialRef = useRef<SandMaterial>(SAND_MATERIALS.sand);
  const brushSizeRef = useRef(4);
  const temperatureRef = useRef(85);
  const toolRef = useRef<SandTool>("draw");
  const imageRef = useRef<ImageData | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const sceneRecords = useLiveQuery(
    () => db.arcadeData.where("id").startsWith(SAND_SCENE_PREFIX).toArray(),
    [],
  );
  const [material, setMaterial] = useState<SandMaterial>(SAND_MATERIALS.sand);
  const [brushSize, setBrushSize] = useState(4);
  const [temperature, setTemperature] = useState(85);
  const [wind, setWind] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<SandTool>("draw");
  const [preset, setPreset] = useState<SandPresetName>("lava");
  const [sceneName, setSceneName] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [paused, setPaused] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const [canvasUnavailable, setCanvasUnavailable] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  materialRef.current = material;
  brushSizeRef.current = brushSize;
  temperatureRef.current = temperature;
  toolRef.current = tool;

  function render() {
    if (contextRef.current && imageRef.current) paintWorld(contextRef.current, imageRef.current, worldRef.current);
  }

  function refreshWorld() {
    render();
    setParticleCount(countSandParticles(worldRef.current));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = SAND_GRID_WIDTH;
    canvas.height = SAND_GRID_HEIGHT;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      setCanvasUnavailable(true);
      return;
    }
    contextRef.current = context;
    imageRef.current = context.createImageData(SAND_GRID_WIDTH, SAND_GRID_HEIGHT);
    render();
    return () => {
      contextRef.current = null;
      imageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (paused || canvasUnavailable) return;
    let frame = 0;
    let previousTime = 0;
    let accumulated = 0;
    let lastCountUpdate = 0;
    const frameDuration = 50 / speed;

    const drawFrame = (timestamp: number) => {
      if (document.hidden) return;
      if (previousTime === 0) previousTime = timestamp;
      accumulated += Math.min(timestamp - previousTime, 100);
      previousTime = timestamp;
      let steps = 0;
      while (accumulated >= frameDuration && steps < 3) {
        stepSandWorld(worldRef.current);
        accumulated -= frameDuration;
        steps += 1;
      }
      render();
      if (timestamp - lastCountUpdate >= 300) {
        setParticleCount(countSandParticles(worldRef.current));
        lastCountUpdate = timestamp;
      }
      frame = window.requestAnimationFrame(drawFrame);
    };

    const handleVisibility = () => {
      window.cancelAnimationFrame(frame);
      previousTime = 0;
      if (!document.hidden) frame = window.requestAnimationFrame(drawFrame);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!document.hidden) frame = window.requestAnimationFrame(drawFrame);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canvasUnavailable, paused, speed]);

  function cellAt(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(SAND_GRID_WIDTH - 1, Math.floor((event.clientX - bounds.left) / bounds.width * SAND_GRID_WIDTH))),
      y: Math.max(0, Math.min(SAND_GRID_HEIGHT - 1, Math.floor((event.clientY - bounds.top) / bounds.height * SAND_GRID_HEIGHT))),
    };
  }

  function paintPoint(point: { x: number; y: number }) {
    if (toolRef.current === "erase") {
      eraseSandBrush(worldRef.current, point.x, point.y, brushSizeRef.current);
    } else if (toolRef.current === "temperature") {
      heatSandBrush(worldRef.current, point.x, point.y, brushSizeRef.current, temperatureRef.current);
    } else {
      paintSandBrush(worldRef.current, point.x, point.y, brushSizeRef.current, materialRef.current);
    }
  }

  function paintBetween(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    if (!from) {
      paintPoint(to);
      return;
    }
    const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let step = 0; step <= distance; step += 1) {
      const progress = distance === 0 ? 0 : step / distance;
      paintPoint({
        x: Math.round(from.x + (to.x - from.x) * progress),
        y: Math.round(from.y + (to.y - from.y) * progress),
      });
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const point = cellAt(event);
    if (!point) return;
    if (toolRef.current === "sample") {
      const sampled = sampleSandMaterial(worldRef.current, point.x, point.y);
      if (sampled !== null) {
        setMaterial(sampled);
        setTool("draw");
        setFeedback(t("arcade.sandLab.sampled", { material: t(`arcade.sandLab.material.${MATERIAL_NAMES[sampled - 1]}`) }));
      } else {
        setFeedback(t("arcade.sandLab.sampleEmpty"));
      }
      return;
    }
    drawingRef.current = true;
    lastCellRef.current = point;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    paintBetween(null, point);
    refreshWorld();
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = cellAt(event);
    if (!point) return;
    paintBetween(lastCellRef.current, point);
    lastCellRef.current = point;
    render();
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastCellRef.current = null;
    setParticleCount(countSandParticles(worldRef.current));
  }

  function applyPreset() {
    loadSandPreset(worldRef.current, preset);
    setWind(worldRef.current.wind);
    setError("");
    setFeedback(t(`arcade.sandLab.preset.${preset}`));
    refreshWorld();
  }

  function reset() {
    clearSandWorld(worldRef.current);
    setWind(0);
    setError("");
    setFeedback("");
    refreshWorld();
  }

  function changeWind(value: number) {
    setSandWind(worldRef.current, value);
    setWind(value);
  }

  async function saveScene() {
    const name = sceneName.trim();
    if (!name || name.length > 40) {
      setError(t("arcade.sandLab.sceneNameError"));
      return;
    }
    try {
      const value = serializeSandScene(worldRef.current, name);
      const id = `${SAND_SCENE_PREFIX}${encodeURIComponent(name.toLocaleLowerCase())}`;
      const currentScenes = sceneRecords ?? [];
      if (!currentScenes.some((record) => record.id === id) && currentScenes.length >= MAX_SAVED_SCENES) {
        setError(t("arcade.sandLab.sceneLimit", { count: MAX_SAVED_SCENES }));
        return;
      }
      await db.arcadeData.put({ id, value, updatedAt: Date.now() });
      setSelectedSceneId(id);
      setError("");
      setFeedback(t("arcade.sandLab.sceneSaved", { name }));
    } catch {
      setError(t("arcade.sandLab.sceneSaveError"));
    }
  }

  function openScene() {
    const record = sceneRecords?.find((scene) => scene.id === selectedSceneId);
    if (!record) {
      setError(t("arcade.sandLab.sceneMissing"));
      return;
    }
    try {
      const name = restoreSandScene(worldRef.current, record.value);
      setSceneName(name);
      setWind(worldRef.current.wind);
      setError("");
      setFeedback(t("arcade.sandLab.sceneOpened", { name }));
      refreshWorld();
    } catch {
      setError(t("arcade.sandLab.sceneOpenError"));
    }
  }

  async function deleteScene() {
    if (!selectedSceneId) return;
    try {
      await db.arcadeData.delete(selectedSceneId);
      setSelectedSceneId("");
      setError("");
      setFeedback(t("arcade.sandLab.sceneDeleted"));
    } catch {
      setError(t("arcade.sandLab.sceneDeleteError"));
    }
  }

  const sceneOptions = useMemo(
    () => (sceneRecords ?? EMPTY_SCENE_RECORDS).map((scene) => ({
      id: scene.id,
      name: savedSceneName(scene.value) || scene.id,
    })),
    [sceneRecords],
  );

  return (
    <section className="falling-sand-lab arcade-play-card" aria-label={t("arcade.games.falling-sand.name")}>
      <header className="falling-sand-lab__header">
        <div>
          <span>{t("arcade.sandLab.kicker")}</span>
          <p>{t("arcade.sandLab.instructions")}</p>
        </div>
        <output className="falling-sand-lab__count" aria-live="polite">
          {t("arcade.sandLab.particles", { count: particleCount })}
        </output>
      </header>
      <div className="falling-sand-lab__materials" role="group" aria-label={t("arcade.sandLab.materials")}>
        {SELECTABLE_MATERIAL_NAMES.map((name) => {
          const selected = material === SAND_MATERIALS[name];
          return (
            <button
              aria-pressed={selected && tool === "draw"}
              className={`falling-sand-lab__material${selected && tool === "draw" ? " is-active" : ""}`}
              key={name}
              onClick={() => { setMaterial(SAND_MATERIALS[name]); setTool("draw"); setFeedback(""); }}
              type="button"
            >
              <span className={`falling-sand-lab__swatch falling-sand-lab__swatch--${name}`} aria-hidden="true" />
              {t(`arcade.sandLab.material.${name}`)}
            </button>
          );
        })}
      </div>
      <div className="falling-sand-lab__tool-row">
        <div className="falling-sand-lab__tools" role="group" aria-label={t("arcade.sandLab.tools")}>
          <button aria-pressed={tool === "draw"} className={tool === "draw" ? "is-active" : ""} onClick={() => setTool("draw")} type="button">{t("arcade.sandLab.tool.draw")}</button>
          <button aria-pressed={tool === "erase"} className={tool === "erase" ? "is-active" : ""} onClick={() => setTool("erase")} type="button"><Eraser size={13} />{t("arcade.sandLab.tool.erase")}</button>
          <button aria-pressed={tool === "sample"} className={tool === "sample" ? "is-active" : ""} onClick={() => setTool("sample")} type="button"><Pipette size={13} />{t("arcade.sandLab.tool.sample")}</button>
          <button aria-pressed={tool === "temperature"} className={tool === "temperature" ? "is-active" : ""} onClick={() => setTool("temperature")} type="button"><Thermometer size={13} />{t("arcade.sandLab.tool.temperature")}</button>
        </div>
        {tool === "temperature" && (
          <label className="falling-sand-lab__temperature">
            <span>{t("arcade.sandLab.temperature")}</span>
            <input aria-label={t("arcade.sandLab.temperature")} max={100} min={0} onChange={(event) => setTemperature(Number(event.target.value))} type="range" value={temperature} />
            <output>{temperature}°</output>
          </label>
        )}
      </div>
      {canvasUnavailable ? (
        <p className="form-error" role="alert">{t("arcade.sandLab.canvasError")}</p>
      ) : (
        <canvas
          aria-label={t("arcade.sandLab.canvas")}
          className="falling-sand-lab__canvas"
          onContextMenu={(event) => event.preventDefault()}
          onPointerCancel={stopDrawing}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          ref={canvasRef}
          role="img"
        />
      )}
      <p className="falling-sand-lab__hint">{t("arcade.sandLab.materialHints")}</p>
      <div className="falling-sand-lab__controls">
        <label className="falling-sand-lab__brush">
          <span>{t("arcade.sandLab.brushSize")}</span>
          <input aria-label={t("arcade.sandLab.brushSize")} max={16} min={1} onChange={(event) => setBrushSize(Number(event.target.value))} type="range" value={brushSize} />
          <output>{brushSize}</output>
        </label>
        <label className="falling-sand-lab__wind">
          <span><Wind size={13} />{t("arcade.sandLab.wind")}</span>
          <input aria-label={t("arcade.sandLab.wind")} max={3} min={-3} onChange={(event) => changeWind(Number(event.target.value))} step={1} type="range" value={wind} />
          <output>{wind === 0 ? t("arcade.sandLab.calm") : `${wind > 0 ? "→" : "←"} ${Math.abs(wind)}`}</output>
        </label>
        <label className="falling-sand-lab__speed">
          <span>{t("arcade.sandLab.speed")}</span>
          <select aria-label={t("arcade.sandLab.speed")} onChange={(event) => setSpeed(Number(event.target.value))} value={speed}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <div className="falling-sand-lab__actions">
          <button className="button button--quiet" onClick={() => setPaused((value) => !value)} type="button">
            {paused ? <CirclePlay size={14} /> : <CirclePause size={14} />}
            {t(paused ? "arcade.sandLab.resume" : "arcade.sandLab.pause")}
          </button>
          <button className="button button--quiet" onClick={reset} type="button"><RotateCcw size={14} />{t("arcade.sandLab.reset")}</button>
        </div>
      </div>
      <div className="falling-sand-lab__presets">
        <label>
          <span><Sparkles size={13} />{t("arcade.sandLab.presets")}</span>
          <select aria-label={t("arcade.sandLab.presets")} onChange={(event) => setPreset(event.target.value as SandPresetName)} value={preset}>
            {PRESETS.map((name) => <option key={name} value={name}>{t(`arcade.sandLab.preset.${name}`)}</option>)}
          </select>
        </label>
        <button className="button button--quiet" onClick={applyPreset} type="button">{t("arcade.sandLab.loadPreset")}</button>
      </div>
      <div className="falling-sand-lab__scenes">
        <form onSubmit={(event) => { event.preventDefault(); void saveScene(); }}>
          <label>
            <span>{t("arcade.sandLab.sceneName")}</span>
            <input aria-label={t("arcade.sandLab.sceneName")} maxLength={40} onChange={(event) => setSceneName(event.target.value)} placeholder={t("arcade.sandLab.scenePlaceholder")} value={sceneName} />
          </label>
          <button className="button button--quiet" disabled={!sceneRecords} type="submit"><Save size={13} />{t("arcade.sandLab.saveScene")}</button>
        </form>
        <div className="falling-sand-lab__scene-open">
          <label>
            <span>{t("arcade.sandLab.savedScenes")}</span>
            <select aria-label={t("arcade.sandLab.savedScenes")} onChange={(event) => setSelectedSceneId(event.target.value)} value={selectedSceneId}>
              <option value="">{t("arcade.sandLab.noScenes")}</option>
              {sceneOptions.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
            </select>
          </label>
          <button aria-label={t("arcade.sandLab.openScene")} className="button button--quiet" disabled={!selectedSceneId} onClick={openScene} type="button"><FolderOpen size={13} />{t("arcade.sandLab.openScene")}</button>
          <button aria-label={t("arcade.sandLab.deleteScene")} className="button button--quiet" disabled={!selectedSceneId} onClick={() => void deleteScene()} type="button"><Trash2 size={13} />{t("arcade.sandLab.deleteScene")}</button>
        </div>
      </div>
      {feedback && <p className="falling-sand-lab__feedback" role="status">{feedback}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
