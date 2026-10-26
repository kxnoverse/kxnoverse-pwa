import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, Pause, Play, RotateCcw, Undo2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  chooseConnectColumn, connectColumns, connectRows, createConnectState, createFlappyState,
  createMaze, flappyGapHeight, mazePath, moveMaze, playConnectColumn, stepFlappy,
  type ConnectDifficulty, type ConnectState, type FlappyState, type MazeDifficulty, type MazeState,
} from "../data/phase5b-games";
import { playArcadeSound } from "../data/arcade-audio";

type Palette = { accent: string; soft: string; strong: string };
type Props = { best?: number; palette: Palette; onBest: (value: number) => void; onModeBest: (mode: string, value: number) => void };

async function saveLocal(id: string, value: unknown) {
  await db.arcadeData.put({ id, value: JSON.stringify(value), updatedAt: Date.now() });
}

function useGameError() {
  const [error, setError] = useState("");
  const { t } = useTranslation();
  const save = useCallback(async (id: string, value: unknown) => {
    try {
      await saveLocal(id, value);
      setError("");
    } catch {
      setError(t("arcade.phase5b.saveError"));
    }
  }, [t]);
  return { error, save };
}

function FlappyCube({ best, onBest, palette }: Pick<Props, "best" | "onBest" | "palette">) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<FlappyState>(createFlappyState());
  const flapRef = useRef(false);
  const savedScoreRef = useRef(0);
  const statusRef = useRef<"ready" | "playing" | "paused" | "over">("ready");
  const callbacksRef = useRef({ onBest, save: (_id: string, _value: unknown) => Promise.resolve() });
  const colorsRef = useRef({ accent: palette.accent, strong: palette.strong, surface: "#17191d", line: "#32363d" });
  const [status, setStatus] = useState<"ready" | "playing" | "paused" | "over">("ready");
  const [score, setScore] = useState(0);
  const { error, save } = useGameError();
  statusRef.current = status;
  callbacksRef.current = { onBest, save };
  colorsRef.current = { ...colorsRef.current, accent: palette.accent, strong: palette.strong };
  if (canvasRef.current) {
    const style = getComputedStyle(canvasRef.current);
    colorsRef.current = {
      ...colorsRef.current,
      surface: style.getPropertyValue("--surface-0").trim() || colorsRef.current.surface,
      line: style.getPropertyValue("--line").trim() || colorsRef.current.line,
    };
  }

  const changeStatus = useCallback((next: typeof status) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = createFlappyState();
    flapRef.current = false;
    savedScoreRef.current = 0;
    setScore(0);
    changeStatus("ready");
  }, [changeStatus]);

  const flap = useCallback(() => {
    if (statusRef.current === "paused" || statusRef.current === "over") return;
    if (statusRef.current === "ready") changeStatus("playing");
    flapRef.current = true;
  }, [changeStatus]);

  const togglePause = useCallback(() => {
    if (statusRef.current === "playing") changeStatus("paused");
    else if (statusRef.current === "paused") changeStatus("playing");
  }, [changeStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const style = getComputedStyle(canvas);
    colorsRef.current = {
      ...colorsRef.current,
      accent: palette.accent,
      strong: palette.strong,
      surface: style.getPropertyValue("--surface-0").trim() || colorsRef.current.surface,
      line: style.getPropertyValue("--line").trim() || colorsRef.current.line,
    };
  }, [palette.accent, palette.strong]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0;
    let previous: number | null = null;
    let accumulator = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(440 * ratio);
      const height = Math.round(520 * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    resize();
    const render = (time: number) => {
      if (statusRef.current === "playing" && !document.hidden) {
        if (previous !== null) accumulator = Math.min(0.1, accumulator + (time - previous) / 1000);
        previous = time;
        while (accumulator >= 1 / 60) {
          const doFlap = flapRef.current;
          flapRef.current = false;
          stateRef.current = stepFlappy(stateRef.current, 1 / 60, doFlap);
          accumulator -= 1 / 60;
          const next = stateRef.current;
          if (next.score !== savedScoreRef.current) {
            savedScoreRef.current = next.score;
            setScore(next.score);
            playArcadeSound("flappy-cube", "score");
          }
          if (next.gameOver) {
            changeStatus("over");
            playArcadeSound("flappy-cube", "gameOver");
            if (next.score > 0) callbacksRef.current.onBest(next.score);
            void callbacksRef.current.save("save:game:flappy-cube", { score: next.score, elapsed: next.elapsed, updatedAt: Date.now() });
            break;
          }
        }
      } else {
        previous = null;
        accumulator = 0;
      }

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, 440, 520);
      const game = stateRef.current;
      const colors = colorsRef.current;
      context.fillStyle = colors.surface;
      context.fillRect(0, 0, 440, 520);
      context.strokeStyle = colors.line;
      context.lineWidth = 1;
      const parallax = (game.elapsed * 18) % 44;
      for (let x = -parallax; x <= 440; x += 44) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 496);
        context.stroke();
      }
      for (let y = 0; y <= 496; y += 44) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(440, y);
        context.stroke();
      }
      context.fillStyle = colors.accent;
      context.fillRect(0, 496, 440, 24);
      context.fillStyle = colors.accent;
      game.obstacles.forEach(({ x, gapY }) => {
        const topHeight = gapY - flappyGapHeight / 2;
        const bottomY = gapY + flappyGapHeight / 2;
        context.globalAlpha = 0.76;
        context.fillRect(x, 0, 58, topHeight);
        context.fillRect(x, bottomY, 58, 496 - bottomY);
        context.globalAlpha = 1;
        context.fillStyle = colors.strong;
        context.fillRect(x - 4, topHeight - 10, 66, 10);
        context.fillRect(x - 4, bottomY, 66, 10);
        context.fillStyle = colors.accent;
        context.fillRect(x + 7, 0, 3, topHeight - 10);
        context.fillRect(x + 7, bottomY + 10, 3, 486 - bottomY);
      });
      const tilt = Math.max(-0.42, Math.min(0.42, game.velocityY / 900));
      context.save();
      context.translate(92, game.birdY);
      context.rotate(tilt);
      context.fillStyle = colors.strong;
      context.beginPath();
      context.roundRect(-13, -13, 26, 26, 5);
      context.fill();
      context.fillStyle = colors.surface;
      context.fillRect(4, -5, 3, 3);
      context.restore();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [changeStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) { event.preventDefault(); flap(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flap]);

  return (
    <section className="phase5b-game" aria-label={t("arcade.games.flappy-cube.board")}>
      <div className="phase5-toolbar phase5b-flappy__toolbar">
        <span>{t("arcade.score")} <strong>{score}</strong></span>
        <span>{t("arcade.best")}: <strong>{best ?? 0}</strong></span>
        <button className="button button--quiet" disabled={status === "ready" || status === "over"} onClick={togglePause} type="button">
          {status === "paused" ? <Play size={13} /> : <Pause size={13} />}{t(status === "paused" ? "arcade.phase5b.resume" : "arcade.phase5b.pause")}
        </button>
        <button className="button button--quiet" onClick={reset} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
      </div>
      <div className={`phase5b-flappy__stage is-${status}`}>
        <canvas className="phase5b-flappy__canvas" ref={canvasRef} onPointerDown={flap} aria-label={t("arcade.games.flappy-cube.board")} />
        {status !== "playing" && (
          <div className="phase5b-flappy__overlay">
            <span>{status === "ready" ? t("arcade.phase5b.flappyStart") : status === "paused" ? t("arcade.phase5b.paused") : t("arcade.phase5b.flappyOver", { score })}</span>
            {(status === "ready" || status === "over") && (
              <button className="button button--primary" onClick={status === "over" ? reset : flap} type="button">
                {status === "ready" ? <Play size={14} /> : <RotateCcw size={14} />}
                {status === "ready" ? t("arcade.phase5b.start") : t("arcade.restart")}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="arcade-game-hint">{t("arcade.games.flappy-cube.hint")}</p>
      <p className="arcade-game-status" role="status">{t(status === "over" ? "arcade.phase5b.flappyOver" : status === "paused" ? "arcade.phase5b.paused" : status === "playing" ? "arcade.phase5b.flappyPlaying" : "arcade.phase5b.flappyStart", { score })}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

type ConnectMode = "computer" | "local";
const connectSaveKey = "save:game:connect-four";

function validConnectState(value: unknown): value is ConnectState {
  if (!value || typeof value !== "object") return false;
  const state = value as ConnectState;
  return Array.isArray(state.board) && state.board.length === 42 && state.board.every((cell) => cell === 0 || cell === 1 || cell === 2) &&
    (state.turn === 1 || state.turn === 2) && ["playing", "redWon", "yellowWon", "draw"].includes(state.status) &&
    Array.isArray(state.winningCells) && (state.lastMove === null || Number.isInteger(state.lastMove));
}

function ConnectFour({ onBest }: Pick<Props, "onBest">) {
  const { t } = useTranslation();
  const { error, save } = useGameError();
  const saved = useLiveQuery(() => db.arcadeData.get(connectSaveKey), [], null);
  const [state, setState] = useState(createConnectState);
  const [history, setHistory] = useState<ConnectState[]>([]);
  const [mode, setMode] = useState<ConnectMode>("computer");
  const [difficulty, setDifficulty] = useState<ConnectDifficulty>("normal");
  const [hovered, setHovered] = useState<number | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0 });
  const restored = useRef(false);
  const previousStatus = useRef(state.status);

  useEffect(() => {
    if (saved === null || restored.current) return;
    try {
      const parsed: unknown = saved ? JSON.parse(saved.value) : null;
      if (parsed && typeof parsed === "object") {
        const payload = parsed as { state?: unknown; mode?: unknown; difficulty?: unknown; stats?: unknown };
        if (validConnectState(payload.state)) setState(payload.state);
        if (payload.mode === "computer" || payload.mode === "local") setMode(payload.mode);
        if (payload.difficulty === "easy" || payload.difficulty === "normal" || payload.difficulty === "hard") setDifficulty(payload.difficulty);
        if (payload.stats && typeof payload.stats === "object") setStats(payload.stats as typeof stats);
      }
    } catch { /* Invalid saves are left intact until the user makes a new move. */ }
    restored.current = true;
  }, [saved]);

  useEffect(() => {
    if (!restored.current) return;
    void save(connectSaveKey, { state, mode, difficulty, stats });
  }, [difficulty, mode, save, state, stats]);

  useEffect(() => {
    const oldStatus = previousStatus.current;
    previousStatus.current = state.status;
    if (oldStatus !== "playing" || state.status === "playing") return;
    const next = state.status === "draw" ? { ...stats, draws: stats.draws + 1 }
      : state.status === "redWon" ? { ...stats, wins: stats.wins + 1 } : { ...stats, losses: stats.losses + 1 };
    setStats(next);
    if (state.status === "redWon") onBest(next.wins);
  }, [onBest, state.status, stats]);

  useEffect(() => {
    if (mode !== "computer" || state.status !== "playing" || state.turn !== 2) return;
    const timer = window.setTimeout(() => {
      const column = chooseConnectColumn(state, difficulty);
      if (column === null) return;
      setHistory((items) => [...items.slice(-20), state]);
      setState((current) => playConnectColumn(current, column));
      playArcadeSound("connect-four", "click");
    }, 140);
    return () => window.clearTimeout(timer);
  }, [difficulty, mode, state]);

  function play(column: number) {
    if (state.status !== "playing" || mode === "computer" && state.turn === 2) return;
    const next = playConnectColumn(state, column);
    if (next === state) return;
    setHistory((items) => [...items.slice(-20), state]);
    setState(next);
    playArcadeSound("connect-four", next.status === "playing" ? "click" : "win");
  }

  function undo() {
    if (!history.length) return;
    const remove = mode === "computer" && history.length > 1 ? 2 : 1;
    setState(history[history.length - remove]);
    setHistory((items) => items.slice(0, -remove));
  }

  function restart() {
    setState(createConnectState());
    setHistory([]);
  }

  return (
    <section className="phase5b-game">
      <div className="phase5-toolbar">
        <label>{t("arcade.phase5b.mode")}<select aria-label={t("arcade.phase5b.mode")} value={mode} onChange={(event) => { setMode(event.target.value as ConnectMode); restart(); }}><option value="computer">{t("arcade.phase5b.computer")}</option><option value="local">{t("arcade.phase5b.local")}</option></select></label>
        {mode === "computer" && <label>{t("arcade.phase5b.difficulty")}<select aria-label={t("arcade.phase5b.difficulty")} value={difficulty} onChange={(event) => setDifficulty(event.target.value as ConnectDifficulty)}><option value="easy">{t("arcade.easy")}</option><option value="normal">{t("arcade.normal")}</option><option value="hard">{t("arcade.hard")}</option></select></label>}
        <button className="button button--quiet" disabled={!history.length} onClick={undo} type="button"><Undo2 size={13} />{t("arcade.undo")}</button>
        <button className="button button--quiet" onClick={restart} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
      </div>
      <div className="phase5b-connect__players" aria-label={t("arcade.phase5b.score")}>
        <div className={`phase5b-connect__player is-red${state.status === "playing" && state.turn === 1 ? " is-active" : ""}`}>
          <i aria-hidden="true" /><span>{t("arcade.phase5b.red")}</span><strong>{stats.wins}</strong>
          <small>{mode === "computer" ? t("arcade.phase5b.you") : t("arcade.phase5b.playerOne")}</small>
        </div>
        <div className={`phase5b-connect__player is-yellow${state.status === "playing" && state.turn === 2 ? " is-active" : ""}`}>
          <i aria-hidden="true" /><span>{mode === "computer" ? t("arcade.phase5b.computer") : t("arcade.phase5b.yellow")}</span><strong>{stats.losses}</strong>
          <small>{state.status === "playing" && state.turn === 2 && mode === "computer" ? t("arcade.phase5b.computerTurn") : t("arcade.phase5b.matches")}</small>
        </div>
        <span className="phase5b-connect__draws">{t("arcade.phase5b.draws")}: <strong>{stats.draws}</strong></span>
      </div>
      <div className="phase5b-connect__frame">
        <div className="phase5b-connect__board" role="grid" aria-label={t("arcade.games.connect-four.board")} onMouseLeave={() => setHovered(null)}>
          {Array.from({ length: connectColumns }, (_, column) => (
            <div className="phase5b-connect__column" key={column} role="row" onMouseEnter={() => setHovered(column)}>
              <button className={`phase5b-connect__drop${hovered === column && state.status === "playing" ? " is-hovered" : ""}`} aria-label={t("arcade.phase5b.dropColumn", { column: column + 1 })} disabled={state.status !== "playing" || mode === "computer" && state.turn === 2} onFocus={() => setHovered(column)} onClick={() => play(column)} type="button">
                {hovered === column && <i className={state.turn === 1 ? "is-red" : "is-yellow"} />}
              </button>
              {Array.from({ length: connectRows }, (_, row) => {
                const index = row * connectColumns + column;
                const player = state.board[index];
                return <div
                  className={`phase5b-connect__cell${player ? ` is-player-${player}` : ""}${state.winningCells.includes(index) ? " is-winning" : ""}${state.lastMove === index ? " is-last" : ""}`}
                  key={index}
                  role="gridcell"
                  aria-label={player ? t(player === 1 ? "arcade.phase5b.redPiece" : "arcade.phase5b.yellowPiece", { row: row + 1, column: column + 1 }) : t("arcade.phase5b.emptyCell", { row: row + 1, column: column + 1 })}
                  style={{ "--drop-distance": `${(connectRows - row) * -100}%` } as React.CSSProperties}
                />;
              })}
            </div>
          ))}
        </div>
        {state.status !== "playing" && (
          <div className="phase5b-connect__result">
            <span>{t(`arcade.phase5b.${state.status}`)}</span>
            <button className="button button--primary" onClick={restart} type="button"><RotateCcw size={13} />{t("arcade.restart")}</button>
          </div>
        )}
      </div>
      <p className="arcade-game-status" role="status">
        {state.status === "playing" ? t(state.turn === 1 ? "arcade.phase5b.redTurn" : mode === "computer" ? "arcade.phase5b.computerTurn" : "arcade.phase5b.yellowTurn")
          : t(`arcade.phase5b.${state.status}`)}
      </p>
      <p className="arcade-game-hint">{t("arcade.games.connect-four.hint")}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

const mazeKey = "save:game:maze-escape";
const wallBits = { up: 1, right: 2, down: 4, left: 8 } as const;

function validMaze(value: unknown): value is MazeState {
  if (!value || typeof value !== "object") return false;
  const maze = value as MazeState;
  return Number.isInteger(maze.rows) && Number.isInteger(maze.columns) && maze.rows > 0 && maze.columns > 0 &&
    Array.isArray(maze.walls) && maze.walls.length === maze.rows * maze.columns && maze.walls.every((wall) => Number.isInteger(wall) && wall >= 0 && wall <= 15) &&
    Number.isInteger(maze.player) && maze.player >= 0 && maze.player < maze.walls.length && Number.isInteger(maze.finish) &&
    maze.finish >= 0 && maze.finish < maze.walls.length && Number.isInteger(maze.moves) && typeof maze.complete === "boolean";
}

function MazeEscape({ onModeBest }: Pick<Props, "onModeBest">) {
  const { t } = useTranslation();
  const { error, save } = useGameError();
  const saved = useLiveQuery(() => db.arcadeData.get(mazeKey), [], null);
  const [difficulty, setDifficulty] = useState<MazeDifficulty>("normal");
  const [maze, setMaze] = useState(() => createMaze("normal"));
  const [boardRevision, setBoardRevision] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const restored = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (saved === null || restored.current) return;
    try {
      const parsed: unknown = saved ? JSON.parse(saved.value) : null;
      if (parsed && typeof parsed === "object") {
        const payload = parsed as { maze?: unknown; difficulty?: unknown; elapsed?: unknown };
        if (validMaze(payload.maze)) {
          setMaze(payload.maze);
          if (payload.maze.moves > 0 && !payload.maze.complete && typeof payload.elapsed === "number") {
            setStartedAt(Date.now() - payload.elapsed * 1000);
          }
        }
        if (payload.difficulty === "easy" || payload.difficulty === "normal" || payload.difficulty === "hard") setDifficulty(payload.difficulty);
        if (typeof payload.elapsed === "number" && Number.isFinite(payload.elapsed)) setElapsed(payload.elapsed);
      }
    } catch { /* Invalid saves remain available for manual recovery. */ }
    restored.current = true;
  }, [saved]);

  useEffect(() => {
    if (!restored.current) return;
    void save(mazeKey, { maze, difficulty, elapsed });
  }, [difficulty, elapsed, maze, save]);

  useEffect(() => {
    if (!startedAt || maze.complete || paused) return;
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [maze.complete, paused, startedAt]);

  useEffect(() => {
    if (maze.complete && !completedRef.current) {
      completedRef.current = true;
      const duration = Math.max(1, elapsed);
      onModeBest(difficulty, duration);
      playArcadeSound("maze-escape", "win");
    }
  }, [difficulty, elapsed, maze.complete, onModeBest]);

  const move = useCallback((direction: "up" | "right" | "down" | "left") => {
    if (paused || maze.complete) return;
    const next = moveMaze(maze, direction);
    if (next === maze) return;
    if (!startedAt) setStartedAt(Date.now() - elapsed * 1000);
    setMaze(next);
  }, [elapsed, maze, paused, startedAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = event.key === "ArrowUp" || event.key.toLowerCase() === "w" ? "up"
        : event.key === "ArrowRight" || event.key.toLowerCase() === "d" ? "right"
          : event.key === "ArrowDown" || event.key.toLowerCase() === "s" ? "down"
            : event.key === "ArrowLeft" || event.key.toLowerCase() === "a" ? "left" : null;
      if (!direction || event.repeat || (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  function newMaze(nextDifficulty = difficulty) {
    setDifficulty(nextDifficulty);
    setMaze(createMaze(nextDifficulty));
    setBoardRevision((revision) => revision + 1);
    setElapsed(0);
    setStartedAt(null);
    setPaused(false);
    completedRef.current = false;
    setHint(false);
  }

  const path = hint ? mazePath(maze) : [];
  return (
    <section className="phase5b-game">
      <div className="phase5-toolbar phase5b-maze__toolbar">
        <label>{t("arcade.phase5b.difficulty")}<select aria-label={t("arcade.phase5b.difficulty")} value={difficulty} onChange={(event) => newMaze(event.target.value as MazeDifficulty)}><option value="easy">{t("arcade.easy")}</option><option value="normal">{t("arcade.normal")}</option><option value="hard">{t("arcade.hard")}</option></select></label>
        <span className="phase5b-maze__metric"><span>{t("arcade.time")}</span><strong>{elapsed}s</strong></span><span className="phase5b-maze__metric"><span>{t("arcade.moves")}</span><strong>{maze.moves}</strong></span>
        <button className="button button--quiet" aria-pressed={hint} onClick={() => setHint((value) => !value)} type="button"><Lightbulb size={13} />{t("arcade.phase5b.hint")}</button>
        <button className="button button--quiet" disabled={maze.complete} onClick={() => {
          if (paused) { setStartedAt(Date.now() - elapsed * 1000); setPaused(false); }
          else { if (startedAt) setElapsed(Math.floor((Date.now() - startedAt) / 1000)); setStartedAt(null); setPaused(true); }
        }} type="button">{paused ? <Play size={13} /> : <Pause size={13} />}{t(paused ? "arcade.phase5b.resume" : "arcade.phase5b.pause")}</button>
        <button className="button button--quiet" onClick={() => newMaze()} type="button"><RotateCcw size={13} />{t("arcade.phase5b.newMaze")}</button>
      </div>
      {paused && <p className="arcade-game-status" role="status">{t("arcade.phase5b.paused")}</p>}
      <div className="phase5b-maze__frame">
        <div className="phase5b-maze" key={boardRevision} role="grid" aria-label={t("arcade.games.maze-escape.board")} style={{ "--maze-columns": maze.columns } as React.CSSProperties}>
        {maze.walls.map((walls, index) => <div
          className={`phase5b-maze__cell${index === 0 ? " is-start" : ""}${index === maze.player ? " is-player" : ""}${index === maze.finish ? " is-finish" : ""}${path.includes(index) ? " is-hint" : ""}`}
          key={index}
          role="gridcell"
          aria-label={index === maze.player ? t("arcade.phase5b.playerPosition") : index === maze.finish ? t("arcade.phase5b.finish") : undefined}
          style={{ borderTop: walls & wallBits.up ? undefined : "0", borderRight: walls & wallBits.right ? undefined : "0", borderBottom: walls & wallBits.down ? undefined : "0", borderLeft: walls & wallBits.left ? undefined : "0" }}
        />)}
        </div>
        <div className="phase5b-maze__legend"><span><i className="is-start" />{t("arcade.phase5b.start")}</span><span><i className="is-finish" />{t("arcade.phase5b.finish")}</span></div>
      </div>
      <div className="phase5b-maze__touch" aria-label={t("arcade.phase5b.touchControls")}>
        <button aria-label={t("arcade.phase5b.moveUp")} onClick={() => move("up")} type="button">↑</button>
        <span><button aria-label={t("arcade.phase5b.moveLeft")} onClick={() => move("left")} type="button">←</button><button aria-label={t("arcade.phase5b.moveDown")} onClick={() => move("down")} type="button">↓</button><button aria-label={t("arcade.phase5b.moveRight")} onClick={() => move("right")} type="button">→</button></span>
      </div>
      <p className="arcade-game-hint">{t("arcade.games.maze-escape.hint")}</p>
      {maze.complete && <p className="arcade-game-status" role="status">{t("arcade.phase5b.mazeComplete", { time: elapsed, moves: maze.moves })}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

export function Phase5BGameScreen({ gameId, ...props }: Props & { gameId: "flappy-cube" | "connect-four" | "maze-escape" }) {
  const style = {
    "--game-accent": props.palette.accent,
    "--game-accent-soft": props.palette.soft,
    "--game-accent-strong": props.palette.strong,
  } as React.CSSProperties;
  return <div className="arcade-game-area phase5-game-area" style={style}>
    {gameId === "flappy-cube" && <FlappyCube best={props.best} onBest={props.onBest} palette={props.palette} />}
    {gameId === "connect-four" && <ConnectFour onBest={props.onBest} />}
    {gameId === "maze-escape" && <MazeEscape onModeBest={props.onModeBest} />}
  </div>;
}
