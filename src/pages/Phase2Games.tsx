import { useCallback, useEffect, useRef, useState } from "react";
import { CirclePause, CirclePlay, RotateCcw } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { circleHitsRect, evaluateGuess, isAimHit, loadWordDictionary, normalizeWord, randomWord, type LetterMark, type WordDictionary, type WordLanguage } from "../data/phase2-games";
import { playArcadeSound } from "../data/arcade-audio";
import { advanceGeometryRunner, createAirHockeyState, createGeometryRunner, stepAirHockey, type GeometryRunnerState, type HockeyState } from "../data/phase2-physics";
import type { GameDefinition, GameId, Point } from "../data/arcade";

type Palette = { accent: string; soft: string; strong: string };
type Props = {
  game: GameDefinition;
  best?: number;
  language: "en" | "de";
  palette: Palette;
  onBest: (value: number) => void;
  onModeBest: (mode: string, value: number) => void;
};

export function Phase2GameScreen(props: Props) {
  const style = {
    "--game-accent": props.palette.accent,
    "--game-accent-soft": props.palette.soft,
    "--game-accent-strong": props.palette.strong,
  } as React.CSSProperties;
  return (
    <div className="arcade-game-area" style={style}>
      {props.game.id === "word-guess" && <WordGuessGame {...props} />}
      {(props.game.id === "brick-breaker" || props.game.id === "geometry-runner" ||
        props.game.id === "air-hockey" || props.game.id === "aim-trainer") &&
        <CanvasGame key={props.game.id} {...props} kind={props.game.id} />}
    </div>
  );
}

interface WordStats { wins: number; losses: number; streak: number; bestStreak: number }
const emptyWordStats: WordStats = { wins: 0, losses: 0, streak: 0, bestStreak: 0 };
const wordStatsKey = "stats:word-guess";
const wordLengthKey = "preference:word-guess:length";

function WordGuessGame({ language, onBest }: Props) {
  const { t } = useTranslation();
  const statsRecord = useLiveQuery(() => db.arcadeData.get(wordStatsKey), [], undefined);
  const lengthRecord = useLiveQuery(() => db.arcadeData.get(wordLengthKey), [], undefined);
  const [wordLanguage, setWordLanguage] = useState<WordLanguage>(language);
  const [dictionary, setDictionary] = useState<WordDictionary | null>(null);
  const [length, setLength] = useState<4 | 5 | 6>(5);
  const [answer, setAnswer] = useState("");
  const [guess, setGuess] = useState("");
  const [attempts, setAttempts] = useState<Array<{ word: string; marks: LetterMark[] }>>([]);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState(emptyWordStats);
  const [ready, setReady] = useState(false);
  const [dictionaryError, setDictionaryError] = useState(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const finished = Boolean(answer) && (attempts.some((attempt) => attempt.word === answer) || attempts.length >= 6);

  useEffect(() => setWordLanguage(language), [language]);
  useEffect(() => {
    let active = true;
    setDictionary(null);
    setDictionaryError(false);
    loadWordDictionary(wordLanguage).then((loaded) => {
      if (active) setDictionary(loaded);
    }).catch(() => {
      if (active) {
        setDictionaryError(true);
        setNotice(t("arcade.wordGuess.dictionaryError"));
      }
    });
    return () => { active = false; };
  }, [wordLanguage, t]);

  useEffect(() => {
    if (statsRecord) {
      try {
        const saved = JSON.parse(statsRecord.value) as Partial<WordStats>;
        setStats({
          wins: Number.isSafeInteger(saved.wins) ? saved.wins! : 0,
          losses: Number.isSafeInteger(saved.losses) ? saved.losses! : 0,
          streak: Number.isSafeInteger(saved.streak) ? saved.streak! : 0,
          bestStreak: Number.isSafeInteger(saved.bestStreak) ? saved.bestStreak! : 0,
        });
      } catch {
        setNotice(t("arcade.wordGuess.statsError"));
      }
    }
  }, [statsRecord?.value, t]);
  useEffect(() => {
    if (!lengthRecord) { setReady(true); return; }
    const saved = Number(lengthRecord.value);
    if (saved === 4 || saved === 5 || saved === 6) setLength(saved);
    setReady(true);
  }, [lengthRecord?.value]);
  useEffect(() => {
    if (!ready || !dictionary) return;
    setAnswer(randomWord(dictionary.solutions[length]));
    setGuess("");
    setAttempts([]);
    setNotice("");
  }, [wordLanguage, length, ready, dictionary]);

  async function completeRound(won: boolean) {
    const current = statsRef.current;
    const next: WordStats = won
      ? { wins: current.wins + 1, losses: current.losses, streak: current.streak + 1, bestStreak: Math.max(current.bestStreak, current.streak + 1) }
      : { wins: current.wins, losses: current.losses + 1, streak: 0, bestStreak: current.bestStreak };
    statsRef.current = next;
    setStats(next);
    try {
      await db.arcadeData.put({ id: wordStatsKey, value: JSON.stringify(next), updatedAt: Date.now() });
      if (won) onBest(next.wins);
      setNotice(t(won ? "arcade.wordGuess.won" : "arcade.wordGuess.lost", { word: answer.toLocaleUpperCase(wordLanguage) }));
      playArcadeSound("word-guess", won ? "win" : "lose");
    } catch {
      setNotice(t("arcade.saveError"));
    }
  }

  async function submit() {
    if (!dictionary || !answer) return;
    const normalized = normalizeWord(guess, wordLanguage);
    if ([...normalized].length !== length) { setNotice(t("arcade.wordGuess.needLength", { count: length })); return; }
    if (!dictionary.valid.has(normalized)) {
      setNotice(t("arcade.wordGuess.notWord"));
      playArcadeSound("word-guess", "failure");
      return;
    }
    const marks = evaluateGuess(normalized, answer);
    const next = [...attempts, { word: normalized, marks }];
    setAttempts(next);
    setGuess("");
    setNotice("");
    if (normalized !== answer) playArcadeSound("word-guess", "score");
    if (normalized === answer) await completeRound(true);
    else if (next.length >= 6) await completeRound(false);
  }

  function pressKey(key: string) {
    if (key === "ENTER") { if (!finished) void submit(); return; }
    if (key === "⌫" || key === "BACKSPACE") { if (!finished) setGuess((value) => [...value].slice(0, -1).join("")); return; }
    if (/^[a-zäöüß]$/i.test(key) && !finished && dictionary && [...guess].length < length) setGuess((value) => value + normalizeWord(key, wordLanguage));
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Enter" || event.key === "Backspace" || /^[a-zäöüß]$/i.test(event.key)) {
        event.preventDefault();
        pressKey(event.key === "Enter" ? "ENTER" : event.key === "Backspace" ? "BACKSPACE" : event.key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function changeLength(next: 4 | 5 | 6) {
    setLength(next);
    try {
      await db.arcadeData.put({ id: wordLengthKey, value: String(next), updatedAt: Date.now() });
    } catch {
      setNotice(t("arcade.saveError"));
    }
  }
  function newPuzzle() {
    if (!dictionary) return;
    setAnswer(randomWord(dictionary.solutions[length]));
    setGuess("");
    setAttempts([]);
    setNotice("");
    playArcadeSound("word-guess", "start");
  }

  const keyboard = wordLanguage === "de"
    ? ["QWERTZUIOP", "ASDFGHJKL", "YXCVBNMÄÖÜß"]
    : ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  return (
    <section className="arcade-play-card word-game">
      <div className="arcade-score-row word-game__controls">
        <label>{t("arcade.wordGuess.language")}<select aria-label={t("arcade.wordGuess.language")} onChange={(event) => setWordLanguage(event.target.value as WordLanguage)} value={wordLanguage}><option value="de">{t("settings.german")}</option><option value="en">{t("settings.english")}</option></select></label>
        <label>{t("arcade.boardSize")}<select aria-label={t("arcade.wordGuess.length")} disabled={!ready || !dictionary} onChange={(event) => { const next = Number(event.target.value); if (next === 4 || next === 5 || next === 6) void changeLength(next); }} value={length}><option value={4}>4</option><option value={5}>5</option><option value={6}>6</option></select></label>
        <span>{t("arcade.wordGuess.attempts", { count: attempts.length })}</span>
        <span>{t("arcade.wordGuess.wins")}: <strong>{stats.wins}</strong></span>
        <span>{t("arcade.wordGuess.losses")}: <strong>{stats.losses}</strong></span>
        <span>{t("arcade.wordGuess.bestStreak")}: <strong>{stats.bestStreak}</strong></span>
        <button className="button button--quiet" onClick={newPuzzle} type="button"><RotateCcw size={14} />{t("arcade.wordGuess.newPuzzle")}</button>
      </div>
      {!dictionary && !dictionaryError && <p className="arcade-game-status" role="status">{t("arcade.wordGuess.loading")}</p>}
      <div aria-label={t("arcade.wordGuess.board")} className="word-board" role="grid" style={{ "--word-length": length } as React.CSSProperties}>
        {Array.from({ length: 6 }, (_, row) => {
          const saved = attempts[row];
          const active = row === attempts.length && !finished;
          const letters = saved ? [...saved.word] : active ? [...guess] : [];
          return <div aria-label={t("arcade.wordGuess.row", { row: row + 1 })} className="word-board__row" key={row} role="row">
            {Array.from({ length }, (_, column) => {
              const mark = saved?.marks[column];
              return <span aria-label={mark ? t(`arcade.wordGuess.${mark}`) : letters[column] ?? t("arcade.wordGuess.empty")} className={`word-board__tile${mark ? ` is-${mark}` : letters[column] ? " is-filled" : ""}`} key={column} role="gridcell">{letters[column]?.toLocaleUpperCase(wordLanguage) ?? ""}{mark && <i className="sr-only"> {t(`arcade.wordGuess.${mark}`)}</i>}</span>;
            })}
          </div>;
        })}
      </div>
      {notice && <p aria-live="polite" className="arcade-game-status">{notice}</p>}
      {finished && <button className="button button--primary word-game__again" onClick={newPuzzle} type="button">{t("arcade.wordGuess.newPuzzle")}</button>}
      <div aria-label={t("arcade.wordGuess.keyboard")} className="word-keyboard" role="group">
        {keyboard.map((row, index) => <div className="word-keyboard__row" key={index}>{[...row].map((key) => <button className="word-key" disabled={!dictionary} key={key} onClick={() => pressKey(key)} type="button">{key}</button>)}</div>)}
        <div className="word-keyboard__row"><button className="word-key word-key--wide" disabled={!dictionary} onClick={() => pressKey("ENTER")} type="button">{t("arcade.wordGuess.enter")}</button><button className="word-key word-key--wide" disabled={!dictionary} onClick={() => pressKey("⌫")} type="button">{t("arcade.wordGuess.delete")}</button></div>
      </div>
      <p className="arcade-game-hint">{t("arcade.wordGuess.hint")}</p>
    </section>
  );
}

type CanvasKind = Extract<GameId, "brick-breaker" | "geometry-runner" | "air-hockey" | "aim-trainer">;
type Difficulty = "easy" | "normal" | "hard";
type AimMode = "classic" | "moving" | "accuracy";
interface Brick { x: number; y: number; alive: boolean; hue: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number }
interface PowerUp { x: number; y: number; vy: number }
interface CanvasState {
  running: boolean;
  over: boolean;
  score: number;
  lives: number;
  level: number;
  ball: Point & { vx: number; vy: number; radius: number };
  paddleX: number;
  paddleWidth: number;
  bricks: Brick[];
  powerUps: PowerUp[];
  particles: Particle[];
  playerY: number;
  playerVy: number;
  obstacles: Array<{ x: number; width: number; height: number }>;
  distance: number;
  speed: number;
  runner: GeometryRunnerState;
  hockey: HockeyState;
  difficulty: Difficulty;
  finished: boolean;
  aimMode: AimMode;
  duration: number;
  remaining: number;
  target: Point;
  targetRadius: number;
  targetVelocity: Point;
  hits: number;
  misses: number;
  reactionTotal: number;
  reactionCount: number;
  targetBorn: number;
  sessionStarted: boolean;
  powerTime: number;
}

const CW = 800;
const CH = 500;
function makeBricks(level: number): Brick[] {
  const result: Brick[] = [];
  const rows = Math.min(8, 4 + Math.floor((level - 1) / 2));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < 10; column += 1) result.push({ x: 55 + column * 70, y: 55 + row * 25, alive: true, hue: row });
  }
  return result;
}
function newCanvasState(): CanvasState {
  const runner = createGeometryRunner(Math.floor(Math.random() * 0x100000000));
  return {
    running: false, over: false, score: 0, lives: 3, level: 1,
    ball: { x: CW / 2, y: CH - 100, vx: 210, vy: -250, radius: 8 },
    paddleX: CW / 2, paddleWidth: 100, bricks: makeBricks(1), powerUps: [], particles: [],
    playerY: runner.playerY, playerVy: runner.playerVy, obstacles: runner.obstacles, distance: runner.distance, speed: runner.speed,
    runner, hockey: createAirHockeyState(), difficulty: "normal", finished: false,
    aimMode: "classic", duration: 30, remaining: 30, target: { x: CW / 2, y: CH / 2 },
    targetRadius: 34, targetVelocity: { x: 170, y: 125 }, hits: 0, misses: 0,
    reactionTotal: 0, reactionCount: 0, targetBorn: 0, sessionStarted: false, powerTime: 0,
  };
}

function CanvasGame({ kind, palette, best, onBest, onModeBest }: Props & { kind: CanvasKind }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(newCanvasState());
  const theme = useRef(palette);
  theme.current = palette;
  const pointer = useRef<Point>({ x: CW / 2, y: CH - 70 });
  const keys = useRef(new Set<string>());
  const lastScore = useRef("");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState({ score: 0, lives: 3, level: 1, time: 0, hits: 0, misses: 0, reaction: 0 });
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [aimMode, setAimMode] = useState<AimMode>("classic");
  const [duration, setDuration] = useState(30);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const onBestRef = useRef(onBest);
  const onModeBestRef = useRef(onModeBest);
  const reportedBest = useRef(best ?? 0);
  onBestRef.current = onBest;
  onModeBestRef.current = onModeBest;
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) state.current.particles = [];
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    reportedBest.current = Math.max(reportedBest.current, best ?? 0);
  }, [best]);

  const reportBest = useCallback((value: number) => {
    if (value <= reportedBest.current) return;
    reportedBest.current = value;
    onBestRef.current(value);
  }, []);

  const refresh = useCallback(() => {
    const current = state.current;
    const reaction = current.reactionCount ? Math.round(current.reactionTotal / current.reactionCount) : 0;
    setSummary({ score: current.score, lives: current.lives, level: current.level, time: Math.max(0, Math.ceil(current.remaining)), hits: current.hits, misses: current.misses, reaction });
  }, []);

  const reset = useCallback((selectedDifficulty = difficulty, selectedMode = aimMode, selectedDuration = duration) => {
    const next = newCanvasState();
    next.difficulty = selectedDifficulty;
    next.hockey = createAirHockeyState(selectedDifficulty);
    next.aimMode = selectedMode;
    next.duration = selectedDuration;
    next.remaining = selectedDuration;
    next.target = { x: 100 + Math.random() * 600, y: 80 + Math.random() * 300 };
    next.targetBorn = performance.now();
    if (selectedMode === "accuracy") next.targetRadius = 24;
    state.current = next;
    keys.current.clear();
    pointer.current = { x: CW / 2, y: CH - 70 };
    setRunning(false);
    setIsDone(false);
    lastScore.current = "";
    refresh();
  }, [kind, difficulty, aimMode, duration, refresh]);

  useEffect(() => {
    reset();
  }, [kind]);

  const start = useCallback(() => {
    const current = state.current;
    if (current.over || current.finished) reset();
    state.current.running = true;
    if (kind === "aim-trainer") state.current.sessionStarted = true;
    setRunning(true);
    setIsDone(false);
    playArcadeSound(kind, "start");
  }, [kind, reset]);

  const pause = useCallback(() => {
    state.current.running = false;
    setRunning(false);
  }, []);

  const positionFromEvent = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: (event.clientX - rect.left) * CW / rect.width, y: (event.clientY - rect.top) * CH / rect.height };
  }, []);

  const aimClick = useCallback((point: Point) => {
    const current = state.current;
    if (!current.running || kind !== "aim-trainer") return;
    if (isAimHit(point, current.target, current.targetRadius)) {
      playArcadeSound("aim-trainer", "success");
      current.hits += 1;
      current.reactionTotal += performance.now() - current.targetBorn;
      current.reactionCount += 1;
      current.score += Math.max(10, Math.round(100 - (performance.now() - current.targetBorn) / 15));
      current.target.x = 70 + Math.random() * 660;
      current.target.y = 70 + Math.random() * 350;
      current.targetBorn = performance.now();
      refresh();
    } else {
      playArcadeSound("aim-trainer", "failure");
      current.misses += 1;
      refresh();
    }
  }, [kind, refresh]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      setError(t("arcade.canvasError"));
      return;
    }
    let frame = 0;
    let previous = 0;
    let hudTimer = 0;
    let mounted = true;
    function circle(x: number, y: number, radius: number, color: string) {
      context!.beginPath();
      context!.arc(x, y, radius, 0, Math.PI * 2);
      context!.fillStyle = color;
      context!.fill();
    }
    function draw(current: CanvasState) {
      const accent = theme.current.accent;
      const strong = theme.current.strong;
      context!.clearRect(0, 0, CW, CH);
      if (kind === "brick-breaker") {
        context!.strokeStyle = "rgba(220,230,240,.08)";
        for (let y = 25; y < CH; y += 25) { context!.beginPath(); context!.moveTo(0, y); context!.lineTo(CW, y); context!.stroke(); }
        for (const brick of current.bricks) {
          if (!brick.alive) continue;
          const shade = Math.max(0.12, 0.58 - brick.hue * 0.055);
          context!.fillStyle = `color-mix(in srgb, ${accent} ${Math.round(shade * 100)}%, #273039)`;
          context!.beginPath(); context!.roundRect(brick.x, brick.y, 62, 17, 4); context!.fill();
          context!.strokeStyle = "rgba(255,255,255,.18)"; context!.stroke();
        }
        for (const power of current.powerUps) { circle(power.x, power.y, 9, "#d8b46b"); context!.fillStyle = "#171a1d"; context!.font = "bold 12px system-ui"; context!.fillText("+", power.x - 4, power.y + 4); }
        context!.fillStyle = strong; context!.beginPath(); context!.roundRect(current.paddleX - current.paddleWidth / 2, CH - 40, current.paddleWidth, 12, 6); context!.fill();
        circle(current.ball.x, current.ball.y, current.ball.radius, "#f2f1ed");
      } else if (kind === "geometry-runner") {
        context!.fillStyle = "rgba(255,255,255,.035)";
        for (let i = 0; i < 12; i += 1) { const x = (i * 90 - current.distance * .18 % 90); context!.fillRect(x, 180 + (i % 3) * 38, 2, 2); }
        context!.fillStyle = "rgba(255,255,255,.15)"; context!.fillRect(0, CH - 48, CW, 2);
        context!.fillStyle = accent;
        context!.save(); context!.translate(100, current.playerY); context!.rotate(Math.min(.45, Math.max(-.45, current.playerVy / 1100))); context!.fillRect(-16, -28, 32, 28); context!.restore();
        context!.fillStyle = strong;
        for (const obstacle of current.obstacles) { context!.beginPath(); context!.moveTo(obstacle.x, CH - 48); context!.lineTo(obstacle.x + obstacle.width / 2, CH - 48 - obstacle.height); context!.lineTo(obstacle.x + obstacle.width, CH - 48); context!.closePath(); context!.fill(); }
        context!.fillStyle = "rgba(255,255,255,.45)"; context!.font = "12px system-ui"; context!.fillText(`${Math.floor(current.distance)} m`, 24, 30);
      } else if (kind === "air-hockey") {
        const hockey = current.hockey;
        context!.strokeStyle = "rgba(255,255,255,.25)"; context!.lineWidth = 2; context!.strokeRect(22, 18, CW - 44, CH - 36);
        context!.beginPath(); context!.moveTo(24, CH / 2); context!.lineTo(CW - 24, CH / 2); context!.stroke();
        context!.beginPath(); context!.arc(CW / 2, CH / 2, 72, 0, Math.PI * 2); context!.stroke();
        context!.fillStyle = "#df806c"; context!.fillRect(CW / 2 - 80, 0, 160, 20); context!.fillRect(CW / 2 - 80, CH - 20, 160, 20);
        circle(hockey.opponent.x, hockey.opponent.y, 26, "color-mix(in srgb, #df806c 80%, white)");
        circle(hockey.player.x, hockey.player.y, 26, strong);
        circle(hockey.puck.x, hockey.puck.y, 13, "#f0f0ec");
        context!.fillStyle = "rgba(255,255,255,.8)"; context!.font = "600 30px system-ui"; context!.textAlign = "center"; context!.fillText(String(hockey.scores[0]), CW / 2 - 55, CH / 2 - 12); context!.fillText(String(hockey.scores[1]), CW / 2 + 55, CH / 2 + 35); context!.textAlign = "left";
      } else {
        context!.fillStyle = "rgba(255,255,255,.38)"; context!.font = "13px system-ui"; context!.fillText(`${Math.ceil(current.remaining)}s`, 24, 30);
        context!.fillStyle = accent; circle(current.target.x, current.target.y, current.targetRadius, accent);
        circle(current.target.x, current.target.y, current.targetRadius * .67, "rgba(255,255,255,.86)");
        circle(current.target.x, current.target.y, current.targetRadius * .32, accent);
        context!.strokeStyle = "rgba(255,255,255,.75)"; context!.lineWidth = 1; context!.beginPath(); context!.moveTo(current.target.x - 6, current.target.y); context!.lineTo(current.target.x + 6, current.target.y); context!.moveTo(current.target.x, current.target.y - 6); context!.lineTo(current.target.x, current.target.y + 6); context!.stroke();
      }
      if (!reducedMotion) {
        for (const particle of current.particles) circle(particle.x, particle.y, Math.max(1, particle.life * 4), `color-mix(in srgb, ${accent} ${Math.round(particle.life * 100)}%, transparent)`);
      }
      if (!current.running && !current.over && !current.finished) {
        context!.fillStyle = "rgba(8,11,14,.45)"; context!.fillRect(0, 0, CW, CH);
      }
      if (current.over || current.finished) {
        context!.fillStyle = "rgba(8,11,14,.56)"; context!.fillRect(0, 0, CW, CH);
        context!.fillStyle = "#fff"; context!.font = "600 25px system-ui"; context!.textAlign = "center"; context!.fillText(current.over ? t("arcade.gameOver") : t("arcade.sessionComplete"), CW / 2, CH / 2); context!.textAlign = "left";
      }
    }
    function emitScore() {
      const current = state.current;
      const signature = `${current.score}|${current.lives}|${current.level}|${current.remaining}|${current.hits}|${current.misses}|${current.hockey.scores.join(":")}`;
      if (signature !== lastScore.current) { lastScore.current = signature; refresh(); }
    }
    function endAim() {
      const current = state.current;
      if (!current.sessionStarted || current.finished) return;
      current.finished = true; current.running = false; setRunning(false); setIsDone(true);
      playArcadeSound("aim-trainer", current.hits ? "win" : "lose");
      const accuracy = current.hits + current.misses ? Math.round(current.hits / (current.hits + current.misses) * 100) : 0;
      const modeScore = current.aimMode === "accuracy" ? accuracy : current.score;
      onModeBestRef.current(current.aimMode, modeScore);
      if (current.score > Number(lastScore.current.split("|")[0] ?? 0)) reportBest(current.score);
      emitScore();
    }
    function update(dt: number) {
      const current = state.current;
      const step = Math.min(.035, dt);
      if (kind === "brick-breaker") {
        const target = pointer.current.x;
        if (Math.abs(target - CW / 2) > 1 || pointer.current.x !== CW / 2) current.paddleX += (target - current.paddleX) * Math.min(1, step * 16);
        if (keys.current.has("ArrowLeft") || keys.current.has("a")) current.paddleX -= 420 * step;
        if (keys.current.has("ArrowRight") || keys.current.has("d")) current.paddleX += 420 * step;
        current.paddleX = Math.max(current.paddleWidth / 2, Math.min(CW - current.paddleWidth / 2, current.paddleX));
        current.ball.x += current.ball.vx * step; current.ball.y += current.ball.vy * step;
        if (current.ball.x < current.ball.radius || current.ball.x > CW - current.ball.radius) current.ball.vx *= -1;
        if (current.ball.y < current.ball.radius) current.ball.vy = Math.abs(current.ball.vy);
        if (current.ball.vy > 0 && current.ball.y + current.ball.radius >= CH - 40 && current.ball.y < CH - 26 && Math.abs(current.ball.x - current.paddleX) < current.paddleWidth / 2 + current.ball.radius) {
          const offset = (current.ball.x - current.paddleX) / (current.paddleWidth / 2);
          const speed = Math.hypot(current.ball.vx, current.ball.vy);
          current.ball.vx = offset * speed * .8; current.ball.vy = -Math.sqrt(speed * speed - current.ball.vx * current.ball.vx);
        } else if (current.ball.y > CH + 15) {
          current.lives -= 1;
          if (current.lives <= 0) {
            current.over = true; current.running = false; setRunning(false); playArcadeSound("brick-breaker", "gameOver");
          } else {
            playArcadeSound("brick-breaker", "failure");
            current.ball = { x: current.paddleX, y: CH - 70, vx: 190, vy: -240, radius: 8 };
            current.running = false; setRunning(false);
          }
          emitScore();
        }
        for (const brick of current.bricks) {
          if (!brick.alive || !circleHitsRect(current.ball, { x: brick.x, y: brick.y, width: 62, height: 17 })) continue;
          brick.alive = false; current.score += 10; current.ball.vy *= -1; playArcadeSound("brick-breaker", "score");
          if (!reducedMotion) {
            for (let i = 0; i < 8; i += 1) current.particles.push({ x: current.ball.x, y: current.ball.y, vx: (Math.random() - .5) * 180, vy: (Math.random() - .5) * 180, life: 1 });
          }
          if (Math.random() < .12) current.powerUps.push({ x: brick.x + 30, y: brick.y, vy: 90 });
          break;
        }
        current.powerUps = current.powerUps.filter((power) => {
          power.y += power.vy * step;
          if (power.y >= CH - 48 && Math.abs(power.x - current.paddleX) < current.paddleWidth / 2) { current.paddleWidth = 145; current.powerTime = 9; playArcadeSound("brick-breaker", "powerUp"); return false; }
          return power.y < CH + 10;
        });
        if (current.powerTime > 0) { current.powerTime -= step; if (current.powerTime <= 0) current.paddleWidth = 100; }
        if (current.bricks.every((brick) => !brick.alive)) {
          current.level += 1; current.bricks = makeBricks(current.level);
          const speed = Math.hypot(current.ball.vx, current.ball.vy) * 1.08;
          current.ball.vx *= speed / Math.hypot(current.ball.vx, current.ball.vy); current.ball.vy *= speed / Math.hypot(current.ball.vx, current.ball.vy);
          current.ball.x = CW / 2; current.ball.y = CH - 70; current.running = false; setRunning(false);
        }
        current.particles = current.particles.filter((particle) => { particle.x += particle.vx * step; particle.y += particle.vy * step; particle.life -= step * 1.8; return particle.life > 0; });
        reportBest(current.score);
      } else if (kind === "geometry-runner") {
        const input = keys.current.delete("jump");
        const events = advanceGeometryRunner(current.runner, step, input);
        current.playerY = current.runner.playerY;
        current.playerVy = current.runner.playerVy;
        current.obstacles = current.runner.obstacles;
        current.distance = current.runner.distance;
        current.speed = current.runner.speed;
        current.score = Math.floor(current.distance);
        if (events.jumped || events.landed) {
          const y = current.playerY;
          if (!reducedMotion) {
            for (let index = 0; index < 4; index += 1) {
              current.particles.push({ x: 100 + (Math.random() - .5) * 18, y, vx: (Math.random() - .5) * 45, vy: 20 + Math.random() * 35, life: .42 });
            }
          }
          if (events.jumped) playArcadeSound("geometry-runner", "success");
        }
        if (events.died) {
          current.over = true;
          current.running = false;
          setRunning(false);
          reportBest(current.score);
          playArcadeSound("geometry-runner", "gameOver");
        }
      } else if (kind === "air-hockey") {
        const hockey = current.hockey;
        const keyboardTarget = { ...hockey.player };
        if (keys.current.has("ArrowLeft") || keys.current.has("a")) keyboardTarget.x -= 120;
        if (keys.current.has("ArrowRight") || keys.current.has("d")) keyboardTarget.x += 120;
        if (keys.current.has("ArrowUp") || keys.current.has("w")) keyboardTarget.y -= 120;
        if (keys.current.has("ArrowDown") || keys.current.has("s")) keyboardTarget.y += 120;
        const target = keys.current.size ? keyboardTarget : pointer.current;
        const events = stepAirHockey(hockey, step, target);
        if (events.collision) playArcadeSound("air-hockey", "collision");
        if (events.goal) {
          playArcadeSound("air-hockey", "score");
          if (hockey.finished) {
            current.finished = true;
            current.running = false;
            setRunning(false);
            setIsDone(true);
            const playerWon = hockey.scores[0] >= 7;
            if (playerWon) {
              reportBest(hockey.scores[0]);
              playArcadeSound("air-hockey", "win");
            } else {
              playArcadeSound("air-hockey", "lose");
            }
          }
          emitScore();
        }
      } else if (kind === "aim-trainer") {
        if (!current.sessionStarted) return;
        current.remaining -= step;
        if (current.aimMode === "moving") {
          current.target.x += current.targetVelocity.x * step; current.target.y += current.targetVelocity.y * step;
          if (current.target.x < 50 || current.target.x > CW - 50) current.targetVelocity.x *= -1;
          if (current.target.y < 50 || current.target.y > CH - 50) current.targetVelocity.y *= -1;
        }
        if (current.remaining <= 0) { current.remaining = 0; endAim(); }
      }
      current.particles = current.particles.filter((particle) => particle.life > 0);
      hudTimer += step;
      if (hudTimer > .18) { hudTimer = 0; emitScore(); }
    }
    function loop(timestamp: number) {
      if (!mounted) return;
      if (!previous) previous = timestamp;
      const dt = Math.min(.035, (timestamp - previous) / 1000);
      previous = timestamp;
      if (state.current.running) update(dt);
      draw(state.current);
      if (state.current.running) frame = window.requestAnimationFrame(loop);
    }
    draw(state.current);
    if (running) frame = window.requestAnimationFrame(loop);
    return () => { mounted = false; window.cancelAnimationFrame(frame); };
  }, [kind, reducedMotion, running, t, refresh, reportBest]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      keys.current.add(event.key);
      keys.current.add(event.key.toLowerCase());
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) &&
        (kind === "brick-breaker" || kind === "air-hockey" || (kind === "geometry-runner" && event.key === "ArrowUp"))
      ) event.preventDefault();
      if ((event.code === "Space" || event.key === "ArrowUp") && kind === "geometry-runner") {
        event.preventDefault();
        if (!event.repeat) keys.current.add("jump");
        if (!running && !state.current.over) start();
      }
      if (event.key.toLowerCase() === "p" && kind !== "aim-trainer") { event.preventDefault(); running ? pause() : start(); }
    }
    function onKeyUp(event: KeyboardEvent) { keys.current.delete(event.key); keys.current.delete(event.key.toLowerCase()); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); keys.current.clear(); };
  }, [kind, pause, running, start]);

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    positionFromEvent(event);
    if (kind === "geometry-runner") {
      if (!running) start();
      else keys.current.add("jump");
    } else if (kind === "air-hockey" && !running && !state.current.finished) start();
    else if (kind === "aim-trainer") {
      if (!running && !state.current.finished) start();
      else aimClick(pointer.current);
    }
  }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) { positionFromEvent(event); }
  function changeDifficulty(next: Difficulty) { setDifficulty(next); reset(next, aimMode, duration); }
  function changeAimMode(next: AimMode) { setAimMode(next); reset(difficulty, next, duration); }
  function changeDuration(next: number) { setDuration(next); reset(difficulty, aimMode, next); }
  const percentage = summary.hits + summary.misses ? Math.round(summary.hits / (summary.hits + summary.misses) * 100) : 0;

  return (
    <section className="arcade-play-card canvas-game">
      <div className="arcade-score-row canvas-game__toolbar">
        {kind === "brick-breaker" && <><span>{t("arcade.score")}: <strong>{summary.score}</strong></span><span>{t("arcade.lives")}: <strong>{summary.lives}</strong></span><span>{t("arcade.level")}: <strong>{summary.level}</strong></span></>}
        {kind === "geometry-runner" && <><span>{t("arcade.distance")}: <strong>{summary.score} m</strong></span></>}
        {kind === "air-hockey" && <><span>{t("arcade.hockey.score")}: <strong>{state.current.hockey.scores[0]} : {state.current.hockey.scores[1]}</strong></span><label>{t("arcade.difficulty")}<select aria-label={t("arcade.difficulty")} value={difficulty} onChange={(event) => changeDifficulty(event.target.value as Difficulty)}>{(["easy", "normal", "hard"] as const).map((value) => <option key={value} value={value}>{t(`arcade.${value}`)}</option>)}</select></label></>}
        {kind === "aim-trainer" && <>
          <label>{t("arcade.aim.mode")}<select aria-label={t("arcade.aim.mode")} value={aimMode} onChange={(event) => changeAimMode(event.target.value as AimMode)}>{(["classic", "moving", "accuracy"] as const).map((value) => <option key={value} value={value}>{t(`arcade.aim.${value}`)}</option>)}</select></label>
          <label>{t("arcade.aim.duration")}<select aria-label={t("arcade.aim.duration")} value={duration} onChange={(event) => changeDuration(Number(event.target.value))}>{[15, 30, 60].map((value) => <option key={value} value={value}>{value}s</option>)}</select></label>
          <span>{t("arcade.hits")}: <strong>{summary.hits}</strong></span><span>{t("arcade.misses")}: <strong>{summary.misses}</strong></span><span>{t("arcade.accuracy")}: <strong>{percentage}%</strong></span><span>{t("arcade.avgReaction")}: <strong>{summary.reaction} ms</strong></span><span>{t("arcade.score")}: <strong>{summary.score}</strong></span>
        </>}
        {kind !== "aim-trainer" && <>
          <button className="button button--primary" disabled={isDone} onClick={() => running ? pause() : start()} type="button">{running ? <CirclePause size={14} /> : <CirclePlay size={14} />}{running ? t("arcade.pause") : isDone ? t("arcade.finished") : t("arcade.start")}</button>
          <button className="button button--quiet" onClick={() => reset()} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button>
        </>}
        {kind === "aim-trainer" && <>
          <button className="button button--primary" disabled={isDone} onClick={() => running ? pause() : start()} type="button">{running ? <CirclePause size={14} /> : <CirclePlay size={14} />}{running ? t("arcade.pause") : isDone ? t("arcade.finished") : t("arcade.start")}</button>
          {isDone && <button className="button button--quiet" onClick={() => reset()} type="button"><RotateCcw size={14} />{t("arcade.restart")}</button>}
        </>}
      </div>
      <canvas
        aria-label={t(`arcade.games.${kind}.board`)}
        className={`phase2-canvas phase2-canvas--${kind}`}
        height={CH}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        ref={canvasRef}
        role="img"
        width={CW}
      />
      <p className="arcade-game-hint">{t(`arcade.games.${kind}.hint`)}</p>
      {kind === "aim-trainer" && <p aria-live="polite" className="aim-summary">{t("arcade.aim.remaining")}: {summary.time}s · {t("arcade.best")}: {best ?? 0}</p>}
      {kind === "air-hockey" && isDone && <p className="arcade-game-status" role="status">{t("arcade.hockey.winner", { side: state.current.hockey.scores[0] >= 7 ? t("arcade.hockey.player") : t("arcade.hockey.opponent") })}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
