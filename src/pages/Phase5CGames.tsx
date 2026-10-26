import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Shield, ShoppingBag, Sparkles, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { getArcadeSoundVolume, playArcadeSound } from "../data/arcade-audio";
import {
  createDefenseState, createPlatformerState, createRhythmChart,
  defenseMaps, judgeRhythmNote, loadPlatformerLevel, placeDefenseTower, platformLevels, pointOnDefensePath,
  rhythmScore, sellDefenseTower, setDefenseTarget, startDefenseWave, stepDefense, stepPlatformer,
  upgradeDefenseTower,
  type DefenseState, type PlatformerInput, type PlatformerState, type RhythmDifficulty,
  type RhythmTrack, type TowerKind, type TowerTarget,
} from "../data/phase5c-games";
import type { GameDefinition } from "../data/arcade";

type Palette = { accent: string; soft: string; strong: string };
type Props = {
  game: GameDefinition;
  best?: number;
  palette: Palette;
  onBest: (value: number) => void;
  onModeBest: (mode: string, value: number) => void;
};

const defenseSaveKey = "save:game:tower-defense";
const defenseMapKey = "preference:tower-defense:map";
const platformSaveKey = "save:game:mini-platformer";
const rhythmOffsetKey = "preference:rhythm-tiles:offset";
const rhythmStatsKey = (track: RhythmTrack, difficulty: RhythmDifficulty) => `stats:rhythm-tiles:${track}:${difficulty}`;
const towerKinds: TowerKind[] = ["basic", "rapid", "heavy", "frost"];
const towerCosts: Record<TowerKind, number> = { basic: 70, rapid: 95, heavy: 125, frost: 110 };
const towerLabels: Record<TowerKind, string> = {
  basic: "arcade.phase5c.basic",
  rapid: "arcade.phase5c.rapid",
  heavy: "arcade.phase5c.heavy",
  frost: "arcade.phase5c.frost",
};

function isDefenseSave(value: unknown): value is DefenseState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DefenseState>;
  const finite = (number: unknown) => typeof number === "number" && Number.isFinite(number);
  return ["meadow", "harbor", "ridge"].includes(state.map ?? "") &&
    Number.isInteger(state.wave) && (state.wave ?? -1) >= 0 && (state.wave ?? 11) <= 10 &&
    typeof state.waveActive === "boolean" && Number.isInteger(state.spawnRemaining) && finite(state.spawnTimer) &&
    finite(state.currency) && (state.currency ?? -1) >= 0 && Number.isInteger(state.lives) &&
    (state.lives ?? -1) >= 0 && (state.lives ?? 21) <= 20 && Number.isInteger(state.score) &&
    Array.isArray(state.enemies) && state.enemies.every((enemy) => enemy && Number.isInteger(enemy.id) &&
      ["standard", "fast", "armored", "boss"].includes(enemy.kind) && finite(enemy.distance) &&
      finite(enemy.health) && finite(enemy.maxHealth) && finite(enemy.slow)) &&
    Array.isArray(state.towers) && state.towers.every((tower) => tower && Number.isInteger(tower.id) &&
      ["basic", "rapid", "heavy", "frost"].includes(tower.kind) && finite(tower.x) && finite(tower.y) &&
      Number.isInteger(tower.level) && tower.level >= 1 && tower.level <= 3 &&
      ["first", "last", "strongest"].includes(tower.target) && finite(tower.cooldown) && finite(tower.spent)) &&
    Array.isArray(state.projectiles) && state.projectiles.every((projectile) => projectile &&
      Number.isInteger(projectile.id) && Number.isInteger(projectile.targetId) &&
      ["basic", "rapid", "heavy", "frost"].includes(projectile.kind) &&
      finite(projectile.x) && finite(projectile.y) && finite(projectile.damage) && finite(projectile.speed)) &&
    typeof state.nextId === "number" && Number.isInteger(state.nextId) && state.nextId > 0 &&
    (state.selectedTower === null || Number.isInteger(state.selectedTower)) &&
    ["ready", "playing", "won", "lost"].includes(state.status ?? "");
}

function isPlatformSave(value: unknown): value is PlatformerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PlatformerState>;
  const finite = (number: unknown) => typeof number === "number" && Number.isFinite(number);
  return Number.isInteger(state.level) && (state.level ?? -1) >= 0 && (state.level ?? 99) < platformLevels.length &&
    finite(state.x) && finite(state.y) && finite(state.vx) && finite(state.vy) &&
    typeof state.grounded === "boolean" && finite(state.coyote) && finite(state.jumpBuffer) &&
    typeof state.jumpWasDown === "boolean" && finite(state.remainder) && finite(state.time) &&
    Number.isInteger(state.lives) && (state.lives ?? -1) >= 0 && (state.lives ?? 4) <= 3 &&
    Array.isArray(state.collected) && state.collected.every((item) => typeof item === "string") &&
    Boolean(state.checkpoint && finite(state.checkpoint.x) && finite(state.checkpoint.y)) &&
    typeof state.complete === "boolean" && typeof state.gameOver === "boolean" &&
    Number.isInteger(state.unlocked) && (state.unlocked ?? 0) >= 1 && (state.unlocked ?? 9) <= platformLevels.length &&
    Array.isArray(state.completedLevels) && state.completedLevels.every((level) => Number.isInteger(level) && level >= 0 && level < platformLevels.length) &&
    Array.isArray(state.bestTimes) && state.bestTimes.length === platformLevels.length && state.bestTimes.every((time) => finite(time) && time >= 0);
}

function isRhythmStats(value: unknown): value is { score: number; accuracy: number; combo: number } {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<{ score: number; accuracy: number; combo: number }>;
  return Number.isFinite(stats.score) && Number.isFinite(stats.accuracy) && Number.isFinite(stats.combo);
}

function readCanvasColors(canvas: HTMLCanvasElement, fallback: string) {
  const style = getComputedStyle(canvas);
  return {
    surface: style.getPropertyValue("--surface-0").trim() || "#151719",
    surface2: style.getPropertyValue("--surface-1").trim() || "#202327",
    line: style.getPropertyValue("--line").trim() || "#383d43",
    text: style.getPropertyValue("--text").trim() || "#eceff2",
    muted: style.getPropertyValue("--text-muted").trim() || "#969da5",
    accent: style.getPropertyValue("--game-accent").trim() || fallback,
    strong: style.getPropertyValue("--game-accent-strong").trim() || "#c4b5fd",
  };
}

function TowerDefense({ best, onBest, palette }: Pick<Props, "best" | "onBest" | "palette">) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(createDefenseState());
  const saveEnabled = useRef(false);
  const [game, setGame] = useState(gameRef.current);
  const [selectedKind, setSelectedKind] = useState<TowerKind>("basic");
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const gameRefSync = useRef(game);
  gameRefSync.current = game;

  const save = useCallback((state: DefenseState) => {
    if (!saveEnabled.current) return;
    void db.arcadeData.put({ id: defenseSaveKey, value: JSON.stringify(state), updatedAt: Date.now() })
      .then(() => setSaveError(""))
      .catch(() => setSaveError(t("arcade.phase5c.saveError")));
  }, [t]);

  useEffect(() => {
    let active = true;
    Promise.all([db.arcadeData.get(defenseSaveKey), db.arcadeData.get(defenseMapKey)])
      .then(([record, mapRecord]) => {
        if (!active) return;
        const map = mapRecord?.value === "harbor" || mapRecord?.value === "ridge" ? mapRecord.value : "meadow";
        let initial = createDefenseState(map);
        if (record) {
          try {
            const saved: unknown = JSON.parse(record.value);
            if (!isDefenseSave(saved)) throw new Error("Invalid tower-defense save.");
            initial = saved;
            saveEnabled.current = true;
          } catch {
            setSaveError(t("arcade.phase5c.invalidSave"));
          }
        } else saveEnabled.current = true;
        gameRef.current = initial;
        setGame(initial);
        setLoaded(true);
      })
      .catch(() => { if (active) { setSaveError(t("arcade.phase5c.saveError")); setLoaded(true); } });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => save(gameRef.current), 1600);
    return () => window.clearInterval(id);
  }, [loaded, save]);

  useEffect(() => {
    if (game.wave > (best ?? 0)) onBest(game.wave);
  }, [best, game.wave, onBest]);

  const commit = useCallback((next: DefenseState) => {
    gameRef.current = next;
    setGame(next);
    save(next);
  }, [save]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(640 * dpr);
      const height = Math.round(420 * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    let raf = 0;
    let lastTime = 0;
    let accumulator = 0;
    let uiElapsed = 0;
    const step = 1 / 60;
    const draw = () => {
      const colors = readCanvasColors(canvas, palette.accent);
      const world = gameRef.current;
      const width = 640;
      const height = 420;
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = colors.surface;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = colors.line;
      context.lineWidth = 1;
      for (let x = 20; x < width; x += 32) for (let y = 18; y < height; y += 32) {
        context.beginPath(); context.arc(x, y, 1, 0, Math.PI * 2); context.stroke();
      }
      const path = defenseMaps[world.map].path;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = colors.line;
      context.lineWidth = 46;
      context.beginPath();
      path.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
      context.strokeStyle = colors.muted;
      context.globalAlpha = 0.18;
      context.lineWidth = 1;
      context.setLineDash([7, 8]);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      const start = path[0];
      const finish = path[path.length - 1];
      for (const [point, label] of [[start, "IN"], [finish, "OUT"]] as const) {
        context.fillStyle = colors.surface2;
        context.beginPath(); context.arc(point.x, point.y, 13, 0, Math.PI * 2); context.fill();
        context.fillStyle = colors.muted;
        context.font = "700 8px system-ui";
        context.textAlign = "center";
        context.fillText(label, point.x, point.y + 3);
      }
      const selected = world.towers.find((tower) => tower.id === world.selectedTower);
      if (selected) {
        const radius = ({ basic: 116, rapid: 86, heavy: 140, frost: 104 })[selected.kind] * (1 + (selected.level - 1) * 0.14);
        context.strokeStyle = colors.accent;
        context.globalAlpha = 0.2;
        context.fillStyle = colors.accent;
        context.beginPath(); context.arc(selected.x, selected.y, radius, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 0.56;
        context.lineWidth = 1;
        context.beginPath(); context.arc(selected.x, selected.y, radius, 0, Math.PI * 2); context.stroke();
        context.globalAlpha = 1;
      }
      const towerColors: Record<TowerKind, string> = { basic: colors.accent, rapid: "#80bfa0", heavy: "#d3a471", frost: "#83b8c7" };
      for (const tower of world.towers) {
        const color = towerColors[tower.kind];
        context.fillStyle = colors.surface2;
        context.strokeStyle = tower.id === world.selectedTower ? colors.strong : color;
        context.lineWidth = tower.id === world.selectedTower ? 2 : 1.4;
        context.beginPath(); context.arc(tower.x, tower.y, 15, 0, Math.PI * 2); context.fill(); context.stroke();
        context.fillStyle = color;
        if (tower.kind === "rapid") {
          for (let i = 0; i < 3; i += 1) { context.beginPath(); context.arc(tower.x - 5 + i * 5, tower.y, 2.3, 0, Math.PI * 2); context.fill(); }
        } else if (tower.kind === "heavy") {
          context.fillRect(tower.x - 7, tower.y - 4, 14, 8);
        } else if (tower.kind === "frost") {
          context.beginPath(); context.moveTo(tower.x, tower.y - 8); context.lineTo(tower.x + 7, tower.y); context.lineTo(tower.x, tower.y + 8); context.lineTo(tower.x - 7, tower.y); context.closePath(); context.fill();
        } else {
          context.beginPath(); context.arc(tower.x, tower.y, 5, 0, Math.PI * 2); context.fill();
        }
        context.fillStyle = colors.text;
        context.font = "700 8px system-ui";
        context.textAlign = "center";
        context.fillText(String(tower.level), tower.x + 11, tower.y - 10);
      }
      for (const projectile of world.projectiles) {
        context.fillStyle = towerColors[projectile.kind];
        context.globalAlpha = 0.9;
        context.beginPath(); context.arc(projectile.x, projectile.y, projectile.kind === "heavy" ? 4 : 2.5, 0, Math.PI * 2); context.fill();
      }
      context.globalAlpha = 1;
      for (const enemy of world.enemies) {
        const point = pointOnDefensePath(path, enemy.distance);
        const radius = enemy.kind === "boss" ? 13 : enemy.kind === "armored" ? 10 : 8;
        context.fillStyle = enemy.kind === "fast" ? "#d99a73" : enemy.kind === "armored" ? "#a397c2" : enemy.kind === "boss" ? "#c6756b" : "#d7b878";
        context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill();
        context.strokeStyle = colors.surface;
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = colors.surface2;
        context.fillRect(point.x - 14, point.y - radius - 8, 28, 3);
        context.fillStyle = enemy.health / enemy.maxHealth < 0.35 ? "#d87868" : "#85b994";
        context.fillRect(point.x - 14, point.y - radius - 8, 28 * Math.max(0, enemy.health / enemy.maxHealth), 3);
      }
    };
    const animate = (now: number) => {
      if (document.hidden) { lastTime = 0; accumulator = 0; raf = requestAnimationFrame(animate); return; }
      if (lastTime) accumulator = Math.min(0.1, accumulator + (now - lastTime) / 1000);
      lastTime = now;
      if (loaded && !pausedRef.current) {
        while (accumulator >= step) {
          gameRef.current = stepDefense(gameRef.current, step);
          accumulator -= step;
          uiElapsed += step;
          if (uiElapsed >= 0.12) {
            uiElapsed = 0;
            setGame({ ...gameRef.current });
          }
        }
      } else accumulator = 0;
      draw();
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [loaded, palette.accent]);

  function onMapPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * 640 / bounds.width, y: (event.clientY - bounds.top) * 420 / bounds.height };
    const nearby = [...gameRef.current.towers].reverse().find((tower) => Math.hypot(tower.x - point.x, tower.y - point.y) < 20);
    if (nearby) {
      commit({ ...gameRef.current, selectedTower: nearby.id });
      return;
    }
    const next = placeDefenseTower(gameRef.current, selectedKind, point);
    if (next !== gameRef.current) {
      commit(next);
      playArcadeSound("tower-defense", "start");
    }
  }

  const selectedTower = game.towers.find((tower) => tower.id === game.selectedTower);
  const changeMap = (map: DefenseState["map"]) => {
    if (game.waveActive) return;
    const next = createDefenseState(map);
    saveEnabled.current = true;
    commit(next);
    void db.arcadeData.put({ id: defenseMapKey, value: map, updatedAt: Date.now() })
      .catch(() => setSaveError(t("arcade.phase5c.saveError")));
  };
  const restart = () => {
    saveEnabled.current = true;
    commit(createDefenseState(game.map));
    setPaused(false);
  };

  return (
    <section className="phase5c-game phase5c-defense" aria-label={t("arcade.games.tower-defense.board")}>
      <div className="phase5c-toolbar">
        <label>{t("arcade.phase5c.map")}<select aria-label={t("arcade.phase5c.map")} value={game.map} onChange={(event) => changeMap(event.target.value as DefenseState["map"])}>
          {(Object.keys(defenseMaps) as DefenseState["map"][]).map((map) => <option key={map} value={map}>{t(`arcade.phase5c.maps.${map}`)}</option>)}
        </select></label>
        <span><b>{t("arcade.phase5c.wave")}</b>{game.wave}/10</span>
        <span><b>{t("arcade.phase5c.lives")}</b>{game.lives}</span>
        <span><b>{t("arcade.phase5c.coins")}</b>{game.currency}</span>
        <span><b>{t("arcade.score")}</b>{game.score}</span>
        <button className="button button--quiet" disabled={!loaded || game.status === "lost" || game.status === "won"} onClick={() => setPaused((value) => !value)} type="button">{paused ? <Play size={13} /> : <Pause size={13} />}{t(paused ? "arcade.resume" : "arcade.pause")}</button>
        <button className="button button--quiet" onClick={restart} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
      </div>
      <div className="phase5c-defense__layout">
        <div className="phase5c-defense__map-wrap">
          <canvas ref={canvasRef} className="phase5c-canvas phase5c-defense__canvas" aria-label={t("arcade.games.tower-defense.board")} onPointerDown={onMapPointer} />
          {paused && <div className="phase5c-overlay"><span>{t("arcade.phase5c.paused")}</span></div>}
          {(game.status === "won" || game.status === "lost") && <div className="phase5c-overlay"><span>{t(game.status === "won" ? "arcade.phase5c.defenseWon" : "arcade.phase5c.defenseLost")}</span><button className="button button--primary" onClick={restart} type="button">{t("arcade.restart")}</button></div>}
        </div>
        <aside className="phase5c-defense__panel">
          <div className="phase5c-defense__panel-head"><span>{t("arcade.phase5c.build")}</span><small>{t("arcade.phase5c.selectTower")}</small></div>
          <div className="phase5c-defense__tower-list">
            {towerKinds.map((kind) => <button key={kind} aria-pressed={selectedKind === kind} className={`phase5c-defense__tower is-${kind}${selectedKind === kind ? " is-selected" : ""}`} disabled={game.currency < towerCosts[kind] || game.status === "won" || game.status === "lost"} onClick={() => setSelectedKind(kind)} type="button">
              <i aria-hidden="true" /><span>{t(towerLabels[kind])}<small>{t("arcade.phase5c.cost")}: {towerCosts[kind]}</small></span>
            </button>)}
          </div>
          {selectedTower ? <div className="phase5c-defense__selected">
            <strong>{t(towerLabels[selectedTower.kind])} · {t("arcade.phase5c.level")} {selectedTower.level}</strong>
            <label>{t("arcade.phase5c.target")}<select aria-label={t("arcade.phase5c.target")} value={selectedTower.target} onChange={(event) => commit(setDefenseTarget(gameRef.current, event.target.value as TowerTarget))}>
              {(["first", "last", "strongest"] as const).map((target) => <option key={target} value={target}>{t(`arcade.phase5c.targets.${target}`)}</option>)}
            </select></label>
            <div className="phase5c-defense__actions">
              <button className="button button--quiet" disabled={selectedTower.level >= 3 || game.currency < 45 + (selectedTower.level - 1) * 40} onClick={() => commit(upgradeDefenseTower(gameRef.current))} type="button"><Sparkles size={13} />{t("arcade.phase5c.upgrade")}</button>
              <button className="button button--quiet" onClick={() => commit(sellDefenseTower(gameRef.current))} type="button"><ShoppingBag size={13} />{t("arcade.phase5c.sell")}</button>
            </div>
          </div> : <p className="phase5c-defense__tip">{t("arcade.phase5c.placeHint")}</p>}
          <div className="phase5c-defense__wave">
            <div><span>{t("arcade.phase5c.nextWave")}</span><strong>{game.wave >= 10 ? t("arcade.phase5c.finalWave") : `${game.wave + 1} · ${5 + (game.wave + 1) * 2} ${t("arcade.phase5c.enemies")}`}</strong></div>
            <button className="button button--primary" disabled={game.waveActive || game.wave >= 10 || game.status === "lost" || game.status === "won"} onClick={() => { commit(startDefenseWave(gameRef.current)); playArcadeSound("tower-defense", "start"); }} type="button"><Shield size={14} />{t("arcade.phase5c.startWave")}</button>
          </div>
        </aside>
      </div>
      {game.wave > 0 && !game.waveActive && game.status === "playing" && <p className="arcade-game-status" role="status">{t("arcade.phase5c.waveClear", { wave: game.wave })}</p>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      <p className="arcade-game-hint">{t("arcade.games.tower-defense.hint")}</p>
    </section>
  );
}

function RhythmTiles({ best, onBest }: Pick<Props, "best" | "onBest">) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const chartRef = useRef<ReturnType<typeof createRhythmChart> | null>(null);
  const judgedRef = useRef(new Set<number>());
  const startAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const scheduleIndex = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const [track, setTrack] = useState<RhythmTrack>("signal");
  const [difficulty, setDifficulty] = useState<RhythmDifficulty>("normal");
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "over">("ready");
  const [offset, setOffset] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const [good, setGood] = useState(0);
  const [misses, setMisses] = useState(0);
  const [clock, setClock] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [saveError, setSaveError] = useState("");
  const [personalBest, setPersonalBest] = useState<{ score: number; accuracy: number; combo: number } | null>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset / 1000;
  const lastFeedback = useRef(0);
  const stats = perfect + good + misses;
  const accuracy = stats ? (perfect + good * 0.5) / stats * 100 : 100;
  const lanes = ["D", "F", "J", "K"];

  useEffect(() => {
    let active = true;
    db.arcadeData.get(rhythmOffsetKey).then((record) => {
      if (!active || !record) return;
      const value = Number(record.value);
      if (Number.isFinite(value)) setOffset(Math.max(-100, Math.min(100, Math.round(value / 5) * 5)));
    }).catch(() => { if (active) setSaveError(t("arcade.phase5c.saveError")); });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    let active = true;
    setPersonalBest(null);
    db.arcadeData.get(rhythmStatsKey(track, difficulty)).then((record) => {
      if (!active || !record) return;
      const parsed: unknown = JSON.parse(record.value);
      if (!isRhythmStats(parsed)) throw new Error("Invalid rhythm result.");
      setPersonalBest(parsed);
    }).catch(() => { if (active) setSaveError(t("arcade.phase5c.invalidSave")); });
    return () => { active = false; };
  }, [difficulty, t, track]);

  const finish = useCallback(() => {
    setStatus("over");
    setFeedback(t("arcade.phase5c.rhythmComplete"));
    playArcadeSound("rhythm-tiles", "win");
    const key = rhythmStatsKey(track, difficulty);
    void db.arcadeData.get(key).then((record) => {
      let previous = { score: 0, accuracy: 0, combo: 0 };
      if (record) {
        const parsed: unknown = JSON.parse(record.value);
        if (!isRhythmStats(parsed)) {
          setSaveError(t("arcade.phase5c.invalidSave"));
          return;
        }
        previous = parsed;
      }
      const next = {
        score: Math.max(previous.score, score),
        accuracy: Math.max(previous.accuracy, Math.round(accuracy * 10) / 10),
        combo: Math.max(previous.combo, maxCombo),
      };
      return db.arcadeData.put({ id: key, value: JSON.stringify(next), updatedAt: Date.now() })
        .then(() => { setPersonalBest(next); setSaveError(""); });
    }).catch(() => setSaveError(t("arcade.phase5c.saveError")));
  }, [accuracy, difficulty, maxCombo, score, t, track]);

  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || status !== "playing") return;
    elapsedRef.current = Math.max(0, audio.currentTime - startAtRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      await audio.suspend();
      setStatus("paused");
    } catch {
      setSaveError(t("arcade.phase5c.audioUnavailable"));
    }
  }, [status, t]);

  const start = useCallback(async () => {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) {
      setSaveError(t("arcade.phase5c.audioUnavailable"));
      return;
    }
    try {
      let audio = audioRef.current;
      if (!audio || audio.state === "closed") {
        audio = new AudioContextClass();
        audioRef.current = audio;
      }
      await audio.resume();
      const chart = chartRef.current ?? createRhythmChart(track, difficulty);
      chartRef.current = chart;
      if (status !== "paused") {
        judgedRef.current = new Set();
        scheduleIndex.current = 0;
        elapsedRef.current = 0;
        setScore(0); setCombo(0); setMaxCombo(0); setPerfect(0); setGood(0); setMisses(0); setClock(0);
      }
      startAtRef.current = audio.currentTime - elapsedRef.current;
      setStatus("playing");
      setSaveError("");
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const frequencies = [261.63, 329.63, 392, 523.25];
      timerRef.current = window.setInterval(() => {
        const current = audioRef.current;
        const activeChart = chartRef.current;
        if (!current || !activeChart || current.state !== "running") return;
        const now = current.currentTime - startAtRef.current;
        while (scheduleIndex.current < activeChart.notes.length && activeChart.notes[scheduleIndex.current].time <= now + 0.12) {
          const note = activeChart.notes[scheduleIndex.current++];
          if (note.time < elapsedRef.current) continue;
          const volume = getArcadeSoundVolume("rhythm-tiles");
          if (volume <= 0) continue;
          const oscillator = current.createOscillator();
          const gain = current.createGain();
          const at = Math.max(current.currentTime, startAtRef.current + note.time);
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequencies[note.lane], at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.055 * volume, at + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
          oscillator.connect(gain);
          gain.connect(current.destination);
          oscillator.start(at);
          oscillator.stop(at + 0.13);
        }
      }, 25);
    } catch {
      setSaveError(t("arcade.phase5c.audioUnavailable"));
    }
  }, [difficulty, status, t, track]);

  const restart = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    chartRef.current = createRhythmChart(track, difficulty);
    judgedRef.current = new Set();
    scheduleIndex.current = 0;
    elapsedRef.current = 0;
    setScore(0); setCombo(0); setMaxCombo(0); setPerfect(0); setGood(0); setMisses(0); setClock(0); setFeedback("");
    setStatus("ready");
  }, [difficulty, track]);

  const hit = useCallback((lane: number) => {
    const audio = audioRef.current;
    const chart = chartRef.current;
    if (status !== "playing" || !audio || !chart) return;
    const now = Math.max(0, audio.currentTime - startAtRef.current);
    const target = chart.notes
      .filter((note) => note.lane === lane && !judgedRef.current.has(note.id))
      .map((note) => ({ note, judgment: judgeRhythmNote(note.time, now, offsetRef.current) }))
      .filter((item) => item.judgment !== null)
      .sort((a, b) => Math.abs(a.note.time - now) - Math.abs(b.note.time - now))[0];
    if (!target?.judgment) return;
    judgedRef.current.add(target.note.id);
    if (target.judgment === "miss") {
      setMisses((value) => value + 1);
      setCombo(0);
      setFeedback(t("arcade.phase5c.judgment.miss"));
      playArcadeSound("rhythm-tiles", "failure");
    } else {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMaxCombo((value) => Math.max(value, nextCombo));
      if (target.judgment === "perfect") setPerfect((value) => value + 1);
      else setGood((value) => value + 1);
      setScore((value) => {
        const next = value + rhythmScore(target.judgment!, nextCombo);
        onBest(next);
        return next;
      });
      setFeedback(t(`arcade.phase5c.judgment.${target.judgment}`));
      playArcadeSound("rhythm-tiles", target.judgment === "perfect" ? "success" : "click");
    }
    lastFeedback.current = performance.now();
  }, [combo, onBest, status, t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(640 * dpr)) canvas.width = Math.round(640 * dpr);
      if (canvas.height !== Math.round(370 * dpr)) canvas.height = Math.round(370 * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = () => {
      const colors = readCanvasColors(canvas, "#8f8bd5");
      const width = 640;
      const height = 370;
      const chart = chartRef.current;
      const now = status === "playing" && audioRef.current ? Math.max(0, audioRef.current.currentTime - startAtRef.current) : elapsedRef.current;
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = colors.surface;
      context.fillRect(0, 0, width, height);
      const laneWidth = 116;
      const left = 88;
      const judgmentY = 292;
      context.fillStyle = colors.surface2;
      context.fillRect(left, 0, laneWidth * 4, height);
      for (let lane = 0; lane < 4; lane += 1) {
        context.fillStyle = lane % 2 ? "#ffffff06" : "#ffffff0a";
        context.fillRect(left + lane * laneWidth, 0, laneWidth, height);
        context.strokeStyle = colors.line;
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(left + lane * laneWidth, 0); context.lineTo(left + lane * laneWidth, height); context.stroke();
        context.fillStyle = colors.muted;
        context.font = "700 15px system-ui";
        context.textAlign = "center";
        context.fillText(lanes[lane], left + lane * laneWidth + laneWidth / 2, 344);
      }
      context.strokeStyle = colors.accent;
      context.globalAlpha = 0.85;
      context.lineWidth = 3;
      context.beginPath(); context.moveTo(left, judgmentY); context.lineTo(left + laneWidth * 4, judgmentY); context.stroke();
      context.globalAlpha = 1;
      if (chart) for (const note of chart.notes) {
        if (judgedRef.current.has(note.id)) continue;
        const difference = note.time - now;
        if (difference > 1.8 || difference < -0.2) continue;
        const y = judgmentY - difference * 155;
        const x = left + note.lane * laneWidth + 20;
        context.fillStyle = colors.accent;
        context.beginPath(); context.roundRect(x, y - 10, laneWidth - 40, 20, 6); context.fill();
        context.fillStyle = colors.strong;
        context.globalAlpha = 0.75;
        context.fillRect(x + 5, y - 6, laneWidth - 50, 2);
        context.globalAlpha = 1;
      }
      if (status !== "playing") {
        context.fillStyle = "#00000055";
        context.fillRect(left, 0, laneWidth * 4, height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); observer.disconnect(); };
  }, [status]);

  useEffect(() => {
    if (status !== "playing") return;
    const keyToLane: Record<string, number> = { d: 0, f: 1, j: 2, k: 3 };
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement | null)?.tagName ?? "")) return;
      const lane = keyToLane[event.key.toLowerCase()];
      if (lane !== undefined) { event.preventDefault(); hit(lane); }
      else if (event.key === "Escape") { event.preventDefault(); void pause(); }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [hit, pause, status]);

  useEffect(() => {
    if (status !== "playing") return;
    const audio = audioRef.current;
    if (!audio) return;
    const visibility = () => { if (document.hidden) void pause(); };
    document.addEventListener("visibilitychange", visibility);
    const update = window.setInterval(() => {
      const now = Math.max(0, audio.currentTime - startAtRef.current);
      elapsedRef.current = now;
      setClock(now);
      const chart = chartRef.current;
      if (!chart) return;
      for (const note of chart.notes) {
        if (!judgedRef.current.has(note.id) && now - offsetRef.current > note.time + 0.18) {
          judgedRef.current.add(note.id);
          setMisses((value) => value + 1);
          setCombo(0);
          setFeedback(t("arcade.phase5c.judgment.miss"));
        }
      }
      if (performance.now() - lastFeedback.current > 500) setFeedback("");
      if (now >= chart.duration) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        finish();
      }
    }, 33);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(update);
    };
  }, [finish, pause, status, t]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (audioRef.current && audioRef.current.state !== "closed") void audioRef.current.close();
  }, []);

  const changeOffset = (value: number) => {
    const next = Math.max(-100, Math.min(100, value));
    setOffset(next);
    void db.arcadeData.put({ id: rhythmOffsetKey, value: String(next), updatedAt: Date.now() })
      .then(() => setSaveError(""))
      .catch(() => setSaveError(t("arcade.phase5c.saveError")));
  };
  const chart = chartRef.current ?? createRhythmChart(track, difficulty);
  const progress = Math.min(100, chart.duration ? clock / chart.duration * 100 : 0);

  return (
    <section className="phase5c-game phase5c-rhythm" aria-label={t("arcade.games.rhythm-tiles.board")}>
      <div className="phase5c-toolbar">
        <label>{t("arcade.phase5c.track")}<select aria-label={t("arcade.phase5c.track")} disabled={status === "playing" || status === "paused"} value={track} onChange={(event) => { setTrack(event.target.value as RhythmTrack); chartRef.current = null; }}>
          {(["signal", "cadence", "afterglow"] as const).map((id) => <option key={id} value={id}>{t(`arcade.phase5c.tracks.${id}`)}</option>)}
        </select></label>
        <label>{t("arcade.phase5c.difficulty")}<select aria-label={t("arcade.phase5c.difficulty")} disabled={status === "playing" || status === "paused"} value={difficulty} onChange={(event) => { setDifficulty(event.target.value as RhythmDifficulty); chartRef.current = null; }}>
          {(["easy", "normal", "hard"] as const).map((id) => <option key={id} value={id}>{t(`arcade.phase5c.difficulties.${id}`)}</option>)}
        </select></label>
        <span><b>{t("arcade.score")}</b>{score.toLocaleString()}</span>
        <span><b>{t("arcade.phase5c.combo")}</b>{combo}×</span>
        <span><b>{t("arcade.phase5c.accuracy")}</b>{accuracy.toFixed(1)}%</span>
        {status === "ready" ? <button className="button button--primary" onClick={() => void start()} type="button"><Volume2 size={14} />{t("arcade.phase5c.startTrack")}</button>
          : status === "over" ? <button className="button button--primary" onClick={() => { restart(); void start(); }} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button>
            : <button className="button button--quiet" onClick={() => status === "paused" ? void start() : void pause()} type="button">{status === "paused" ? <Play size={13} /> : <Pause size={13} />}{t(status === "paused" ? "arcade.resume" : "arcade.pause")}</button>}
        <button className="button button--quiet" disabled={status === "playing" || status === "paused"} onClick={restart} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
      </div>
      <div className="phase5c-rhythm__stats"><span>{t("arcade.phase5c.perfect")}: <b>{perfect}</b></span><span>{t("arcade.phase5c.good")}: <b>{good}</b></span><span>{t("arcade.phase5c.misses")}: <b>{misses}</b></span><span>{t("arcade.phase5c.trackBest")}: <b>{personalBest?.score ?? best ?? 0}</b></span></div>
      <div className="phase5c-rhythm__progress"><i style={{ width: `${progress}%` }} /></div>
      <div className={`phase5c-rhythm__stage is-${status}`}>
        <canvas ref={canvasRef} className="phase5c-canvas phase5c-rhythm__canvas" aria-label={t("arcade.games.rhythm-tiles.board")} />
        {status !== "playing" && <div className="phase5c-overlay"><span>{status === "ready" ? t("arcade.phase5c.rhythmStart") : status === "paused" ? t("arcade.phase5c.paused") : t("arcade.phase5c.rhythmComplete")}</span>{status === "over" && <strong>{t("arcade.phase5c.results", { score: score.toLocaleString(), accuracy: accuracy.toFixed(1), combo: maxCombo })}</strong>}{status === "ready" && <button className="button button--primary" onClick={() => void start()} type="button"><Play size={14} />{t("arcade.phase5c.play")}</button>}</div>}
      </div>
      <div className="phase5c-rhythm__touch" role="group" aria-label={t("arcade.phase5c.touchLanes")}>
        {lanes.map((key, lane) => <button key={key} className={`is-lane-${lane}`} disabled={status !== "playing"} onPointerDown={() => hit(lane)} type="button"><span>{key}</span></button>)}
      </div>
      <div className="phase5c-rhythm__settings"><label>{t("arcade.phase5c.audioOffset")} <input aria-label={t("arcade.phase5c.audioOffset")} type="range" min={-100} max={100} step={5} value={offset} onChange={(event) => changeOffset(Number(event.target.value))} /><output>{offset > 0 ? "+" : ""}{offset} ms</output></label><strong aria-live="polite">{feedback}</strong></div>
      {status === "over" && <p className="arcade-game-status" role="status">{t("arcade.phase5c.results", { score: score.toLocaleString(), accuracy: accuracy.toFixed(1), combo: maxCombo })}</p>}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      <p className="arcade-game-hint">{t("arcade.games.rhythm-tiles.hint")}</p>
    </section>
  );
}

function Platformer({ best, onBest }: Pick<Props, "best" | "onBest">) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createPlatformerState());
  const inputRef = useRef<PlatformerInput>({ left: false, right: false, jump: false });
  const pausedRef = useRef(false);
  const [state, setState] = useState(stateRef.current);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [error, setError] = useState("");
  pausedRef.current = paused;

  const persist = useCallback((next: PlatformerState) => {
    if (!saveEnabled) return;
    void db.arcadeData.put({ id: platformSaveKey, value: JSON.stringify(next), updatedAt: Date.now() })
      .then(() => setError(""))
      .catch(() => setError(t("arcade.phase5c.saveError")));
  }, [saveEnabled, t]);

  const commit = useCallback((next: PlatformerState, write = true) => {
    stateRef.current = next;
    setState(next);
    if (write) persist(next);
  }, [persist]);

  useEffect(() => {
    let active = true;
    db.arcadeData.get(platformSaveKey).then((record) => {
      if (!active) return;
      if (record) {
        try {
          const saved: unknown = JSON.parse(record.value);
          if (!isPlatformSave(saved)) throw new Error("Invalid platformer save.");
          stateRef.current = saved;
          setState(saved);
          setSaveEnabled(true);
        } catch {
          setError(t("arcade.phase5c.invalidSave"));
        }
      } else setSaveEnabled(true);
      setLoaded(true);
    }).catch(() => { if (active) { setError(t("arcade.phase5c.saveError")); setLoaded(true); } });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setInterval(() => persist(stateRef.current), 1800);
    return () => window.clearInterval(timer);
  }, [loaded, persist]);

  useEffect(() => {
    if (state.completedLevels.length) onBest(Math.max(best ?? 0, state.unlocked - 1));
  }, [best, onBest, state.completedLevels.length, state.unlocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(800 * ratio)) canvas.width = Math.round(800 * ratio);
      if (canvas.height !== Math.round(450 * ratio)) canvas.height = Math.round(450 * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    let frame = 0;
    let previous = 0;
    let uiTime = 0;
    const draw = () => {
      const colors = readCanvasColors(canvas, "#9b8bd3");
      const world = stateRef.current;
      const level = platformLevels[world.level];
      context.setTransform(canvas.width / 800, 0, 0, canvas.height / 450, 0, 0);
      context.clearRect(0, 0, 800, 450);
      const background = context.createLinearGradient(0, 0, 0, 450);
      background.addColorStop(0, colors.surface);
      background.addColorStop(1, colors.surface2);
      context.fillStyle = background;
      context.fillRect(0, 0, 800, 450);
      context.fillStyle = `${colors.accent}12`;
      for (let index = 0; index < 8; index += 1) {
        const x = (index * 137 + 53) % 800;
        const y = 40 + (index * 47) % 190;
        context.beginPath(); context.arc(x, y, 14 + index * 4, Math.PI, Math.PI * 2); context.fill();
      }
      context.strokeStyle = `${colors.line}80`;
      context.lineWidth = 1;
      for (let x = 0; x <= 800; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 450); context.stroke(); }
      for (let y = 0; y <= 450; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(800, y); context.stroke(); }
      const moving = level.moving.map((platform) => ({
        ...platform,
        x: platform.x + Math.sin(world.time * platform.speed + platform.phase) * platform.range,
      }));
      for (const platform of [...level.platforms, ...moving]) {
        context.fillStyle = colors.surface2;
        context.fillRect(platform.x, platform.y, platform.width, platform.height);
        context.fillStyle = colors.accent;
        context.globalAlpha = 0.64;
        context.fillRect(platform.x, platform.y, platform.width, 3);
        context.globalAlpha = 1;
        context.strokeStyle = colors.line;
        context.strokeRect(platform.x + 0.5, platform.y + 0.5, platform.width - 1, platform.height - 1);
      }
      for (const hazard of level.hazards) {
        context.fillStyle = "#c87869";
        const count = Math.max(1, Math.floor(hazard.width / 18));
        for (let index = 0; index < count; index += 1) {
          const x = hazard.x + index * hazard.width / count;
          context.beginPath(); context.moveTo(x, hazard.y + hazard.height); context.lineTo(x + hazard.width / count / 2, hazard.y); context.lineTo(x + hazard.width / count, hazard.y + hazard.height); context.closePath(); context.fill();
        }
      }
      for (const item of level.collectibles) {
        if (world.collected.includes(item.id)) continue;
        context.strokeStyle = "#d7bc78";
        context.lineWidth = 3;
        context.beginPath(); context.arc(item.x, item.y, 8 + Math.sin(world.time * 4) * 1.5, 0, Math.PI * 2); context.stroke();
        context.fillStyle = "#d7bc7855";
        context.beginPath(); context.arc(item.x, item.y, 4, 0, Math.PI * 2); context.fill();
      }
      for (const checkpoint of level.checkpoints) {
        context.fillStyle = world.checkpoint.x === checkpoint.x - 12.5 ? "#80b899" : colors.muted;
        context.fillRect(checkpoint.x - 2, checkpoint.y - 24, 4, 26);
        context.beginPath(); context.moveTo(checkpoint.x + 1, checkpoint.y - 23); context.lineTo(checkpoint.x + 20, checkpoint.y - 17); context.lineTo(checkpoint.x + 1, checkpoint.y - 10); context.closePath(); context.fill();
      }
      context.strokeStyle = "#8bb99a";
      context.lineWidth = 3;
      context.strokeRect(level.exit.x, level.exit.y, level.exit.width, level.exit.height);
      context.fillStyle = "#8bb99a22";
      context.fillRect(level.exit.x, level.exit.y, level.exit.width, level.exit.height);
      context.fillStyle = colors.accent;
      context.beginPath(); context.roundRect(world.x, world.y, 25, 32, 5); context.fill();
      context.fillStyle = colors.surface;
      context.beginPath(); context.arc(world.x + 17, world.y + 10, 2, 0, Math.PI * 2); context.fill();
      context.fillStyle = colors.strong;
      context.fillRect(world.x + 4, world.y + 25, 6, 5);
    };
    const animate = (now: number) => {
      const dt = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
      previous = now;
      if (!document.hidden && !pausedRef.current && loaded) {
        const next = stepPlatformer(stateRef.current, inputRef.current, dt);
        if (next !== stateRef.current) {
          const previousLives = stateRef.current.lives;
          stateRef.current = next;
          uiTime += dt;
          if (uiTime >= 0.12 || next.complete || next.lives !== previousLives || next.gameOver) {
            uiTime = 0;
            setState({ ...next });
          }
        }
      } else previous = 0;
      draw();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [loaded]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName)) return;
      if (event.key === "Escape") { event.preventDefault(); setPaused((value) => !value); return; }
      if (["ArrowLeft", "a", "A"].includes(event.key)) inputRef.current.left = true;
      if (["ArrowRight", "d", "D"].includes(event.key)) inputRef.current.right = true;
      if (["ArrowUp", " ", "w", "W"].includes(event.key)) inputRef.current.jump = true;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) inputRef.current.left = false;
      if (["ArrowRight", "d", "D"].includes(event.key)) inputRef.current.right = false;
      if (["ArrowUp", " ", "w", "W"].includes(event.key)) inputRef.current.jump = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const chooseLevel = (value: number) => commit(loadPlatformerLevel(stateRef.current, value));
  const nextLevel = () => {
    const nextLevelIndex = stateRef.current.level + 1;
    if (nextLevelIndex < platformLevels.length) commit(loadPlatformerLevel(stateRef.current, nextLevelIndex));
    else { commit({ ...stateRef.current, complete: false }); }
    setPaused(false);
    playArcadeSound("mini-platformer", "success");
  };
  const restartLevel = () => {
    commit(loadPlatformerLevel(stateRef.current, stateRef.current.level));
    setPaused(false);
  };
  const touch = (key: keyof PlatformerInput, down: boolean) => { inputRef.current[key] = down; };

  return (
    <section className="phase5c-game phase5c-platformer" aria-label={t("arcade.games.mini-platformer.board")}>
      <div className="phase5c-toolbar">
        <label>{t("arcade.phase5c.level")}<select aria-label={t("arcade.phase5c.level")} value={state.level} onChange={(event) => chooseLevel(Number(event.target.value))}>
          {platformLevels.map((level, index) => <option key={level.name} disabled={index >= state.unlocked} value={index}>{t("arcade.phase5c.levelNumber", { number: index + 1 })}</option>)}
        </select></label>
        <span><b>{t("arcade.phase5c.time")}</b>{state.time.toFixed(1)}s</span>
        <span><b>{t("arcade.phase5c.collectibles")}</b>{state.collected.length}/{platformLevels[state.level].collectibles.length}</span>
        <span><b>{t("arcade.phase5c.lives")}</b>{state.lives}</span>
        <button className="button button--quiet" disabled={state.complete || state.gameOver} onClick={() => setPaused((value) => !value)} type="button">{paused ? <Play size={13} /> : <Pause size={13} />}{t(paused ? "arcade.resume" : "arcade.pause")}</button>
        <button className="button button--quiet" onClick={restartLevel} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
      </div>
      <div className="phase5c-platformer__stage">
        <canvas ref={canvasRef} className="phase5c-canvas phase5c-platformer__canvas" aria-label={t("arcade.games.mini-platformer.board")} />
        {(paused || state.complete || state.gameOver) && <div className="phase5c-overlay">
          <span>{paused ? t("arcade.phase5c.paused") : state.gameOver ? t("arcade.phase5c.platformerOver") : state.level === platformLevels.length - 1 ? t("arcade.phase5c.platformerAllComplete") : t("arcade.phase5c.platformerComplete")}</span>
          {state.complete && <strong>{t("arcade.phase5c.levelTime", { time: state.time.toFixed(1) })}</strong>}
          {(state.complete || state.gameOver) && <button className="button button--primary" onClick={state.complete ? nextLevel : restartLevel} type="button">{state.complete ? t(state.level === platformLevels.length - 1 ? "arcade.phase5c.finish" : "arcade.phase5c.nextLevel") : t("arcade.restart")}</button>}
        </div>}
      </div>
      <div className="phase5c-platformer__touch" role="group" aria-label={t("arcade.phase5c.touchControls")}>
        <span><button aria-label={t("arcade.phase5c.left")} onPointerDown={() => touch("left", true)} onPointerUp={() => touch("left", false)} onPointerLeave={() => touch("left", false)} onPointerCancel={() => touch("left", false)} type="button"><ArrowLeft size={18} /></button><button aria-label={t("arcade.phase5c.right")} onPointerDown={() => touch("right", true)} onPointerUp={() => touch("right", false)} onPointerLeave={() => touch("right", false)} onPointerCancel={() => touch("right", false)} type="button"><ArrowRight size={18} /></button></span>
        <button className="is-jump" aria-label={t("arcade.phase5c.jump")} onPointerDown={() => touch("jump", true)} onPointerUp={() => touch("jump", false)} onPointerLeave={() => touch("jump", false)} onPointerCancel={() => touch("jump", false)} type="button"><ArrowUp size={18} /></button>
      </div>
      <div className="phase5c-platformer__legend"><span><i />{t("arcade.phase5c.player")}</span><span><i className="is-hazard" />{t("arcade.phase5c.hazard")}</span><span><i className="is-checkpoint" />{t("arcade.phase5c.checkpoint")}</span><span><i className="is-coin" />{t("arcade.phase5c.collectible")}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="arcade-game-hint">{t("arcade.games.mini-platformer.hint")}</p>
    </section>
  );
}

export function Phase5CGameScreen(props: Props) {
  const style = {
    "--game-accent": props.palette.accent,
    "--game-accent-soft": props.palette.soft,
    "--game-accent-strong": props.palette.strong,
  } as React.CSSProperties;
  return (
    <div className="arcade-game-area phase5-game-area" style={style}>
      {props.game.id === "tower-defense" && <TowerDefense best={props.best} onBest={props.onBest} palette={props.palette} />}
      {props.game.id === "rhythm-tiles" && <RhythmTiles best={props.best} onBest={props.onBest} />}
      {props.game.id === "mini-platformer" && <Platformer best={props.best} onBest={props.onBest} />}
    </div>
  );
}
