import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CirclePause, CirclePlay, Eraser, MousePointer2, Pencil, RotateCcw, Redo2, Save, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db, createId } from "../data/db";
import { playArcadeSound } from "../data/arcade-audio";
import {
  applyClickerOfflineProgress, clickerCollect, clickerInitialState, clickerProduction,
  clickerUpgrade, clickerUpgradePrice, nextSimonSequence, normalizeClickerSave,
  simonPlaybackDelay, stepRider, type ClickerState, type RiderState, type SimonDifficulty, type TrackPoint,
} from "../data/phase3-games";
import type { GameId } from "../data/arcade";

type Palette = { accent: string; soft: string; strong: string };
type Props = { best?: number; onBest: (score: number) => void; palette: Palette };

export function Phase3GameScreen({ gameId, ...props }: Props & { gameId: Extract<GameId, "simon-says" | "line-rider" | "idle-clicker"> }) {
  const style = {
    "--game-accent": props.palette.accent,
    "--game-accent-soft": props.palette.soft,
    "--game-accent-strong": props.palette.strong,
  } as React.CSSProperties;
  return <div className="arcade-game-area" style={style}>
    {gameId === "simon-says" && <SimonSays {...props} />}
    {gameId === "line-rider" && <LineRider accent={props.palette.accent} />}
    {gameId === "idle-clicker" && <IdleClicker {...props} />}
  </div>;
}

function SimonSays({ best, onBest }: Props) {
  const { t } = useTranslation();
  const [sequence, setSequence] = useState<number[]>([]);
  const [playIndex, setPlayIndex] = useState(-1);
  const [activePad, setActivePad] = useState(-1);
  const [inputIndex, setInputIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<SimonDifficulty>("normal");
  const [playing, setPlaying] = useState(false);
  const [waitingNext, setWaitingNext] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const [roundBest, setRoundBest] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  const playNext = useCallback((current: number[]) => {
    setSequence(current);
    setInputIndex(0);
    setPlaying(true);
    setPlayIndex(0);
  }, []);

  useEffect(() => {
    if (!playing || paused || over) return;
    const delay = simonPlaybackDelay[difficulty];
    if (playIndex >= sequence.length) {
      timer.current = window.setTimeout(() => {
        setPlaying(false);
        setPlayIndex(-1);
        setActivePad(-1);
        setStatus(t("arcade.phase3.simonYourTurn"));
      }, delay);
      return () => window.clearTimeout(timer.current);
    }
    setActivePad(sequence[playIndex]);
    playArcadeSound("simon-says", "score");
    timer.current = window.setTimeout(() => {
      setActivePad(-1);
      timer.current = window.setTimeout(() => setPlayIndex((index) => index + 1), Math.max(100, delay * 0.28));
    }, delay * 0.58);
    return () => window.clearTimeout(timer.current);
  }, [playing, paused, over, playIndex, sequence, difficulty, t]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function start() {
    window.clearTimeout(timer.current);
    const first = nextSimonSequence([]);
    setOver(false);
    setPaused(false);
    setWaitingNext(false);
    setRoundBest(0);
    setStatus("");
    playNext(first);
    playArcadeSound("simon-says", "start");
  }
  function pressPad(index: number) {
    if (playing || waitingNext || paused || over || !sequence.length) return;
    setActivePad(index);
    window.setTimeout(() => setActivePad(-1), 160);
    playArcadeSound("simon-says", "success");
    if (sequence[inputIndex] !== index) {
      setOver(true);
      setStatus(t("arcade.gameOver"));
      playArcadeSound("simon-says", "gameOver");
      return;
    }
    const nextIndex = inputIndex + 1;
    if (nextIndex === sequence.length) {
      const score = sequence.length;
      setRoundBest(score);
      onBest(score);
      setWaitingNext(true);
      setStatus(t("arcade.phase3.simonRound", { round: score }));
      timer.current = window.setTimeout(() => {
        if (!sequenceRef.current.length) return;
        setWaitingNext(false);
        playNext(nextSimonSequence(sequenceRef.current));
      }, 650);
    } else setInputIndex(nextIndex);
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      const index = ["1", "2", "3", "4"].indexOf(event.key);
      if (index >= 0) { event.preventDefault(); pressPad(index); }
      else if (event.code === "Space" && sequence.length) { event.preventDefault(); setPaused((value) => !value); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return <section className="arcade-play-card phase3-simon">
    <div className="arcade-score-row">
      <span>{t("arcade.phase3.round")}: <strong>{sequence.length}</strong></span>
      <span>{t("arcade.best")}: <strong>{best ?? roundBest}</strong></span>
      <label>{t("arcade.difficulty")} <select aria-label={t("arcade.difficulty")} value={difficulty} onChange={(event) => setDifficulty(event.target.value as SimonDifficulty)}>
        {(["easy", "normal", "hard"] as const).map((value) => <option key={value} value={value}>{t(`arcade.${value}`)}</option>)}
      </select></label>
      {sequence.length > 0 && !over && <button className="button button--quiet" onClick={() => { setPaused((value) => !value); playArcadeSound("simon-says", "click"); }} type="button">{paused ? <CirclePlay size={14} /> : <CirclePause size={14} />}{paused ? t("arcade.resume") : t("arcade.pause")}</button>}
      <button className="button button--quiet" onClick={start} type="button"><RotateCcw size={14} />{sequence.length ? t("arcade.restart") : t("arcade.start")}</button>
    </div>
    <div aria-label={t("arcade.games.simon-says.board")} className={`simon-board${paused ? " is-paused" : ""}`} role="group">
      {["coral", "blue", "amber", "green"].map((color, index) => <button
        aria-label={`${t("arcade.phase3.pad")} ${index + 1}`}
        className={`simon-pad simon-pad--${color}${activePad === index ? " is-lit" : ""}`}
        disabled={!sequence.length || playing || waitingNext || paused || over}
        key={color}
        onClick={() => pressPad(index)}
        type="button"
      >{index + 1}</button>)}
    </div>
    <p aria-live="polite" className="arcade-game-status" role="status">{status || (sequence.length ? playing ? t("arcade.phase3.simonWatch") : t("arcade.phase3.simonYourTurn") : t("arcade.phase3.simonHint"))}</p>
    {over && <button className="button button--primary" onClick={start} type="button">{t("arcade.restart")}</button>}
  </section>;
}

type TrackSave = { id: string; name: string; lines: TrackPoint[][]; updatedAt: number };
type RiderTool = "pencil" | "eraser" | "pan";
const riderWidth = 800;
const riderHeight = 460;
const exampleLines: TrackPoint[][] = [[
  { x: 35, y: 280 }, { x: 170, y: 280 }, { x: 245, y: 240 }, { x: 320, y: 205 },
  { x: 420, y: 205 }, { x: 500, y: 265 }, { x: 590, y: 300 }, { x: 760, y: 300 },
]];
const distanceToSegment = (point: TrackPoint, a: TrackPoint, b: TrackPoint) => {
  const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
};

function LineRider({ accent }: { accent: string }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lines, setLines] = useState<TrackPoint[][]>(exampleLines);
  const linesRef = useRef(lines); linesRef.current = lines;
  const segments = useMemo(
    () => lines.flatMap((line) => line.slice(1).map((point, index) => [line[index], point] as [TrackPoint, TrackPoint])),
    [lines],
  );
  const segmentsRef = useRef(segments); segmentsRef.current = segments;
  const [tool, setTool] = useState<RiderTool>("pencil");
  const [zoom, setZoom] = useState(1);
  const [running, setRunning] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [trackName, setTrackName] = useState("");
  const [savedTracks, setSavedTracks] = useState<TrackSave[]>([]);
  const [error, setError] = useState("");
  const [viewportTick, setViewportTick] = useState(0);
  const [undoStack, setUndoStack] = useState<TrackPoint[][][]>([]);
  const [redoStack, setRedoStack] = useState<TrackPoint[][][]>([]);
  const rider = useRef<RiderState>({ x: 58, y: 263, vx: 75, vy: 0, angle: 0 });
  const camera = useRef({ x: 0, y: 0 });
  const drawing = useRef(false);
  const panOrigin = useRef<{ x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const tracks = useLiveQuery(() => db.arcadeData.where("id").startsWith("track:line-rider:").toArray(), [], []);

  useEffect(() => {
    if (!tracks) return;
    setSavedTracks(tracks.flatMap((record) => {
      try {
        const parsed = JSON.parse(record.value) as TrackSave;
        if (!Array.isArray(parsed.lines) || typeof parsed.name !== "string") throw new Error("Invalid track");
        return [{ ...parsed, id: record.id }];
      } catch {
        setError(t("arcade.saveError"));
        return [];
      }
    }).sort((a, b) => b.updatedAt - a.updatedAt));
  }, [tracks, t]);

  const saveTrack = async () => {
    const id = savedId || `track:line-rider:${createId()}`;
    const next: TrackSave = { id, name: trackName.trim() || t("arcade.phase3.untitledTrack"), lines: linesRef.current, updatedAt: Date.now() };
    try {
      await db.arcadeData.put({ id, value: JSON.stringify(next), updatedAt: next.updatedAt });
      setSavedId(id); setTrackName(next.name); setError("");
    } catch { setError(t("arcade.saveError")); }
  };
  async function loadTrack(id: string) {
    try {
      const record = await db.arcadeData.get(id);
      if (!record) throw new Error("Track not found");
      const parsed = JSON.parse(record.value) as TrackSave;
      if (!Array.isArray(parsed.lines)) throw new Error("Invalid track");
      setLines(parsed.lines); setSavedId(id); setTrackName(parsed.name); setUndoStack([]); setRedoStack([]);
      rider.current = { x: (parsed.lines[0]?.[0]?.x ?? 40) + 20, y: (parsed.lines[0]?.[0]?.y ?? 280) - 18, vx: 70, vy: 0, angle: 0 };
      setRunning(false);
    } catch { setError(t("arcade.saveError")); }
  }
  async function renameTrack() {
    if (!savedId || !trackName.trim()) return;
    await saveTrack();
  }
  async function deleteTrack() {
    if (!savedId || !window.confirm(t("arcade.phase3.deleteTrackConfirm"))) return;
    try { await db.arcadeData.delete(savedId); setSavedId(""); setTrackName(""); setError(""); }
    catch { setError(t("arcade.saveError")); }
  }
  function replaceLines(next: TrackPoint[][]) {
    setUndoStack((stack) => [...stack.slice(-39), linesRef.current.map((line) => line.map((point) => ({ ...point })))]);
    setRedoStack([]);
    setLines(next); linesRef.current = next;
  }
  function undo() {
    if (!undoStack.length) return;
    const previous = undoStack.at(-1)!;
    setRedoStack((stack) => [...stack, linesRef.current]);
    setUndoStack((stack) => stack.slice(0, -1));
    setLines(previous); linesRef.current = previous;
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.at(-1)!;
    setUndoStack((stack) => [...stack, linesRef.current]);
    setRedoStack((stack) => stack.slice(0, -1));
    setLines(next); linesRef.current = next;
  }
  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): TrackPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * riderWidth / rect.width / zoom + camera.current.x, y: (event.clientY - rect.top) * riderHeight / rect.height / zoom + camera.current.y };
  };
  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    setRunning(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === "pan") {
      const rect = event.currentTarget.getBoundingClientRect();
      panOrigin.current = { x: event.clientX, y: event.clientY, cameraX: camera.current.x, cameraY: camera.current.y };
      event.currentTarget.dataset.scale = String(riderWidth / rect.width / zoom);
      return;
    }
    if (tool === "pencil") {
      const next = [...linesRef.current.map((line) => [...line]), [point]];
      replaceLines(next); drawing.current = true;
    } else {
      const remaining = linesRef.current.filter((line) => !line.slice(1).some((p, index) => distanceToSegment(point, line[index], p) < 18 / zoom));
      if (remaining.length !== linesRef.current.length) replaceLines(remaining);
    }
  }
  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (panOrigin.current) {
      const scale = Number(event.currentTarget.dataset.scale) || 1;
      camera.current = { x: panOrigin.current.cameraX - (event.clientX - panOrigin.current.x) * scale, y: panOrigin.current.cameraY - (event.clientY - panOrigin.current.y) * scale };
      setViewportTick((value) => value + 1);
      return;
    }
    if (!drawing.current || tool !== "pencil") return;
    const point = pointFromEvent(event);
    if (Math.hypot(point.x - (linesRef.current.at(-1)?.at(-1)?.x ?? point.x), point.y - (linesRef.current.at(-1)?.at(-1)?.y ?? point.y)) < 2) return;
    const next = linesRef.current.map((line, index) => index === linesRef.current.length - 1 ? [...line, point] : line);
    setLines(next); linesRef.current = next;
  }
  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false; panOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0; let previous = 0; let accumulator = 0; let active = true;
    const draw = (timestamp: number) => {
      if (!active) return;
      const elapsed = Math.min(0.05, (timestamp - (previous || timestamp)) / 1000); previous = timestamp;
      if (running) {
        accumulator += elapsed;
        while (accumulator >= 1 / 120) {
          rider.current = stepRider(rider.current, segmentsRef.current, 1 / 120);
          accumulator -= 1 / 120;
        }
        camera.current.x += (Math.max(0, rider.current.x - 260 / zoom) - camera.current.x) * Math.min(1, elapsed * 4);
        camera.current.y += (Math.max(0, rider.current.y - 320 / zoom) - camera.current.y) * Math.min(1, elapsed * 3);
      }
      context.clearRect(0, 0, riderWidth, riderHeight);
      context.save(); context.scale(zoom, zoom); context.translate(-camera.current.x, -camera.current.y);
      context.strokeStyle = "rgba(255,255,255,.07)"; context.lineWidth = 1 / zoom;
      const left = camera.current.x; const top = camera.current.y;
      for (let x = Math.floor(left / 40) * 40; x < left + riderWidth / zoom; x += 40) { context.beginPath(); context.moveTo(x, top); context.lineTo(x, top + riderHeight / zoom); context.stroke(); }
      for (let y = Math.floor(top / 40) * 40; y < top + riderHeight / zoom; y += 40) { context.beginPath(); context.moveTo(left, y); context.lineTo(left + riderWidth / zoom, y); context.stroke(); }
      context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = accent; context.lineWidth = 5 / zoom;
      for (const line of linesRef.current) {
      if (line.length < 2) continue;
      context.beginPath(); context.moveTo(line[0].x, line[0].y);
      for (let index = 1; index < line.length - 1; index += 1) {
        const midpointX = (line[index].x + line[index + 1].x) / 2;
        const midpointY = (line[index].y + line[index + 1].y) / 2;
        context.quadraticCurveTo(line[index].x, line[index].y, midpointX, midpointY);
      }
      context.lineTo(line[line.length - 1].x, line[line.length - 1].y); context.stroke();
      }
      context.fillStyle = accent; context.beginPath(); context.arc(rider.current.x, rider.current.y, 9 / zoom, 0, Math.PI * 2); context.fill();
      context.strokeStyle = "#16191d"; context.lineWidth = 2 / zoom; context.beginPath(); context.moveTo(rider.current.x - 5 / zoom, rider.current.y); context.lineTo(rider.current.x + 5 / zoom, rider.current.y); context.stroke();
      context.restore();
      if (running) frame = window.requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [running, zoom, lines, viewportTick, accent]);

  return <section className="arcade-play-card canvas-game line-rider">
    <div className="arcade-score-row canvas-game__toolbar">
      {(["pencil", "eraser", "pan"] as const).map((value) => <button aria-pressed={tool === value} className={`button ${tool === value ? "button--primary" : "button--quiet"}`} key={value} onClick={() => setTool(value)} type="button">{value === "pencil" ? <Pencil size={14} /> : value === "eraser" ? <Eraser size={14} /> : <MousePointer2 size={14} />}{t(`arcade.phase3.${value}`)}</button>)}
      <button aria-label={t("arcade.undo")} className="button button--quiet" disabled={!undoStack.length} onClick={undo} type="button"><Undo2 size={14} /></button>
      <button aria-label={t("arcade.redo")} className="button button--quiet" disabled={!redoStack.length} onClick={redo} type="button"><Redo2 size={14} /></button>
      <button aria-label={t("arcade.phase3.zoomOut")} className="button button--quiet" disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, value - .1))} type="button"><ZoomOut size={14} /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button aria-label={t("arcade.phase3.zoomIn")} className="button button--quiet" disabled={zoom >= 1.8} onClick={() => setZoom((value) => Math.min(1.8, value + .1))} type="button"><ZoomIn size={14} /></button>
      <button className="button button--primary" onClick={() => { if (!running) { rider.current = { x: (linesRef.current[0]?.[0]?.x ?? 40) + 20, y: (linesRef.current[0]?.[0]?.y ?? 280) - 18, vx: 70, vy: 0, angle: 0 }; } setRunning((value) => !value); }} type="button">{running ? <CirclePause size={14} /> : <CirclePlay size={14} />}{running ? t("arcade.pause") : t("arcade.start")}</button>
      <button className="button button--quiet" onClick={() => { setRunning(false); rider.current = { x: (linesRef.current[0]?.[0]?.x ?? 40) + 20, y: (linesRef.current[0]?.[0]?.y ?? 280) - 18, vx: 70, vy: 0, angle: 0 }; camera.current = { x: 0, y: 0 }; }} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button>
      <button className="button button--quiet" onClick={() => { setLines(exampleLines); linesRef.current = exampleLines; setSavedId(""); setTrackName(""); setRunning(false); }} type="button">{t("arcade.phase3.example")}</button>
    </div>
    <canvas aria-label={t("arcade.games.line-rider.board")} className="phase2-canvas line-rider__canvas" height={riderHeight} onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} ref={canvasRef} width={riderWidth} />
    <div className="line-rider__save">
      <input aria-label={t("arcade.phase3.trackName")} onChange={(event) => setTrackName(event.target.value)} placeholder={t("arcade.phase3.trackName")} value={trackName} />
      <button className="button button--quiet" onClick={() => void saveTrack()} type="button"><Save size={14} />{t("arcade.phase3.saveTrack")}</button>
      <button className="button button--quiet" disabled={!savedId} onClick={() => void renameTrack()} type="button">{t("arcade.phase3.rename")}</button>
      <button className="button button--quiet" disabled={!savedId} onClick={() => void deleteTrack()} type="button">{t("arcade.phase3.delete")}</button>
      <select aria-label={t("arcade.phase3.savedTracks")} onChange={(event) => event.target.value && void loadTrack(event.target.value)} value="">
        <option value="">{t("arcade.phase3.savedTracks")}</option>{savedTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
      </select>
    </div>
    <p className="arcade-game-hint">{t("arcade.games.line-rider.hint")}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

const clickerKey = "save:idle-clicker";
const formatResource = (value: number) => {
  if (value < 1_000) return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (value < 1_000_000) return Math.floor(value).toLocaleString();
  const suffix = ["", "K", "M", "B", "T", "Qa", "Qi"];
  const tier = Math.min(suffix.length - 1, Math.floor(Math.log10(value) / 3));
  return `${(value / 1000 ** tier).toFixed(2)}${suffix[tier]}`;
};

function IdleClicker({ best, onBest }: Props) {
  const { t } = useTranslation();
  const stored = useLiveQuery(async () => await db.arcadeData.get(clickerKey) ?? null, [], undefined);
  const [game, setGame] = useState<ClickerState>({ ...clickerInitialState });
  const gameRef = useRef(game); gameRef.current = game;
  const [loaded, setLoaded] = useState(false);
  const [saveSafe, setSaveSafe] = useState(true);
  const [offlineGain, setOfflineGain] = useState(0);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const commit = useCallback((next: ClickerState, persist = true, force = false) => {
    const saved = persist ? { ...next, lastSavedAt: Date.now() } : next;
    gameRef.current = saved; setGame(saved);
    if (persist) onBest(saved.lifetime);
    if (persist && !saveSafe && !force) return;
    if (persist) void db.arcadeData.put({ id: clickerKey, value: JSON.stringify(saved), updatedAt: saved.lastSavedAt }).then(() => setError("")).catch(() => setError(t("arcade.saveError")));
  }, [onBest, saveSafe, t]);
  useEffect(() => {
    if (stored === undefined || loaded) return;
    let baseline = { ...clickerInitialState };
    if (stored) {
      try { baseline = normalizeClickerSave(JSON.parse(stored.value)); }
      catch { setSaveSafe(false); setError(t("arcade.phase3.invalidSave")); setLoaded(true); return; }
    }
    const result = applyClickerOfflineProgress(baseline, Date.now());
    setOfflineGain(result.gained);
    commit(result.state, Boolean(stored));
    setLoaded(true);
  }, [stored?.value, loaded, commit, t]);
  useEffect(() => {
    if (!loaded) return;
    let tick: number | undefined;
    let save: number | undefined;
    const persist = () => {
      if (!saveSafe) return;
      const current = { ...gameRef.current, lastSavedAt: Date.now() };
      void db.arcadeData.put({ id: clickerKey, value: JSON.stringify(current), updatedAt: current.lastSavedAt })
        .catch(() => setError(t("arcade.saveError")));
    };
    const stopTimers = () => {
      if (tick !== undefined) window.clearInterval(tick);
      if (save !== undefined) window.clearInterval(save);
      tick = undefined;
      save = undefined;
    };
    const startTimers = () => {
      if (document.hidden || tick !== undefined) return;
      tick = window.setInterval(() => {
        const current = gameRef.current;
        const gained = clickerProduction(current);
        if (gained > 0) commit({ ...current, resources: current.resources + gained, lifetime: current.lifetime + gained, lastSavedAt: Date.now() }, false);
      }, 1000);
      save = window.setInterval(() => commit({ ...gameRef.current, lastSavedAt: Date.now() }), 15_000);
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimers();
        persist();
        return;
      }
      const progress = applyClickerOfflineProgress(gameRef.current, Date.now());
      if (progress.gained > 0) {
        setOfflineGain(progress.gained);
        commit(progress.state, false);
      }
      startTimers();
    };
    startTimers();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", persist);
    return () => {
      stopTimers();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", persist);
    };
  }, [loaded, commit, saveSafe, t]);
  function collect() { commit(clickerCollect(gameRef.current)); playArcadeSound("idle-clicker", "score"); }
  function buy(kind: "click" | "auto" | "multiplier") {
    const next = clickerUpgrade(gameRef.current, kind);
    if (!next) { playArcadeSound("idle-clicker", "failure"); return; }
    commit(next); playArcadeSound("idle-clicker", "powerUp");
  }
  function reset() {
    setResetting(false);
    setSaveSafe(true);
    commit({ ...clickerInitialState, lastSavedAt: Date.now() }, true, true);
  }
  const cards = [
    { kind: "click" as const, level: game.clickLevel, effect: `+${(1 + game.clickLevel) * 2 ** game.multiplierLevel} / ${t("arcade.phase3.click")}` },
    { kind: "auto" as const, level: game.autoLevel, effect: `+${formatResource(clickerProduction({ ...game, autoLevel: game.autoLevel + 1 }) - clickerProduction(game))} /s` },
    { kind: "multiplier" as const, level: game.multiplierLevel, effect: "×1.5" },
  ];
  return <section className="arcade-play-card idle-clicker">
    <div className="arcade-score-row"><span>{t("arcade.best")}: <strong>{formatResource(best ?? game.lifetime)}</strong></span><span>{t("arcade.phase3.perSecond")}: <strong>{formatResource(clickerProduction(game))}</strong></span><button className="button button--quiet" onClick={() => setResetting(true)} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button></div>
    <div className="idle-clicker__bank"><span>{t("arcade.phase3.resources")}</span><strong>{formatResource(game.resources)}</strong>{offlineGain > 0 && <small>{t("arcade.phase3.offlineGain", { amount: formatResource(offlineGain) })}</small>}</div>
    <button aria-label={t("arcade.phase3.collect")} className="idle-clicker__collect" disabled={!loaded || !saveSafe} onClick={collect} type="button"><span>+</span>{t("arcade.phase3.collect")}</button>
    <div className="idle-clicker__upgrades">{cards.map(({ kind, level, effect }) => {
      const price = clickerUpgradePrice(kind, level);
      const unlocked = kind !== "multiplier" || game.lifetime >= 100;
      return <article className={`idle-upgrade${unlocked ? "" : " is-locked"}`} key={kind}>
        <div><h3>{t(`arcade.phase3.upgrade.${kind}`)}</h3><p>{t("arcade.phase3.level", { level })} · {effect}</p></div>
        <button className="button button--quiet" disabled={!loaded || !saveSafe || game.resources < price || !unlocked} onClick={() => buy(kind)} type="button">{unlocked ? `${formatResource(price)} ${t("arcade.phase3.buy")}` : t("arcade.phase3.locked")}</button>
      </article>;
    })}</div>
    <div className="idle-clicker__achievements"><h3>{t("arcade.phase3.achievements")}</h3>{game.achievements.length ? game.achievements.map((id) => <span key={id}>{t(`arcade.phase3.achievement.${id}`)}</span>) : <p>{t("arcade.phase3.noAchievements")}</p>}</div>
    {resetting && <div className="idle-clicker__confirm" role="dialog" aria-modal="true" aria-label={t("arcade.phase3.resetConfirm")}><p>{t("arcade.phase3.resetConfirm")}</p><button className="button button--primary" onClick={reset} type="button">{t("arcade.restart")}</button><button className="button button--quiet" onClick={() => setResetting(false)} type="button">{t("arcade.cancel")}</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
