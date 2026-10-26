import { useCallback, useEffect, useRef, useState } from "react";
import { CirclePause, CirclePlay, RotateCcw, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { playArcadeSound } from "../data/arcade-audio";
import {
  advanceSnake,
  canMove2048,
  isPuzzleSolved,
  move2048,
  movePuzzle,
  shufflePuzzle,
  spawn2048,
  type GameDefinition,
  type Point,
} from "../data/arcade";

type Palette = { accent: string; soft: string; strong: string };
type GameProps = { best?: number; onBest: (value: number) => void };

function useGamePreference<T extends number>(name: string, initial: T, choices: readonly number[]) {
  const { t } = useTranslation();
  const id = `preference:${name}`;
  const stored = useLiveQuery(
    async () => await db.arcadeData.get(id) ?? { id, value: String(initial), updatedAt: 0 },
    [id, initial],
    null,
  );
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!stored) return;
    const saved = Number(stored.value);
    if (choices.includes(saved)) setValue(saved as T);
    setLoaded(true);
  }, [stored?.value]);
  const save = useCallback((next: T) => {
    setValue(next);
    void db.arcadeData.put({ id, value: String(next), updatedAt: Date.now() })
      .then(() => setError(""))
      .catch(() => setError(t("arcade.saveError")));
  }, [id, t]);
  return { value, save, loaded, error };
}

export function GameScreen({ game, best, onBest, palette }: GameProps & { game: GameDefinition; palette: Palette }) {
  const style = {
    "--game-accent": palette.accent,
    "--game-accent-soft": palette.soft,
    "--game-accent-strong": palette.strong,
  } as React.CSSProperties;
  const props = { best, onBest };
  return (
    <div className="arcade-game-area" style={style}>
      {game.id === "2048" && <Game2048 {...props} />}
      {game.id === "snake" && <SnakeGame {...props} />}
      {game.id === "memory" && <MemoryGame {...props} />}
      {game.id === "reaction" && <ReactionGame {...props} />}
      {game.id === "sliding" && <SlidingGame {...props} />}
    </div>
  );
}

function useGameKeys(handler: (key: string) => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (handlerRef.current(event.key)) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

const arrowDirections: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};

function Game2048({ best, onBest }: GameProps) {
  const { t } = useTranslation();
  const initial = () => spawn2048(spawn2048(Array(16).fill(0)));
  const [board, setBoard] = useState(initial);
  const [score, setScore] = useState(0);
  const [undo, setUndo] = useState<{ board: number[]; score: number } | null>(null);
  const [over, setOver] = useState(false);
  const touch = useRef<Point | null>(null);

  const move = useCallback((direction: "left" | "right" | "up" | "down") => {
    if (over) return;
    const result = move2048(board, direction);
    if (!result.changed) return;
    const next = spawn2048(result.board);
    setUndo({ board, score });
    setBoard(next);
    setScore(score + result.score);
    playArcadeSound("2048", "score");
    onBest(score + result.score);
    const gameOver = !canMove2048(next);
    setOver(gameOver);
    if (gameOver) playArcadeSound("2048", "gameOver");
  }, [board, score, over, onBest]);
  useGameKeys((key) => {
    const direction = arrowDirections[key];
    if (direction) { move(direction); return true; }
    return false;
  });

  function restart() {
    if ((score > 0 || board.some((value) => value > 0)) && !window.confirm(t("arcade.confirmRestart"))) return;
    setBoard(initial());
    setScore(0);
    setUndo(null);
    setOver(false);
  }
  const onTouchEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!touch.current) return;
    const dx = event.clientX - touch.current.x;
    const dy = event.clientY - touch.current.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touch.current = null;
  };
  return (
    <section className="arcade-play-card" aria-label="2048">
      <div className="arcade-score-row"><span>{t("arcade.score")} <strong>{score}</strong></span><span>{t("arcade.best")} <strong>{best ?? 0}</strong></span><button className="button button--quiet" disabled={!undo} onClick={() => { if (undo) { setBoard(undo.board); setScore(undo.score); setUndo(null); setOver(false); } }} type="button"><Undo2 size={14} />{t("arcade.undo")}</button><button className="button button--quiet" onClick={restart} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button></div>
      <div className="game-2048" onPointerDown={(event) => { touch.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={onTouchEnd} role="grid" aria-label={t("arcade.games.2048.board")}>
        {board.map((value, index) => <div className={`game-2048__tile${value ? " has-value" : ""}`} data-value={value} key={index} role="gridcell">{value || ""}</div>)}
      </div>
      {over && <p className="arcade-game-status" role="status">{t("arcade.gameOver")}</p>}
      <p className="arcade-game-hint">{t("arcade.games.2048.hint")}</p>
    </section>
  );
}

const gridWidth = 16;
const gridHeight = 12;
const directionMap: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
};

function SnakeGame({ best, onBest }: GameProps) {
  const { t } = useTranslation();
  const [snake, setSnake] = useState<Point[]>([{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }]);
  const [food, setFood] = useState<Point>({ x: 10, y: 6 });
  const [direction, setDirection] = useState<Point>({ x: 1, y: 0 });
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const step = useCallback(() => {
    const result = advanceSnake(snake, direction, food, gridWidth, gridHeight);
    if (result.collided) { setRunning(false); setOver(true); playArcadeSound("snake", "gameOver"); return; }
    setSnake(result.snake);
    if (result.ate) {
      playArcadeSound("snake", "score");
      const nextScore = score + 1;
      setScore(nextScore);
      onBest(nextScore);
      const freeCells = Array.from({ length: gridWidth * gridHeight }, (_, index) => ({ x: index % gridWidth, y: Math.floor(index / gridWidth) }))
        .filter((cell) => !result.snake.some((part) => part.x === cell.x && part.y === cell.y));
      if (freeCells.length === 0) { setRunning(false); setOver(true); playArcadeSound("snake", "win"); }
      else setFood(freeCells[Math.floor(Math.random() * freeCells.length)]);
    }
  }, [snake, direction, food, score, onBest]);
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(step, Math.max(75, 180 - score * 4));
    return () => window.clearInterval(interval);
  }, [running, step, score]);
  const changeDirection = useCallback((next: Point) => {
    const current = directionRef.current;
    if (next.x === -current.x && next.y === -current.y) return;
    setDirection(next);
  }, []);
  useGameKeys((key) => {
    if (key === " " && !over) { setRunning((value) => { playArcadeSound("snake", value ? "click" : "start"); return !value; }); return true; }
    const next = directionMap[key] ?? directionMap[key.toLowerCase()];
    if (next) { changeDirection(next); return true; }
    return false;
  });
  function reset() {
    setSnake([{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }]);
    setFood({ x: 10, y: 6 });
    setDirection({ x: 1, y: 0 });
    setScore(0);
    setOver(false);
    setRunning(false);
  }
  const occupied = new Set(snake.map((part) => part.y * gridWidth + part.x));
  return (
    <section className="arcade-play-card">
      <div className="arcade-score-row"><span>{t("arcade.score")} <strong>{score}</strong></span><span>{t("arcade.best")} <strong>{best ?? 0}</strong></span><button className="button button--primary" onClick={() => setRunning((value) => { playArcadeSound("snake", value ? "click" : "start"); return !value; })} type="button">{running ? <CirclePause size={14} /> : <CirclePlay size={14} />}{running ? t("arcade.pause") : over ? t("arcade.resume") : score ? t("arcade.resume") : t("arcade.start")}</button><button className="button button--quiet" onClick={reset} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button></div>
      <div aria-label={t("arcade.games.snake.board")} className="snake-board" style={{ "--snake-columns": gridWidth } as React.CSSProperties} role="grid">
        {Array.from({ length: gridWidth * gridHeight }, (_, index) => {
          const isFood = food.y * gridWidth + food.x === index;
          return <i aria-hidden="true" className={`${occupied.has(index) ? "is-snake" : ""}${isFood ? " is-food" : ""}`} key={index} role="gridcell" />;
        })}
      </div>
      {over && <p className="arcade-game-status" role="status">{t("arcade.gameOver")}</p>}
      <p className="arcade-game-hint">{t("arcade.games.snake.hint")}</p>
      <div className="snake-touch-controls" aria-label={t("arcade.controls")}>
        <button onClick={() => changeDirection({ x: 0, y: -1 })} type="button">↑</button><button onClick={() => changeDirection({ x: -1, y: 0 })} type="button">←</button><button onClick={() => changeDirection({ x: 0, y: 1 })} type="button">↓</button><button onClick={() => changeDirection({ x: 1, y: 0 })} type="button">→</button>
      </div>
    </section>
  );
}

const memorySymbols = ["◆", "●", "▲", "■", "◇", "○", "⌘", "＋", "×", "≋", "∴", "◈"];
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function MemoryGame({ best, onBest }: GameProps) {
  const { t } = useTranslation();
  const preference = useGamePreference<6 | 8 | 12>("memory", 6, [6, 8, 12]);
  const pairs = preference.value;
  const [cards, setCards] = useState(() => shuffled(memorySymbols.slice(0, 6).flatMap((symbol, id) => [{ symbol, id }, { symbol, id }])));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const lock = useRef(false);
  const hydrated = useRef(false);
  const mismatchTimeout = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (mismatchTimeout.current) window.clearTimeout(mismatchTimeout.current); }, []);
  useEffect(() => {
    if (!started || matched.length === cards.length) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [started, matched.length, cards.length]);
  useEffect(() => {
    if (cards.length > 0 && matched.length === cards.length) onBest(moves);
  }, [matched.length, cards.length, moves, onBest]);
  function reset(nextPairs = pairs) {
    setCards(shuffled(memorySymbols.slice(0, nextPairs).flatMap((symbol, id) => [{ symbol, id }, { symbol, id }])));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setSeconds(0);
    setStarted(false);
    lock.current = false;
    if (mismatchTimeout.current) window.clearTimeout(mismatchTimeout.current);
  }
  useEffect(() => {
    if (!preference.loaded || hydrated.current) return;
    hydrated.current = true;
    if (pairs !== 6) reset(pairs);
  }, [preference.loaded]);
  function flip(index: number) {
    if (lock.current || flipped.includes(index) || matched.includes(cards[index].id)) return;
    setStarted(true);
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;
    setMoves((value) => value + 1);
    if (cards[next[0]].id === cards[next[1]].id) {
      playArcadeSound("memory", "success");
      if (matched.length + 1 === cards.length / 2) playArcadeSound("memory", "win");
      setMatched((value) => [...value, cards[next[0]].id]);
      setFlipped([]);
    } else {
      playArcadeSound("memory", "failure");
      lock.current = true;
      mismatchTimeout.current = window.setTimeout(() => { setFlipped([]); lock.current = false; }, 700);
    }
  }
  return (
    <section className="arcade-play-card">
      <div className="arcade-score-row"><label>{t("arcade.boardSize")}<select aria-label={t("arcade.boardSize")} disabled={!preference.loaded} onChange={(event) => { const next = Number(event.target.value) as 6 | 8 | 12; preference.save(next); reset(next); }} value={pairs}><option value={6}>12</option><option value={8}>16</option><option value={12}>24</option></select></label><span>{t("arcade.moves")}: <strong>{moves}</strong></span><span>{t("arcade.time")}: <strong>{seconds}s</strong></span><span>{t("arcade.best")}: <strong>{best ?? "—"}</strong></span><button className="button button--quiet" onClick={() => reset()} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button></div>
      <div className="memory-board" style={{ "--memory-columns": pairs > 8 ? 6 : 4 } as React.CSSProperties}>
        {cards.map((card, index) => <button aria-label={matched.includes(card.id) ? `${t("arcade.matched")} ${card.symbol}` : flipped.includes(index) ? card.symbol : t("arcade.hiddenCard")} className={`memory-card${flipped.includes(index) || matched.includes(card.id) ? " is-revealed" : ""}`} key={index} onClick={() => flip(index)} type="button">{flipped.includes(index) || matched.includes(card.id) ? card.symbol : "·"}</button>)}
      </div>
      {preference.error && <p className="form-error" role="alert">{preference.error}</p>}
      {matched.length === cards.length && <p className="arcade-game-status" role="status">{t("arcade.completed", { moves, seconds })}</p>}
    </section>
  );
}

function ReactionGame({ best, onBest }: GameProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<"idle" | "waiting" | "ready" | "early" | "done">("idle");
  const [times, setTimes] = useState<number[]>([]);
  const startTime = useRef(0);
  const timeout = useRef<number | undefined>(undefined);
  const rounds = 5;
  useEffect(() => () => { if (timeout.current) window.clearTimeout(timeout.current); }, []);
  function begin() {
    if (timeout.current) window.clearTimeout(timeout.current);
    setTimes([]);
    nextRound();
  }
  function nextRound() {
    setStage("waiting");
    timeout.current = window.setTimeout(() => { startTime.current = performance.now(); setStage("ready"); playArcadeSound("reaction", "success"); }, 1000 + Math.random() * 2500);
  }
  function click() {
    if (stage === "idle" || stage === "done" || stage === "early") { begin(); return; }
    if (stage === "waiting") {
      if (timeout.current) window.clearTimeout(timeout.current);
      setStage("early");
      playArcadeSound("reaction", "failure");
      return;
    }
    const time = Math.round(performance.now() - startTime.current);
    const next = [...times, time];
    playArcadeSound("reaction", "score");
    setTimes(next);
    if (next.length >= rounds) {
      setStage("done");
      playArcadeSound("reaction", "win");
      onBest(Math.round(next.reduce((sum, value) => sum + value, 0) / next.length));
    } else nextRound();
  }
  const average = times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : 0;
  return (
    <section className="arcade-play-card reaction-card">
      <div className={`reaction-target reaction-target--${stage}`}><button onClick={click} type="button">{t(`arcade.reaction.${stage}`)}</button></div>
      <div className="reaction-summary"><span>{t("arcade.round")} {Math.min(times.length + (stage === "ready" || stage === "waiting" ? 1 : 0), rounds)} / {rounds}</span>{stage === "done" && <strong>{average} ms {t("arcade.average")}</strong>}<span>{t("arcade.personalBest")}: {best === undefined ? "—" : `${best} ms`}</span></div>
      <div className="reaction-times">{times.map((time, index) => <span key={index}>{time} ms</span>)}</div>
    </section>
  );
}

function SlidingGame({ best, onBest }: GameProps) {
  const { t } = useTranslation();
  const preference = useGamePreference<3 | 4>("sliding", 3, [3, 4]);
  const size = preference.value;
  const [board, setBoard] = useState(() => shufflePuzzle(3));
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const hydrated = useRef(false);
  const solved = isPuzzleSolved(board);
  useEffect(() => {
    if (!started || solved) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [started, solved]);
  useEffect(() => { if (solved && started) onBest(seconds); }, [solved, started, seconds, onBest]);
  const slide = useCallback((index: number) => {
    const next = movePuzzle(board, index);
    if (!next) return;
    setBoard(next);
    setStarted(true);
    setMoves((value) => value + 1);
    playArcadeSound("sliding", isPuzzleSolved(next) ? "win" : "score");
  }, [board]);
  useGameKeys((key) => {
    const blank = board.indexOf(0);
    const target = key === "ArrowUp" ? blank + size : key === "ArrowDown" ? blank - size : key === "ArrowLeft" && blank % size < size - 1 ? blank + 1 : key === "ArrowRight" && blank % size > 0 ? blank - 1 : -1;
    if (target >= 0 && target < board.length) { slide(target); return true; }
    return false;
  });
  function restart(nextSize = size) {
    setBoard(shufflePuzzle(nextSize));
    setMoves(0);
    setSeconds(0);
    setStarted(false);
  }
  useEffect(() => {
    if (!preference.loaded || hydrated.current) return;
    hydrated.current = true;
    if (size !== 3) restart(size);
  }, [preference.loaded]);
  return (
    <section className="arcade-play-card">
      <div className="arcade-score-row"><label>{t("arcade.boardSize")}<select aria-label={t("arcade.boardSize")} disabled={!preference.loaded} onChange={(event) => { const next = Number(event.target.value) as 3 | 4; preference.save(next); restart(next); }} value={size}><option value={3}>3 × 3</option><option value={4}>4 × 4</option></select></label><span>{t("arcade.moves")}: <strong>{moves}</strong></span><span>{t("arcade.time")}: <strong>{seconds}s</strong></span><span>{t("arcade.best")}: <strong>{best === undefined ? "—" : `${best}s`}</strong></span><button className="button button--quiet" onClick={() => restart()} type="button"><RotateCcw size={14} />{t("arcade.shuffle")}</button></div>
      <div className="sliding-board" style={{ "--puzzle-size": size } as React.CSSProperties}>
        {board.map((value, index) => <button aria-label={value ? String(value) : t("arcade.emptyTile")} className={`sliding-tile${value ? "" : " is-empty"}`} disabled={!movePuzzle(board, index)} key={index} onClick={() => slide(index)} type="button">{value || ""}</button>)}
      </div>
      {preference.error && <p className="form-error" role="alert">{preference.error}</p>}
      {solved && started && <p className="arcade-game-status" role="status">{t("arcade.puzzleSolved", { moves, seconds })}</p>}
    </section>
  );
}
