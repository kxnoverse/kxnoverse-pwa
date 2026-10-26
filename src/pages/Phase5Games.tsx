import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { db, type ArcadeRecord } from "../data/db";
import { playArcadeSound } from "../data/arcade-audio";
import {
  blockBoardHeight, blockBoardWidth, blockCells, canPlaceBlock, chordMinesweeperCell,
  createBlockStack, createMinesweeperState, createPongState, createSudokuPuzzle, dropBlock,
  holdBlock, moveBlock, revealMinesweeperCell,
  isValidSudokuBoard, rotateBlock, stepPong, tickBlockStack, toggleMinesweeperFlag,
  type BlockStackState, type MineDifficulty, type MinesweeperState, type PongDifficulty,
  type PongInput, type PongState, type SudokuDifficulty, type SudokuPuzzle,
} from "../data/phase5-games";
import type { GameDefinition } from "../data/arcade";

type Palette = { accent: string; soft: string; strong: string };
type Props = {
  game: GameDefinition;
  best?: number;
  language: "en" | "de";
  palette: Palette;
  onBest: (value: number) => void;
  onModeBest: (mode: string, value: number) => void;
};

const blockSaveKey = "save:game:block-stack";
const minesDifficultyKey = "preference:minesweeper:difficulty";
const sudokuSaveKey = "save:game:sudoku";
const sudokuDifficultyKey = "preference:sudoku:difficulty";
const sudokuMistakeKey = "preference:sudoku:highlight-mistakes";

function readStoredJson<T>(record: ArcadeRecord | undefined, validate: (value: unknown) => value is T): T | null {
  if (!record) return null;
  try {
    const parsed: unknown = JSON.parse(record.value);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isBlockSave(value: unknown): value is BlockStackState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<BlockStackState>;
  const validPiece = (piece: unknown) => {
    if (!piece || typeof piece !== "object") return false;
    const candidate = piece as BlockStackState["piece"];
    return Number.isInteger(candidate.type) && candidate.type >= 0 && candidate.type <= 6 &&
      Number.isInteger(candidate.rotation) && candidate.rotation >= 0 && candidate.rotation <= 3 &&
      Number.isInteger(candidate.x) && Number.isInteger(candidate.y);
  };
  return Array.isArray(state.board) && state.board.length === blockBoardWidth * blockBoardHeight &&
    state.board.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 7) &&
    validPiece(state.piece) && Array.isArray(state.next) && state.next.every((piece) => Number.isInteger(piece) && piece >= 0 && piece <= 6) &&
    Array.isArray(state.bag) && state.bag.every((piece) => Number.isInteger(piece) && piece >= 0 && piece <= 6) &&
    (state.held === null || typeof state.held === "number" && Number.isInteger(state.held) && state.held >= 0 && state.held <= 6) &&
    typeof state.canHold === "boolean" && Number.isFinite(state.score) && Number.isFinite(state.lines) &&
    Number.isFinite(state.level) && typeof state.gameOver === "boolean";
}

function BlockStackGame({ best, onBest }: Pick<Props, "best" | "onBest">) {
  const { t } = useTranslation();
  const [game, setGame] = useState(() => createBlockStack());
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveAllowed, setSaveAllowed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    db.arcadeData.get(blockSaveKey).then((record) => {
      if (!active) return;
      if (record) {
        const saved = readStoredJson(record, isBlockSave);
        if (saved && (saved.gameOver || canPlaceBlock(saved.board, saved.piece))) {
          setGame(saved);
          setSaveAllowed(true);
        } else setError(t("arcade.phase5.blockStack.saveError"));
      } else setSaveAllowed(true);
      setLoaded(true);
    }).catch(() => {
      if (active) {
        setError(t("arcade.phase5.blockStack.saveError"));
        setLoaded(true);
      }
    });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!loaded || !saveAllowed) return;
    const timeout = window.setTimeout(() => {
      db.arcadeData.put({ id: blockSaveKey, value: JSON.stringify(game), updatedAt: Date.now() })
        .then(() => setError(""))
        .catch(() => setError(t("arcade.phase5.blockStack.saveError")));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [game, loaded, saveAllowed, t]);

  useEffect(() => {
    if (game.score > (best ?? 0)) onBest(game.score);
  }, [best, game.score, onBest]);

  useEffect(() => {
    if (paused || game.gameOver || !loaded) return;
    const interval = window.setInterval(() => setGame((current) => tickBlockStack(current)), Math.max(110, 780 - (game.level - 1) * 55));
    return () => window.clearInterval(interval);
  }, [game.gameOver, game.level, loaded, paused]);

  const update = useCallback((action: (current: BlockStackState) => BlockStackState) => {
    setGame((current) => {
      const next = action(current);
      if (next !== current) playArcadeSound("block-stack", next.gameOver ? "gameOver" : "score");
      return next;
    });
  }, []);
  const restart = () => {
    setSaveAllowed(true);
    setGame(createBlockStack());
    setPaused(false);
    setError("");
    playArcadeSound("block-stack", "start");
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement | null)?.tagName ?? "")) return;
      if (event.key === "Escape" || event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPaused((value) => !value);
        return;
      }
      if (paused || game.gameOver || !loaded) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") { event.preventDefault(); update((state) => moveBlock(state, -1)); }
      else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") { event.preventDefault(); update((state) => moveBlock(state, 1)); }
      else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        event.preventDefault();
        update((state) => {
          const moved = moveBlock(state, 0, 1);
          return moved === state ? state : { ...moved, score: moved.score + 1 };
        });
      } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "x") { event.preventDefault(); update((state) => rotateBlock(state, 1)); }
      else if (event.key.toLowerCase() === "z") { event.preventDefault(); update((state) => rotateBlock(state, -1)); }
      else if (event.code === "Space") { event.preventDefault(); update((state) => dropBlock(state)); }
      else if (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "shift") { event.preventDefault(); update((state) => holdBlock(state)); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.gameOver, loaded, paused, update]);

  const ghost = { ...game.piece };
  while (canPlaceBlock(game.board, { ...ghost, y: ghost.y + 1 })) ghost.y += 1;
  const occupied = new Map<number, { type: number; ghost?: boolean }>();
  game.board.forEach((value, index) => { if (value) occupied.set(index, { type: value - 1 }); });
  blockCells(ghost).forEach(({ x, y, value }) => { if (!game.gameOver && !occupied.has(y * blockBoardWidth + x)) occupied.set(y * blockBoardWidth + x, { type: value - 1, ghost: true }); });
  blockCells(game.piece).forEach(({ x, y, value }) => { if (y >= 0) occupied.set(y * blockBoardWidth + x, { type: value - 1 }); });
  const preview = (type: number | null) => type === null ? [] : blockCells({ type: type as 0 | 1 | 2 | 3 | 4 | 5 | 6, rotation: 0, x: 0, y: 0 });

  return (
    <section className="arcade-play-card phase5-block" aria-label={t("arcade.games.block-stack.board")}>
      <div className="arcade-score-row phase5-toolbar">
        <span>{t("arcade.phase5.blockStack.score")} <strong>{game.score}</strong></span>
        <span>{t("arcade.phase5.blockStack.lines")} <strong>{game.lines}</strong></span>
        <span>{t("arcade.phase5.blockStack.level")} <strong>{game.level}</strong></span>
        <button className="button button--quiet" onClick={() => setPaused((value) => !value)} type="button">{paused ? t("arcade.resume") : t("arcade.pause")}</button>
        <button className="button button--quiet" onClick={restart} type="button">{t("arcade.restart")}</button>
      </div>
      <div className="phase5-block__layout">
        <div className="phase5-block__side"><span>{t("arcade.phase5.blockStack.hold")}</span><div className="phase5-block__preview" aria-label={t("arcade.phase5.blockStack.held")}>{preview(game.held).map((cell, index) => <i key={index} style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }} data-piece={cell.value - 1} />)}</div><button className="button button--quiet" disabled={!game.canHold || game.gameOver || paused} onClick={() => update((state) => holdBlock(state))} type="button">C</button></div>
        <div className="phase5-block__board-wrap">
          <div className="phase5-block__board" role="grid" aria-label={t("arcade.games.block-stack.board")}>
            {game.board.map((_, index) => {
              const cell = occupied.get(index);
              return <span aria-label={cell ? t("arcade.phase5.blockStack.filled") : t("arcade.phase5.blockStack.empty")} className={cell ? `phase5-block__cell is-filled${cell.ghost ? " is-ghost" : ""}` : "phase5-block__cell"} data-piece={cell?.type} key={index} role="gridcell" />;
            })}
          </div>
          {(paused || game.gameOver || !loaded) && <div className="phase5-overlay" role="status">{!loaded ? t("arcade.loading") : paused ? t("arcade.pause") : <>{t("arcade.gameOver")}<br />{t("arcade.phase5.blockStack.over")}<button className="button button--primary" onClick={restart} type="button">{t("arcade.restart")}</button></>}</div>}
        </div>
        <div className="phase5-block__side"><span>{t("arcade.phase5.blockStack.next")}</span>{game.next.slice(0, 3).map((type, index) => <div className="phase5-block__preview" key={`${type}-${index}`}>{preview(type).map((cell, cellIndex) => <i key={cellIndex} style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }} data-piece={cell.value - 1} />)}</div>)}</div>
      </div>
      <div className="phase5-touch-controls" aria-label={t("arcade.games.block-stack.hint")}>
        <button aria-label={t("arcade.phase5.blockStack.rotateBack")} disabled={paused || game.gameOver} onClick={() => update((state) => rotateBlock(state, -1))} type="button">↺</button>
        <button aria-label={t("arcade.phase5.blockStack.rotate")} disabled={paused || game.gameOver} onClick={() => update((state) => rotateBlock(state))} type="button">↻</button>
        <button aria-label={t("arcade.phase5.blockStack.moveLeft")} disabled={paused || game.gameOver} onClick={() => update((state) => moveBlock(state, -1))} type="button">←</button>
        <button aria-label={t("arcade.phase5.blockStack.softDrop")} disabled={paused || game.gameOver} onClick={() => update((state) => moveBlock(state, 0, 1))} type="button">↓</button>
        <button aria-label={t("arcade.phase5.blockStack.moveRight")} disabled={paused || game.gameOver} onClick={() => update((state) => moveBlock(state, 1))} type="button">→</button>
        <button aria-label={t("arcade.phase5.blockStack.hardDrop")} disabled={paused || game.gameOver} onClick={() => update((state) => dropBlock(state))} type="button">⇊</button>
      </div>
      <p className="arcade-game-hint">{t("arcade.games.block-stack.hint")}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

type MineStats = Record<string, { wins: number; losses: number }>;
function isMineStats(value: unknown): value is MineStats {
  return Boolean(value && typeof value === "object" && Object.values(value).every((item) =>
    Boolean(item && typeof item === "object" && Number.isInteger(item.wins) && item.wins >= 0 &&
      Number.isInteger(item.losses) && item.losses >= 0)));
}

async function updateStats(key: string, mode: string, won: boolean): Promise<MineStats> {
  return db.transaction("rw", db.arcadeData, async () => {
    const record = await db.arcadeData.get(key);
    let stats: MineStats = {};
    if (record) {
      try {
        const parsed: unknown = JSON.parse(record.value);
        if (!isMineStats(parsed)) throw new Error("Invalid saved game statistics.");
        stats = parsed;
      } catch (error) {
        throw new Error("Unable to update saved game statistics.", { cause: error });
      }
    }
    const previous = stats[mode] ?? { wins: 0, losses: 0 };
    const next = { ...stats, [mode]: { wins: previous.wins + Number(won), losses: previous.losses + Number(!won) } };
    await db.arcadeData.put({ id: key, value: JSON.stringify(next), updatedAt: Date.now() });
    return next;
  });
}

function MinesweeperGame({ onBest, onModeBest }: Pick<Props, "onBest" | "onModeBest">) {
  const { t } = useTranslation();
  const [difficulty, setDifficulty] = useState<MineDifficulty>("easy");
  const [game, setGame] = useState(() => createMinesweeperState("easy"));
  const [flagMode, setFlagMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const finishedRef = useRef(false);

  useEffect(() => {
    let active = true;
    db.arcadeData.get(minesDifficultyKey).then((record) => {
      if (!active) return;
      const saved = record?.value;
      const selected = saved === "easy" || saved === "normal" || saved === "hard" ? saved : "easy";
      setDifficulty(selected);
      setGame(createMinesweeperState(selected));
      setReady(true);
    }).catch(() => {
      if (active) {
        setError(t("arcade.phase5.minesweeper.storageError"));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!game.started || game.gameOver || paused) return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [game.gameOver, game.started, paused]);

  const finish = useCallback((next: MinesweeperState) => {
    if (!next.gameOver || finishedRef.current) return;
    finishedRef.current = true;
    if (next.won) {
      setStatus(t("arcade.phase5.minesweeper.won", { time: elapsed }));
      onBest(elapsed);
      onModeBest(difficulty, elapsed);
      playArcadeSound("minesweeper", "win");
    } else {
      setStatus(t("arcade.phase5.minesweeper.lost"));
      playArcadeSound("minesweeper", "gameOver");
    }
    updateStats("stats:minesweeper", difficulty, next.won)
      .then(() => setError(""))
      .catch(() => setError(t("arcade.phase5.minesweeper.storageError")));
  }, [difficulty, elapsed, onBest, onModeBest, t]);

  function restart(nextDifficulty = difficulty) {
    setGame(createMinesweeperState(nextDifficulty));
    setElapsed(0);
    setPaused(false);
    setFlagMode(false);
    setStatus("");
    setError("");
    finishedRef.current = false;
    playArcadeSound("minesweeper", "start");
  }

  async function changeDifficulty(value: MineDifficulty) {
    setDifficulty(value);
    restart(value);
    try {
      await db.arcadeData.put({ id: minesDifficultyKey, value, updatedAt: Date.now() });
    } catch {
      setError(t("arcade.phase5.minesweeper.storageError"));
    }
  }

  function operate(index: number, forceFlag = flagMode) {
    if (!ready || paused || game.gameOver) return;
    let next: MinesweeperState;
    if (forceFlag) next = toggleMinesweeperFlag(game, index);
    else if (game.cells[index]?.revealed) next = chordMinesweeperCell(game, index);
    else next = revealMinesweeperCell(game, index);
    setGame(next);
    if (next !== game && !forceFlag) playArcadeSound("minesweeper", next.cells[index]?.mine ? "failure" : "score");
    finish(next);
  }

  const flags = game.cells.filter((cell) => cell.flagged).length;
  const flagAction = (index: number) => {
    if (!ready || paused || game.gameOver || game.cells[index]?.revealed) return;
    setGame((current) => toggleMinesweeperFlag(current, index));
    playArcadeSound("minesweeper", "click");
  };

  return (
    <section className="arcade-play-card phase5-mines" aria-label={t("arcade.games.minesweeper.board")}>
      <div className="arcade-score-row phase5-toolbar">
        <label>{t("arcade.phase5.minesweeper.difficulty")}<select aria-label={t("arcade.phase5.minesweeper.difficulty")} onChange={(event) => void changeDifficulty(event.target.value as MineDifficulty)} value={difficulty}>{(["easy", "normal", "hard"] as const).map((value) => <option key={value} value={value}>{t(`arcade.phase5.minesweeper.${value}`)}</option>)}</select></label>
        <span>{t("arcade.phase5.minesweeper.mines")} <strong>{game.mineCount - flags}</strong></span>
        <span>{t("arcade.phase5.minesweeper.time")} <strong>{elapsed}</strong></span>
        <button aria-pressed={flagMode} className={`button ${flagMode ? "button--primary" : "button--quiet"}`} onClick={() => setFlagMode((value) => !value)} type="button">{flagMode ? t("arcade.phase5.minesweeper.enabled") : t("arcade.phase5.minesweeper.flags")}</button>
        <button className="button button--quiet" onClick={() => setPaused((value) => !value)} type="button">{paused ? t("arcade.resume") : t("arcade.pause")}</button>
        <button className="button button--quiet" onClick={() => restart()} type="button">{t("arcade.restart")}</button>
      </div>
      <div className="phase5-mines__scroll">
        <div className={`phase5-mines__board${paused || !ready ? " is-hidden" : ""}`} role="grid" aria-label={t("arcade.games.minesweeper.board")} style={{ "--mine-columns": game.columns } as React.CSSProperties}>
          {game.cells.map((cell, index) => {
            const row = Math.floor(index / game.columns) + 1;
            const column = index % game.columns + 1;
            const label = t("arcade.phase5.minesweeper.cell", { row, column });
            return <button
              aria-label={`${label}, ${cell.flagged ? t("arcade.phase5.minesweeper.flagged") : cell.revealed ? cell.mine ? t("arcade.phase5.minesweeper.mine") : `${t("arcade.phase5.minesweeper.revealed")} ${cell.adjacent || ""}` : t("arcade.phase5.minesweeper.hidden")}`}
              aria-selected={cell.flagged}
              className={`phase5-mines__cell${cell.revealed ? " is-open" : ""}${cell.mine && cell.revealed ? " is-mine" : ""}`}
              data-number={cell.adjacent || 0}
              key={index}
              onClick={() => operate(index)}
              onContextMenu={(event) => { event.preventDefault(); flagAction(index); }}
              onKeyDown={(event) => {
                if (event.key.toLowerCase() === "f") { event.preventDefault(); flagAction(index); }
                if (event.key.startsWith("Arrow")) {
                  event.preventDefault();
                  const column = index % game.columns;
                  const target = event.key === "ArrowLeft" ? column > 0 ? index - 1 : -1
                    : event.key === "ArrowRight" ? column < game.columns - 1 ? index + 1 : -1
                      : event.key === "ArrowUp" ? index - game.columns : index + game.columns;
                  if (target >= 0 && target < game.cells.length) (event.currentTarget.parentElement?.children[target] as HTMLButtonElement | undefined)?.focus();
                }
              }}
              type="button"
            >
              {cell.flagged ? <span aria-hidden="true">⚑</span> : cell.revealed ? cell.mine ? <span aria-hidden="true">●</span> : cell.adjacent || "" : ""}
            </button>;
          })}
        </div>
        {(paused || !ready) && <div className="phase5-mines__cover" role="status">{!ready ? t("arcade.loading") : t("arcade.phase5.minesweeper.paused")}</div>}
      </div>
      <p className="arcade-game-hint">{t("arcade.games.minesweeper.hint")}</p>
      {status && <p className="arcade-game-status" role="status">{status}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

type PongMode = "computer" | "local";
type PongStats = Record<PongMode, { wins: number; losses: number }>;
const emptyPongStats: PongStats = { computer: { wins: 0, losses: 0 }, local: { wins: 0, losses: 0 } };

function isPongStats(value: unknown): value is PongStats {
  if (!value || typeof value !== "object") return false;
  return (["computer", "local"] as const).every((mode) => {
    const stats = (value as Partial<PongStats>)[mode];
    return Boolean(stats && Number.isInteger(stats.wins) && stats.wins >= 0 &&
      Number.isInteger(stats.losses) && stats.losses >= 0);
  });
}

function PongGame({ onBest, palette }: Pick<Props, "onBest" | "palette">) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PongState>(createPongState());
  const inputRef = useRef<PongInput>({ player: 0, opponent: 0, twoPlayer: false, difficulty: "normal" });
  const colorsRef = useRef({ surface: "#151719", surface2: "#1d2023", line: "#363b40", text: "#edf0f2", muted: "#979da3", accent: "#74a9df" });
  const [mode, setMode] = useState<PongMode>("computer");
  const [difficulty, setDifficulty] = useState<PongDifficulty>("normal");
  const [targetScore, setTargetScore] = useState(7);
  const [running, setRunning] = useState(true);
  const [score, setScore] = useState({ player: 0, opponent: 0 });
  const [stats, setStats] = useState<PongStats>(emptyPongStats);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const resultSaved = useRef(false);
  inputRef.current = { ...inputRef.current, twoPlayer: mode === "local", difficulty };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const style = getComputedStyle(canvas);
    colorsRef.current = {
      surface: style.getPropertyValue("--surface-0").trim() || "#151719",
      surface2: style.getPropertyValue("--surface-1").trim() || "#1d2023",
      line: style.getPropertyValue("--line").trim() || "#363b40",
      text: style.getPropertyValue("--text").trim() || "#edf0f2",
      muted: style.getPropertyValue("--text-muted").trim() || "#979da3",
      accent: style.getPropertyValue("--game-accent").trim() || "#74a9df",
    };
  }, [difficulty, mode, palette]);

  useEffect(() => {
    let active = true;
    Promise.all([
      db.arcadeData.get("preference:pong:mode"),
      db.arcadeData.get("preference:pong:difficulty"),
      db.arcadeData.get("preference:pong:target"),
      db.arcadeData.get("stats:pong"),
    ]).then(([modeRecord, difficultyRecord, targetRecord, statsRecord]) => {
      if (!active) return;
      const nextMode = modeRecord?.value === "local" ? "local" : "computer";
      const nextDifficulty = difficultyRecord?.value === "easy" || difficultyRecord?.value === "hard" ? difficultyRecord.value : "normal";
      const nextTarget = [3, 5, 7, 11].includes(Number(targetRecord?.value)) ? Number(targetRecord?.value) : 7;
      setMode(nextMode);
      setDifficulty(nextDifficulty);
      setTargetScore(nextTarget);
      inputRef.current = { ...inputRef.current, twoPlayer: nextMode === "local", difficulty: nextDifficulty };
      gameRef.current = createPongState(nextTarget);
      if (statsRecord) {
        try {
          const parsed: unknown = JSON.parse(statsRecord.value);
          if (!isPongStats(parsed)) throw new Error("Invalid saved Pong statistics.");
          setStats(parsed);
        } catch { setError(t("arcade.phase5.pong.storageError")); }
      }
      setReady(true);
    }).catch(() => {
      if (active) {
        setError(t("arcade.phase5.pong.storageError"));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [t]);

  const startMatch = useCallback((nextMode = mode, nextDifficulty = difficulty, nextTarget = targetScore) => {
    gameRef.current = createPongState(nextTarget);
    inputRef.current = { player: 0, opponent: 0, twoPlayer: nextMode === "local", difficulty: nextDifficulty };
    resultSaved.current = false;
    setScore({ player: 0, opponent: 0 });
    setRunning(true);
    setError("");
    playArcadeSound("pong", "start");
  }, [difficulty, mode, targetScore]);

  const persistPreference = async (key: string, value: string) => {
    try {
      await db.arcadeData.put({ id: key, value, updatedAt: Date.now() });
      setError("");
    } catch {
      setError(t("arcade.phase5.pong.storageError"));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const draw = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== 800 * dpr || canvas.height !== 450 * dpr) {
        canvas.width = 800 * dpr;
        canvas.height = 450 * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const world = gameRef.current;
      const colors = colorsRef.current;
      context.clearRect(0, 0, 800, 450);
      context.fillStyle = colors.surface;
      context.fillRect(0, 0, 800, 450);
      context.strokeStyle = colors.line;
      context.lineWidth = 2;
      context.setLineDash([7, 10]);
      context.beginPath();
      context.moveTo(400, 0);
      context.lineTo(400, 450);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = colors.accent;
      context.beginPath();
      context.roundRect(24, world.playerY - 41, 11, 82, 6);
      context.fill();
      context.fillStyle = colors.text;
      context.beginPath();
      context.roundRect(765, world.opponentY - 41, 11, 82, 6);
      context.fill();
      context.fillStyle = colors.text;
      context.beginPath();
      context.arc(world.ball.x, world.ball.y, 9, 0, Math.PI * 2);
      context.fill();
      if (world.serveSeconds > 0) {
        context.fillStyle = colors.muted;
        context.font = "600 14px system-ui";
        context.textAlign = "center";
        context.fillText(t("arcade.phase5.pong.serve"), 400, 410);
      }
      if (!running) {
        context.fillStyle = "rgba(0,0,0,.28)";
        context.fillRect(0, 0, 800, 450);
      }
    };
    if (!running || !ready) { draw(); return; }
    let frame = 0;
    let previous = 0;
    let accumulator = 0;
    let active = true;
    const fixedStep = 1 / 120;
    let previousDirection = Math.sign(gameRef.current.ball.vx);
    const animate = (now: number) => {
      if (!active || document.hidden) return;
      const elapsed = previous ? Math.min(0.05, (now - previous) / 1000) : 0;
      previous = now;
      accumulator += elapsed;
      while (accumulator >= fixedStep) {
        const before = gameRef.current;
        const next = stepPong(before, fixedStep, inputRef.current);
        gameRef.current = next;
        accumulator -= fixedStep;
        if (next.playerScore !== before.playerScore || next.opponentScore !== before.opponentScore) {
          setScore({ player: next.playerScore, opponent: next.opponentScore });
          playArcadeSound("pong", "score");
        } else if (Math.sign(next.ball.vx) !== previousDirection) {
          playArcadeSound("pong", "collision");
        }
        previousDirection = Math.sign(next.ball.vx);
        if (next.status !== "playing" && !resultSaved.current) {
          resultSaved.current = true;
          setRunning(false);
          const won = next.status === "playerWon";
          const statsKey = "stats:pong";
          db.transaction("rw", db.arcadeData, async () => {
            const record = await db.arcadeData.get(statsKey);
            let saved = emptyPongStats;
            if (record) {
              try {
                const parsed: unknown = JSON.parse(record.value);
                if (!isPongStats(parsed)) throw new Error("Invalid saved Pong statistics.");
                saved = parsed;
              } catch (error) {
                throw new Error("Unable to update saved Pong statistics.", { cause: error });
              }
            }
            const current = saved[mode];
            const updated = { ...saved, [mode]: { wins: current.wins + Number(won), losses: current.losses + Number(!won) } };
            await db.arcadeData.put({ id: statsKey, value: JSON.stringify(updated), updatedAt: Date.now() });
            return updated;
          }).then((updated) => {
            setStats(updated);
            setError("");
          }).catch(() => setError(t("arcade.phase5.pong.storageError")));
          onBest(Math.max(next.playerScore, next.opponentScore));
          playArcadeSound("pong", won ? "win" : "lose");
        }
      }
      draw();
      frame = window.requestAnimationFrame(animate);
    };
    const onVisibility = () => {
      if (document.hidden) window.cancelAnimationFrame(frame);
      else { previous = 0; accumulator = 0; frame = window.requestAnimationFrame(animate); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(animate);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode, onBest, ready, running, t]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === "w") inputRef.current.player = -1;
      if (event.key.toLowerCase() === "s") inputRef.current.player = 1;
      if (mode === "local" && event.key === "ArrowUp") inputRef.current.opponent = -1;
      if (mode === "local" && event.key === "ArrowDown") inputRef.current.opponent = 1;
      if (["w", "s", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
      if (event.key.toLowerCase() === "p" && ready) setRunning((value) => !value);
    };
    const onUp = (event: KeyboardEvent) => {
      if (["w", "s"].includes(event.key.toLowerCase())) inputRef.current.player = 0;
      if (["ArrowUp", "ArrowDown"].includes(event.key)) inputRef.current.opponent = 0;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [mode, ready]);

  function pointPaddle(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = Math.max(41, Math.min(409, (event.clientY - bounds.top) * 450 / bounds.height));
    const x = (event.clientX - bounds.left) * 800 / bounds.width;
    if (mode === "local" && x > 400) gameRef.current.opponentY = y;
    else gameRef.current.playerY = y;
  }

  return (
    <section className="arcade-play-card phase5-pong" aria-label={t("arcade.games.pong.board")}>
      <div className="arcade-score-row phase5-toolbar">
        <label>{t("arcade.phase5.pong.mode")}<select aria-label={t("arcade.phase5.pong.mode")} onChange={(event) => {
          const value = event.target.value as PongMode;
          setMode(value);
          inputRef.current = { ...inputRef.current, twoPlayer: value === "local" };
          void persistPreference("preference:pong:mode", value);
          startMatch(value);
        }} value={mode}><option value="computer">{t("arcade.phase5.pong.computer")}</option><option value="local">{t("arcade.phase5.pong.local")}</option></select></label>
        {mode === "computer" && <label>{t("arcade.phase5.pong.difficulty")}<select aria-label={t("arcade.phase5.pong.difficulty")} onChange={(event) => {
          const value = event.target.value as PongDifficulty;
          setDifficulty(value);
          inputRef.current.difficulty = value;
          void persistPreference("preference:pong:difficulty", value);
          startMatch(mode, value);
        }} value={difficulty}>{(["easy", "normal", "hard"] as const).map((value) => <option key={value} value={value}>{t(`arcade.phase5.pong.${value}`)}</option>)}</select></label>}
        <label>{t("arcade.phase5.pong.target")}<select aria-label={t("arcade.phase5.pong.target")} onChange={(event) => {
          const value = Number(event.target.value);
          setTargetScore(value);
          void persistPreference("preference:pong:target", String(value));
          startMatch(mode, difficulty, value);
        }} value={targetScore}>{[3, 5, 7, 11].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button className="button button--quiet" onClick={() => { if (gameRef.current.status === "playing") setRunning((value) => !value); else startMatch(); }} type="button">{running ? t("arcade.pause") : gameRef.current.status === "playing" ? t("arcade.resume") : t("arcade.restart")}</button>
        <button className="button button--quiet" onClick={() => startMatch()} type="button">{t("arcade.restart")}</button>
      </div>
      <div className="phase5-pong__score" aria-live="polite"><span>{t("arcade.phase5.pong.player")}</span><strong>{score.player}</strong><i>:</i><strong>{score.opponent}</strong><span>{mode === "computer" ? t("arcade.phase5.pong.opponent") : t("arcade.phase5.pong.player")}</span></div>
      <canvas
        aria-label={t("arcade.games.pong.board")}
        className="phase5-pong__canvas"
        height={450}
        tabIndex={0}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointPaddle(event); }}
        onPointerMove={(event) => { if (event.buttons || event.pointerType === "touch") pointPaddle(event); }}
        ref={canvasRef}
        width={800}
      />
      <div className="phase5-pong__touch" aria-label={t("arcade.games.pong.hint")}>
        <button onPointerDown={() => { inputRef.current.player = -1; }} onPointerUp={() => { inputRef.current.player = 0; }} type="button">↑</button>
        <button onPointerDown={() => { inputRef.current.player = 1; }} onPointerUp={() => { inputRef.current.player = 0; }} type="button">↓</button>
        {mode === "local" && <><button onPointerDown={() => { inputRef.current.opponent = -1; }} onPointerUp={() => { inputRef.current.opponent = 0; }} type="button">↑</button><button onPointerDown={() => { inputRef.current.opponent = 1; }} onPointerUp={() => { inputRef.current.opponent = 0; }} type="button">↓</button></>}
      </div>
      <p className="arcade-game-hint">{t("arcade.games.pong.hint")}</p>
      <p className="phase5-pong__stats">{t("arcade.phase5.pong.wins")}: {stats[mode].wins} · {t("arcade.phase5.pong.losses")}: {stats[mode].losses}</p>
      {gameRef.current.status !== "playing" && <p className="arcade-game-status" role="status">{gameRef.current.status === "playerWon" ? mode === "local" ? t("arcade.phase5.pong.localWon") : t("arcade.phase5.pong.playerWon") : t("arcade.phase5.pong.opponentWon")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

type SudokuSession = {
  puzzle: number[];
  solution: number[];
  board: number[];
  notes: number[][];
  difficulty: SudokuDifficulty;
  elapsed: number;
  mistakes: number;
  completed: boolean;
};
type SudokuSnapshot = { board: number[]; notes: number[][] };

function isSudokuDifficulty(value: unknown): value is SudokuDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function validSudokuSession(value: unknown): value is SudokuSession {
  if (!value || typeof value !== "object") return false;
  const saved = value as Partial<SudokuSession>;
  return isSudokuDifficulty(saved.difficulty) && Array.isArray(saved.puzzle) && isValidSudokuBoard(saved.puzzle) &&
    Array.isArray(saved.solution) && isValidSudokuBoard(saved.solution, false) &&
    Array.isArray(saved.board) && saved.board.length === 81 && saved.board.every((cell) => Number.isInteger(cell) && cell >= 0 && cell <= 9) &&
    saved.puzzle.every((value, index) => value === 0 || value === saved.solution?.[index] && value === saved.board?.[index]) &&
    Array.isArray(saved.notes) && saved.notes.length === 81 && saved.notes.every((items) => Array.isArray(items) && items.every((item) => Number.isInteger(item) && item >= 1 && item <= 9)) &&
    Number.isFinite(saved.elapsed) && Number.isFinite(saved.mistakes) && typeof saved.completed === "boolean";
}

function newSudokuSession(difficulty: SudokuDifficulty): SudokuSession {
  const created: SudokuPuzzle = createSudokuPuzzle(difficulty);
  return {
    puzzle: created.puzzle,
    solution: created.solution,
    board: [...created.puzzle],
    notes: Array.from({ length: 81 }, () => []),
    difficulty,
    elapsed: 0,
    mistakes: 0,
    completed: false,
  };
}

function cloneNotes(notes: number[][]): number[][] {
  return notes.map((values) => [...values]);
}

function SudokuGame({ onBest, onModeBest }: Pick<Props, "onBest" | "onModeBest">) {
  const { t } = useTranslation();
  const [session, setSession] = useState<SudokuSession | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const [pencil, setPencil] = useState(false);
  const [paused, setPaused] = useState(false);
  const [highlightMistakes, setHighlightMistakes] = useState(true);
  const [past, setPast] = useState<SudokuSnapshot[]>([]);
  const [future, setFuture] = useState<SudokuSnapshot[]>([]);
  const [ready, setReady] = useState(false);
  const [saveAllowed, setSaveAllowed] = useState(false);
  const [error, setError] = useState("");
  const completionReported = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([db.arcadeData.get(sudokuSaveKey), db.arcadeData.get(sudokuDifficultyKey), db.arcadeData.get(sudokuMistakeKey)]).then(([record, difficultyRecord, mistakeRecord]) => {
      if (!active) return;
      const saved = readStoredJson(record, validSudokuSession);
      if (saved) {
        setSession(saved);
        setSaveAllowed(true);
        completionReported.current = saved.completed;
      } else if (record) {
        setSession(null);
        setError(t("arcade.phase5.sudoku.invalidSave"));
      } else {
        const difficulty = isSudokuDifficulty(difficultyRecord?.value) ? difficultyRecord.value : "easy";
        setSession(newSudokuSession(difficulty));
        setSaveAllowed(true);
      }
      setHighlightMistakes(mistakeRecord?.value !== "false");
      setReady(true);
    }).catch(() => {
      if (active) {
        setError(t("arcade.phase5.sudoku.storageError"));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!ready || !saveAllowed || !session) return;
    const timeout = window.setTimeout(() => {
      db.arcadeData.put({ id: sudokuSaveKey, value: JSON.stringify(session), updatedAt: Date.now() })
        .then(() => setError(""))
        .catch(() => setError(t("arcade.phase5.sudoku.storageError")));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [ready, saveAllowed, session, t]);

  useEffect(() => {
    if (!session || session.completed || paused) return;
    const interval = window.setInterval(() => setSession((current) => current ? { ...current, elapsed: current.elapsed + 1 } : current), 1000);
    return () => window.clearInterval(interval);
  }, [paused, session?.completed]);

  useEffect(() => {
    if (session?.completed && !completionReported.current) {
      completionReported.current = true;
      onBest(session.elapsed);
      onModeBest(session.difficulty, session.elapsed);
      playArcadeSound("sudoku", "win");
    }
  }, [onBest, onModeBest, session?.completed, session?.difficulty, session?.elapsed]);

  function restartPuzzle() {
    if (!session) return;
    completionReported.current = false;
    setSession({ ...session, board: [...session.puzzle], notes: Array.from({ length: 81 }, () => []), elapsed: 0, mistakes: 0, completed: false });
    setPast([]);
    setFuture([]);
    setSelection(null);
    setPaused(false);
    playArcadeSound("sudoku", "start");
  }

  async function newPuzzle(difficulty: SudokuDifficulty) {
    completionReported.current = false;
    setSession(newSudokuSession(difficulty));
    setSelection(null);
    setPast([]);
    setFuture([]);
    setPaused(false);
    setSaveAllowed(true);
    setError("");
    try {
      await db.arcadeData.put({ id: sudokuDifficultyKey, value: difficulty, updatedAt: Date.now() });
    } catch {
      setError(t("arcade.phase5.sudoku.storageError"));
    }
    playArcadeSound("sudoku", "start");
  }

  function recordSnapshot(current: SudokuSession) {
    setPast((items) => [...items.slice(-49), { board: [...current.board], notes: cloneNotes(current.notes) }]);
    setFuture([]);
  }

  function enterValue(value: number | null) {
    if (!session || selection === null || session.completed || paused || session.puzzle[selection]) return;
    const nextBoard = [...session.board];
    const nextNotes = cloneNotes(session.notes);
    if (value === null) {
      nextBoard[selection] = 0;
      nextNotes[selection] = [];
    } else if (pencil && nextBoard[selection] === 0) {
      const values = nextNotes[selection];
      nextNotes[selection] = values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort();
    } else {
      nextBoard[selection] = value;
      nextNotes[selection] = [];
    }
    if (nextBoard.every((item, index) => item === session.board[index]) &&
      nextNotes.every((items, index) => items.join() === session.notes[index].join())) return;
    recordSnapshot(session);
    const mistake = value !== null && !pencil && value !== session.solution[selection];
    const next = {
      ...session,
      board: nextBoard,
      notes: nextNotes,
      mistakes: session.mistakes + Number(mistake),
      completed: nextBoard.every((item, index) => item === session.solution[index]),
    };
    if (!next.completed) completionReported.current = false;
    setSession(next);
    if (mistake) playArcadeSound("sudoku", "failure");
    else if (value !== null) playArcadeSound("sudoku", "click");
  }

  function undo() {
    if (!session || !past.length) return;
    const previous = past[past.length - 1];
    setFuture((items) => [...items, { board: [...session.board], notes: cloneNotes(session.notes) }]);
    setPast((items) => items.slice(0, -1));
    completionReported.current = false;
    setSession({ ...session, board: previous.board, notes: previous.notes, completed: false });
  }

  function redo() {
    if (!session || !future.length) return;
    const next = future[future.length - 1];
    setPast((items) => [...items, { board: [...session.board], notes: cloneNotes(session.notes) }]);
    setFuture((items) => items.slice(0, -1));
    setSession({ ...session, board: next.board, notes: next.notes, completed: next.board.every((value, index) => value === session.solution[index]) });
  }

  function hint() {
    if (!session) return;
    const index = selection !== null && session.board[selection] === 0
      ? selection
      : session.board.findIndex((value) => value === 0);
    if (index < 0) return;
    setSelection(index);
    if (session.puzzle[index]) return;
    const previousSelection = selection;
    setSelection(index);
    if (previousSelection === index) enterValue(session.solution[index]);
    else {
      recordSnapshot(session);
      const board = [...session.board];
      board[index] = session.solution[index];
      setSession({ ...session, board, notes: session.notes.map((items, cell) => cell === index ? [] : items), completed: board.every((value, cell) => value === session.solution[cell]) });
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement | null)?.tagName ?? "")) return;
      if (event.key === "Escape" || event.key.toLowerCase() === "p") { setPaused((value) => !value); return; }
      if (selection === null || !session || paused) return;
      if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enterValue(Number(event.key)); return; }
      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") { event.preventDefault(); enterValue(null); return; }
      const row = Math.floor(selection / 9);
      const column = selection % 9;
      const target = event.key === "ArrowLeft" ? row * 9 + Math.max(0, column - 1)
        : event.key === "ArrowRight" ? row * 9 + Math.min(8, column + 1)
          : event.key === "ArrowUp" ? Math.max(0, row - 1) * 9 + column
            : event.key === "ArrowDown" ? Math.min(8, row + 1) * 9 + column : -1;
      if (target >= 0) { event.preventDefault(); setSelection(target); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!ready || !session) {
    return <div className="arcade-play-card phase5-sudoku"><p className="arcade-loading">{t("arcade.loading")}</p>{error && <p className="form-error" role="alert">{error}</p>}</div>;
  }

  const selectedValue = selection === null ? 0 : session.board[selection];
  const selectedRow = selection === null ? -1 : Math.floor(selection / 9);
  const selectedColumn = selection === null ? -1 : selection % 9;
  return (
    <section className="arcade-play-card phase5-sudoku" aria-label={t("arcade.games.sudoku.board")}>
      <div className="arcade-score-row phase5-toolbar">
        <label>{t("arcade.phase5.sudoku.difficulty")}<select aria-label={t("arcade.phase5.sudoku.difficulty")} onChange={(event) => void newPuzzle(event.target.value as SudokuDifficulty)} value={session.difficulty}>{(["easy", "normal", "hard"] as const).map((value) => <option key={value} value={value}>{t(`arcade.phase5.sudoku.${value}`)}</option>)}</select></label>
        <span>{t("arcade.time")} <strong>{session.elapsed}</strong> {t("arcade.seconds")}</span>
        <span>{t("arcade.phase5.sudoku.mistakes")} <strong>{session.mistakes}</strong></span>
        <button aria-pressed={pencil} className={`button ${pencil ? "button--primary" : "button--quiet"}`} onClick={() => setPencil((value) => !value)} type="button">{t("arcade.phase5.sudoku.notes")}</button>
        <button className="button button--quiet" disabled={!past.length} onClick={undo} type="button">{t("arcade.phase5.sudoku.undo")}</button>
        <button className="button button--quiet" disabled={!future.length} onClick={redo} type="button">{t("arcade.phase5.sudoku.redo")}</button>
        <button className="button button--quiet" onClick={hint} type="button">{t("arcade.phase5.sudoku.hint")}</button>
        <button className="button button--quiet" onClick={() => setPaused((value) => !value)} type="button">{paused ? t("arcade.phase5.sudoku.resume") : t("arcade.phase5.sudoku.pause")}</button>
        <button className="button button--quiet" onClick={restartPuzzle} type="button">{t("arcade.restart")}</button>
      </div>
      <label className="phase5-sudoku__mistake-option"><input checked={highlightMistakes} onChange={(event) => {
        setHighlightMistakes(event.target.checked);
        void db.arcadeData.put({ id: sudokuMistakeKey, value: String(event.target.checked), updatedAt: Date.now() }).catch(() => setError(t("arcade.phase5.sudoku.storageError")));
      }} type="checkbox" />{t("arcade.phase5.sudoku.highlightMistakes")}</label>
      <div className="phase5-sudoku__wrap">
        <div className="phase5-sudoku__board" role="grid" aria-label={t("arcade.games.sudoku.board")}>
          {session.board.map((value, index) => {
            const row = Math.floor(index / 9);
            const column = index % 9;
            const given = session.puzzle[index] !== 0;
            const related = selection !== null && (row === selectedRow || column === selectedColumn || Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(column / 3) === Math.floor(selectedColumn / 3));
            const wrong = highlightMistakes && value !== 0 && !given && value !== session.solution[index];
            const same = selectedValue !== 0 && value === selectedValue;
            const notesLabel = session.notes[index].length ? t("arcade.phase5.sudoku.notesFor", { values: session.notes[index].join(", ") }) : "";
            return <button
              aria-label={t("arcade.phase5.sudoku.cell", { row: row + 1, column: column + 1, value: value ? `, ${t(given ? "arcade.phase5.sudoku.given" : "arcade.phase5.sudoku.value", { value })}` : `, ${t("arcade.phase5.sudoku.empty")}${notesLabel ? `, ${notesLabel}` : ""}` })}
              aria-selected={selection === index}
              className={`phase5-sudoku__cell${given ? " is-given" : ""}${selection === index ? " is-selected" : ""}${related ? " is-related" : ""}${same ? " is-same" : ""}${wrong ? " is-wrong" : ""}${row % 3 === 2 && row < 8 ? " is-box-bottom" : ""}${column % 3 === 2 && column < 8 ? " is-box-right" : ""}`}
              key={index}
              onClick={() => setSelection(index)}
              role="gridcell"
              type="button"
            >{paused ? "" : value || session.notes[index].length > 0 ? <>{paused ? "" : value || <small>{session.notes[index].join("")}</small>}</> : ""}</button>;
          })}
        </div>
        {paused && <div className="phase5-sudoku__cover" role="status">{t("arcade.phase5.sudoku.paused")}</div>}
        {session.completed && <div className="phase5-sudoku__cover is-complete" role="status">{t("arcade.phase5.sudoku.complete", { time: session.elapsed })}<button className="button button--primary" onClick={() => void newPuzzle(session.difficulty)} type="button">{t("arcade.phase5.sudoku.newPuzzle")}</button></div>}
      </div>
      <div className="phase5-sudoku__numbers" role="group" aria-label={t("arcade.phase5.sudoku.numbers")}>
        {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => <button key={value} disabled={paused || session.completed} onClick={() => enterValue(value)} type="button">{value}</button>)}
        <button className="phase5-sudoku__erase" disabled={paused || session.completed} onClick={() => enterValue(null)} type="button">{t("arcade.phase5.sudoku.erase")}</button>
      </div>
      <p className="arcade-game-hint">{t("arcade.games.sudoku.hint")}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

export function Phase5GameScreen(props: Props) {
  const style = {
    "--game-accent": props.palette.accent,
    "--game-accent-soft": props.palette.soft,
    "--game-accent-strong": props.palette.strong,
  } as React.CSSProperties;
  return (
    <div className="arcade-game-area phase5-game-area" style={style}>
      {props.game.id === "block-stack" && <BlockStackGame best={props.best} onBest={props.onBest} />}
      {props.game.id === "minesweeper" && <MinesweeperGame onBest={props.onBest} onModeBest={props.onModeBest} />}
      {props.game.id === "pong" && <PongGame onBest={props.onBest} palette={props.palette} />}
      {props.game.id === "sudoku" && <SudokuGame onBest={props.onBest} onModeBest={props.onModeBest} />}
    </div>
  );
}
