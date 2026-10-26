import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { db } from "../data/db";
import { playArcadeSound } from "../data/arcade-audio";
import { Undo2, RotateCcw, Pause, Play, Copy, Download, Upload, FlipVertical2 } from "lucide-react";
import type { ChessAiMove, ChessDifficulty } from "../data/chess-ai.worker";

type Language = "en" | "de";
type Palette = { accent: string; soft: string; strong: string };
type Props = { best?: number; onBest: (value: number) => void; palette: Palette; language: Language };
type PlayMode = "local" | "computer";
type ClockPreset = 3 | 5 | 10 | 15 | null;
type ClockValues = { w: number | null; b: number | null };
type ChessStats = { wins: number; losses: number; draws: number };
type SavedGame = {
  pgn: string;
  fen: string;
  mode: PlayMode;
  difficulty: ChessDifficulty;
  orientation: "w" | "b";
  clockPreset: ClockPreset;
  remaining: ClockValues;
  clockHistory: ClockValues[];
};

const saveKey = "chess:unfinished";
const statsKey = "chess:stats";
const initialStats: ChessStats = { wins: 0, losses: 0, draws: 0 };
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const pieceGlyph: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const pieceName: Record<string, Record<string, string>> = {
  en: { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" },
  de: { k: "König", q: "Dame", r: "Turm", b: "Läufer", n: "Springer", p: "Bauer" },
};
const copy: Record<Language, Record<string, string>> = {
  en: {
    label: "Chess game", best: "Wins", mode: "Mode", local: "Two players", computer: "Vs computer",
    difficulty: "Difficulty", easy: "Easy", normal: "Normal", hard: "Hard", clock: "Clock",
    untimed: "Untimed", orient: "Flip board", undo: "Undo", restart: "New game",
    pause: "Pause", resume: "Resume", white: "White", black: "Black", moves: "Moves",
    captures: "Captured", status: "Game status", check: "Check", checkmate: "Checkmate",
    stalemate: "Stalemate — draw", repetition: "Draw by threefold repetition",
    fifty: "Draw by the fifty-move rule", material: "Draw by insufficient material",
    draw: "Draw", whiteWins: "White wins", blackWins: "Black wins",
    whiteTurn: "White to move", blackTurn: "Black to move", thinking: "Computer is thinking…",
    paused: "Game paused", flagWhite: "White ran out of time — Black wins",
    flagBlack: "Black ran out of time — White wins", promotion: "Promote pawn to",
    queen: "Queen", rook: "Rook", bishop: "Bishop", knight: "Knight", importExport: "Import / export",
    pgn: "PGN", fen: "FEN", importPgn: "Load PGN", importFen: "Load FEN", copy: "Copy",
    copied: "Copied", invalidPgn: "That PGN could not be loaded.", invalidFen: "That FEN position is invalid.",
    loadError: "Could not load the saved game.", saveError: "Game data could not be saved locally.",
    engineError: "The computer could not make a move. Try restarting the game.",
    confirmRestart: "Start a new game? The current game will be discarded.",
    stats: "Record", wins: "Wins", losses: "Losses", draws: "Draws",
    lightSquare: "light", darkSquare: "dark", selectPromotion: "Choose a promotion piece",
    timeLeft: "time left", exportPgn: "Export PGN", exportFen: "Export FEN",
  },
  de: {
    label: "Schachpartie", best: "Siege", mode: "Modus", local: "Zu zweit", computer: "Gegen Computer",
    difficulty: "Schwierigkeit", easy: "Leicht", normal: "Normal", hard: "Schwer", clock: "Uhr",
    untimed: "Ohne Uhr", orient: "Brett drehen", undo: "Zug zurück", restart: "Neues Spiel",
    pause: "Pause", resume: "Fortsetzen", white: "Weiß", black: "Schwarz", moves: "Züge",
    captures: "Geschlagene Figuren", status: "Spielstatus", check: "Schach", checkmate: "Schachmatt",
    stalemate: "Patt — Remis", repetition: "Remis durch dreifache Stellungswiederholung",
    fifty: "Remis nach der 50-Züge-Regel", material: "Remis durch unzureichendes Material",
    draw: "Remis", whiteWins: "Weiß gewinnt", blackWins: "Schwarz gewinnt",
    whiteTurn: "Weiß ist am Zug", blackTurn: "Schwarz ist am Zug", thinking: "Computer denkt nach…",
    paused: "Partie pausiert", flagWhite: "Weiß hat die Zeit überschritten — Schwarz gewinnt",
    flagBlack: "Schwarz hat die Zeit überschritten — Weiß gewinnt", promotion: "Bauern umwandeln zu",
    queen: "Dame", rook: "Turm", bishop: "Läufer", knight: "Springer", importExport: "Import / Export",
    pgn: "PGN", fen: "FEN", importPgn: "PGN laden", importFen: "FEN laden", copy: "Kopieren",
    copied: "Kopiert", invalidPgn: "Diese PGN-Datei konnte nicht geladen werden.",
    invalidFen: "Diese FEN-Stellung ist ungültig.", loadError: "Das gespeicherte Spiel konnte nicht geladen werden.",
    saveError: "Spieldaten konnten nicht lokal gespeichert werden.",
    engineError: "Der Computer konnte keinen Zug ausführen. Starte die Partie neu.",
    confirmRestart: "Neues Spiel starten? Die aktuelle Partie wird verworfen.",
    stats: "Bilanz", wins: "Siege", losses: "Niederlagen", draws: "Remis",
    lightSquare: "hell", darkSquare: "dunkel", selectPromotion: "Umwandlungsfigur wählen",
    timeLeft: "Restzeit", exportPgn: "PGN exportieren", exportFen: "FEN exportieren",
  },
};

function emptyClocks(preset: ClockPreset): ClockValues {
  const seconds = preset === null ? null : preset * 60;
  return { w: seconds, b: seconds };
}

export function tickChessClock(values: ClockValues, turn: "w" | "b", elapsed: number): ClockValues {
  const current = values[turn];
  if (current === null || !Number.isFinite(elapsed) || elapsed <= 0) return { ...values };
  return { ...values, [turn]: Math.max(0, current - elapsed) };
}

function validClockPreset(value: unknown): value is ClockPreset {
  return value === null || value === 3 || value === 5 || value === 10 || value === 15;
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "∞";
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function parseStats(value: string | undefined): ChessStats {
  if (!value) return initialStats;
  try {
    const parsed = JSON.parse(value) as Partial<ChessStats>;
    return {
      wins: Number.isSafeInteger(parsed.wins) && parsed.wins! >= 0 ? parsed.wins! : 0,
      losses: Number.isSafeInteger(parsed.losses) && parsed.losses! >= 0 ? parsed.losses! : 0,
      draws: Number.isSafeInteger(parsed.draws) && parsed.draws! >= 0 ? parsed.draws! : 0,
    };
  } catch {
    return initialStats;
  }
}

export function restoreSavedGame(value: string): { chess: Chess; saved: SavedGame } | null {
  try {
    const saved = JSON.parse(value) as Partial<SavedGame>;
    if (typeof saved.fen !== "string" || (saved.mode !== "local" && saved.mode !== "computer")) return null;
    const chess = new Chess();
    if (typeof saved.pgn === "string" && saved.pgn.trim()) chess.loadPgn(saved.pgn);
    else chess.load(saved.fen);
    if (chess.isGameOver()) return null;
    const preset = validClockPreset(saved.clockPreset) ? saved.clockPreset : 5;
    const fallback = emptyClocks(preset);
    const remaining = saved.remaining && typeof saved.remaining === "object" ? saved.remaining : fallback;
    return {
      chess,
      saved: {
        pgn: chess.pgn(),
        fen: chess.fen(),
        mode: saved.mode,
        difficulty: saved.difficulty === "easy" || saved.difficulty === "hard" ? saved.difficulty : "normal",
        orientation: saved.orientation === "b" ? "b" : "w",
        clockPreset: preset,
        remaining: {
          w: typeof remaining.w === "number" && Number.isFinite(remaining.w) ? Math.max(0, remaining.w) : fallback.w,
          b: typeof remaining.b === "number" && Number.isFinite(remaining.b) ? Math.max(0, remaining.b) : fallback.b,
        },
        clockHistory: Array.isArray(saved.clockHistory)
          ? saved.clockHistory.slice(-2000).filter((clock): clock is ClockValues =>
            Boolean(clock && typeof clock === "object") &&
            (clock.w === null || (typeof clock.w === "number" && Number.isFinite(clock.w) && clock.w >= 0)) &&
            (clock.b === null || (typeof clock.b === "number" && Number.isFinite(clock.b) && clock.b >= 0)))
            .map((clock) => ({ w: clock.w, b: clock.b }))
          : [],
      },
    };
  } catch {
    return null;
  }
}

function kingSquare(chess: Chess, color: "w" | "b"): Square | undefined {
  return chess.findPiece({ type: "k", color })[0];
}

function statusText(
  chess: Chess,
  flagged: "w" | "b" | null,
  language: Language,
  paused: boolean,
  thinking: boolean,
): string {
  const text = copy[language];
  if (flagged) return flagged === "w" ? text.flagWhite : text.flagBlack;
  if (chess.isCheckmate()) return chess.turn() === "w" ? text.blackWins : text.whiteWins;
  if (chess.isStalemate()) return text.stalemate;
  if (chess.isThreefoldRepetition()) return text.repetition;
  if (chess.isDrawByFiftyMoves()) return text.fifty;
  if (chess.isInsufficientMaterial()) return text.material;
  if (chess.isDraw()) return text.draw;
  if (paused) return text.paused;
  if (thinking) return text.thinking;
  if (chess.isCheck()) return `${text.check} · ${chess.turn() === "w" ? text.whiteTurn : text.blackTurn}`;
  return chess.turn() === "w" ? text.whiteTurn : text.blackTurn;
}

export function ChessGame({ best = 0, onBest, palette, language }: Props) {
  const text = copy[language];
  const gameRef = useRef(new Chess());
  const workerRef = useRef<Worker | null>(null);
  const clockHistoryRef = useRef<ClockValues[]>([]);
  const requestIdRef = useRef(0);
  const requestFenRef = useRef("");
  const finishedRef = useRef("");
  const [fen, setFen] = useState(gameRef.current.fen());
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [history, setHistory] = useState<Move[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [mode, setMode] = useState<PlayMode>("computer");
  const [difficulty, setDifficulty] = useState<ChessDifficulty>("normal");
  const [clockPreset, setClockPreset] = useState<ClockPreset>(5);
  const [remaining, setRemaining] = useState<ClockValues>(() => emptyClocks(5));
  const remainingRef = useRef(remaining);
  const [paused, setPaused] = useState(false);
  const [flagged, setFlagged] = useState<"w" | "b" | null>(null);
  const [thinking, setThinking] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const [error, setError] = useState("");
  const [pgnInput, setPgnInput] = useState("");
  const [fenInput, setFenInput] = useState("");
  const [copied, setCopied] = useState("");

  const currentGameOver = gameRef.current.isGameOver() || flagged !== null;
  const currentSnapshot: SavedGame = {
    pgn: gameRef.current.pgn(),
    fen: gameRef.current.fen(),
    mode,
    difficulty,
    orientation,
    clockPreset,
    remaining,
    clockHistory: clockHistoryRef.current,
  };
  const snapshotRef = useRef(currentSnapshot);
  snapshotRef.current = currentSnapshot;
  const lastMove = history[history.length - 1];
  const checkedSquare = gameRef.current.isCheck() ? kingSquare(gameRef.current, turn) : undefined;
  const displayedRanks = orientation === "w" ? ranks : [...ranks].reverse();
  const displayedFiles = orientation === "w" ? files : [...files].reverse();
  const captures = useMemo(() => ({
    w: history.filter((move) => move.color === "w" && move.captured).map((move) => move.captured!),
    b: history.filter((move) => move.color === "b" && move.captured).map((move) => move.captured!),
  }), [history]);
  const rootStyle = {
    "--chess-accent": palette.accent,
    "--chess-accent-soft": palette.soft,
    "--chess-accent-strong": palette.strong,
  } as React.CSSProperties;

  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  const refreshPosition = useCallback(() => {
    const chess = gameRef.current;
    setFen(chess.fen());
    setTurn(chess.turn());
    setHistory(chess.history({ verbose: true }));
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([db.arcadeData.get(saveKey), db.arcadeData.get(statsKey)])
      .then(([savedRecord, statsRecord]) => {
        if (!active) return;
        setStats(parseStats(statsRecord?.value));
        if (savedRecord) {
          const restored = restoreSavedGame(savedRecord.value);
          if (restored) {
            gameRef.current = restored.chess;
            const chessState = restored.chess;
            setFen(chessState.fen());
            setTurn(chessState.turn());
            setHistory(chessState.history({ verbose: true }));
            setMode(restored.saved.mode);
            setDifficulty(restored.saved.difficulty);
            setOrientation(restored.saved.orientation);
            setClockPreset(restored.saved.clockPreset);
            setRemaining(restored.saved.remaining);
            clockHistoryRef.current = restored.saved.clockHistory;
            setPaused(true);
          } else {
            setStorageSafe(false);
            setError(text.loadError);
          }
        }
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setError(text.loadError);
          setReady(true);
        }
      });
    return () => { active = false; };
  }, [text.loadError]);

  useEffect(() => {
    try {
      const worker = new Worker(new URL("../data/chess-ai.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ id: number; move: ChessAiMove | null; error?: string }>) => {
        if (event.data.id !== requestIdRef.current || gameRef.current.fen() !== requestFenRef.current) return;
        setThinking(false);
        const move = event.data.move;
        const legal = move && gameRef.current.moves({ verbose: true }).find((candidate) =>
          candidate.from === move.from && candidate.to === move.to &&
          (candidate.promotion ?? undefined) === (move.promotion ?? undefined));
        if (!legal) {
          setError(text.engineError);
          return;
        }
        clockHistoryRef.current.push({ ...remainingRef.current });
        gameRef.current.move({ from: legal.from, to: legal.to, ...(legal.promotion ? { promotion: legal.promotion } : {}) });
        playArcadeSound("chess", "score");
        setError("");
        setStorageSafe(true);
        refreshPosition();
      };
      worker.onerror = () => {
        setThinking(false);
        setError(text.engineError);
      };
    } catch {
      setError(text.engineError);
    }
    return () => {
      requestIdRef.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [refreshPosition, text.engineError]);

  useEffect(() => {
    if (!ready || paused || currentGameOver || clockPreset === null) return;
    let lastTick = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastTick) / 1000;
      lastTick = now;
      const current = remainingRef.current;
      const balance = current[turn];
      if (balance === null) return;
      const nextClock = tickChessClock(current, turn, elapsed);
      const next = nextClock[turn]!;
      remainingRef.current = nextClock;
      if (Math.ceil(next) !== Math.ceil(balance) || next === 0) setRemaining(nextClock);
      if (next === 0) setFlagged(turn);
    }, 250);
    return () => window.clearInterval(interval);
  }, [ready, paused, currentGameOver, clockPreset, turn]);

  useEffect(() => {
    if (!ready || paused || currentGameOver || mode !== "computer" || turn !== "b") return;
    const worker = workerRef.current;
    if (!worker) {
      setError(text.engineError);
      return;
    }
    const id = ++requestIdRef.current;
    const position = gameRef.current.fen();
    requestFenRef.current = position;
    setThinking(true);
    setError("");
    worker.postMessage({ id, fen: position, difficulty });
  }, [ready, fen, mode, difficulty, paused, currentGameOver, turn, text.engineError]);

  useEffect(() => {
    if (!ready || !currentGameOver) return;
    const resultId = `${fen}:${flagged ?? ""}`;
    if (finishedRef.current === resultId) return;
    finishedRef.current = resultId;
    setPaused(true);
    setThinking(false);
    const winner = flagged ? (flagged === "w" ? "b" : "w") : gameRef.current.isCheckmate()
      ? (gameRef.current.turn() === "w" ? "b" : "w")
      : null;
    const next = winner === null
      ? { ...stats, draws: stats.draws + 1 }
      : winner === "w"
        ? { ...stats, wins: stats.wins + 1 }
        : { ...stats, losses: stats.losses + 1 };
    setStats(next);
    void db.arcadeData.put({ id: statsKey, value: JSON.stringify(next), updatedAt: Date.now() })
      .catch(() => setError(text.saveError));
    void db.arcadeData.delete(saveKey).catch(() => setError(text.saveError));
    if (winner === "w") onBest(next.wins);
  }, [ready, currentGameOver, fen, flagged, stats, onBest, text.saveError]);

  useEffect(() => {
    if (!ready || currentGameOver || !storageSafe) return;
    void db.arcadeData.put({ id: saveKey, value: JSON.stringify(snapshotRef.current), updatedAt: Date.now() })
      .catch(() => setError(text.saveError));
  }, [ready, fen, mode, difficulty, orientation, clockPreset, paused, currentGameOver, storageSafe, text.saveError]);

  useEffect(() => {
    if (!ready || paused || currentGameOver || !storageSafe || clockPreset === null) return;
    const interval = window.setInterval(() => {
      void db.arcadeData.put({ id: saveKey, value: JSON.stringify(snapshotRef.current), updatedAt: Date.now() })
        .catch(() => setError(text.saveError));
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [ready, paused, currentGameOver, storageSafe, clockPreset, text.saveError]);

  const makeMove = useCallback((from: Square, to: Square, promotion?: string) => {
    const chess = gameRef.current;
    if (paused || flagged || chess.isGameOver() || thinking || !storageSafe) return;
    try {
      clockHistoryRef.current.push({ ...remainingRef.current });
      chess.move({ from, to, ...(promotion ? { promotion } : {}) });
      playArcadeSound("chess", "score");
      setError("");
      refreshPosition();
    } catch {
      setError("");
    }
  }, [paused, flagged, thinking, storageSafe, refreshPosition]);

  const selectSquare = useCallback((square: Square) => {
    if (paused || flagged || gameRef.current.isGameOver() || thinking || !storageSafe ||
      (mode === "computer" && turn !== "w")) return;
    const chess = gameRef.current;
    if (selected) {
      const options = chess.moves({ square: selected, verbose: true }).filter((move) => move.to === square);
      if (options.length) {
        if (options.some((move) => move.promotion)) setPendingPromotion({ from: selected, to: square });
        else makeMove(selected, square);
        return;
      }
    }
    const piece = chess.get(square);
    if (piece && piece.color === chess.turn()) {
      const moves = chess.moves({ square, verbose: true });
      setSelected(square);
      setLegalTargets(moves.map((move) => move.to));
    } else {
      setSelected(null);
      setLegalTargets([]);
    }
  }, [paused, flagged, thinking, storageSafe, mode, turn, selected, makeMove]);

  function resetGame(nextMode = mode) {
    if ((history.length > 0 || !storageSafe) && !window.confirm(text.confirmRestart)) return;
    requestIdRef.current += 1;
    gameRef.current = new Chess();
    clockHistoryRef.current = [];
    setMode(nextMode);
    setFen(gameRef.current.fen());
    setTurn("w");
    setHistory([]);
    setRemaining(emptyClocks(clockPreset));
    setFlagged(null);
    setPaused(false);
    setThinking(false);
    setError("");
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    finishedRef.current = "";
  }

  function undoMove() {
    if (paused || thinking || history.length === 0 || currentGameOver) return;
    const chess = gameRef.current;
    chess.undo();
    let clockSnapshot = clockHistoryRef.current.pop();
    if (mode === "computer" && chess.turn() === "b" && chess.history().length > 0) {
      chess.undo();
      clockSnapshot = clockHistoryRef.current.pop() ?? clockSnapshot;
    }
    setFlagged(null);
    if (clockSnapshot) {
      remainingRef.current = clockSnapshot;
      setRemaining(clockSnapshot);
    }
    setPaused(false);
    finishedRef.current = "";
    refreshPosition();
  }

  function importPgn() {
    const imported = new Chess();
    try {
      imported.loadPgn(pgnInput.trim());
      if (!pgnInput.trim()) throw new Error("empty");
      gameRef.current = imported;
      clockHistoryRef.current = [];
      setFlagged(null);
      setRemaining(emptyClocks(clockPreset));
      setPaused(imported.isGameOver());
      finishedRef.current = imported.isGameOver() ? `${imported.fen()}:` : "";
      setError("");
      refreshPosition();
    } catch {
      setError(text.invalidPgn);
    }
  }

  function importFen() {
    try {
      const imported = new Chess(fenInput.trim());
      gameRef.current = imported;
      clockHistoryRef.current = [];
      setFlagged(null);
      setRemaining(emptyClocks(clockPreset));
      setPaused(imported.isGameOver());
      finishedRef.current = imported.isGameOver() ? `${imported.fen()}:` : "";
      setError("");
      refreshPosition();
    } catch {
      setError(text.invalidFen);
    }
  }

  async function copyText(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setError(language === "de" ? "Kopieren ist in diesem Browser nicht verfügbar." : "Copying is not available in this browser.");
    }
  }

  function downloadPgn() {
    const blob = new Blob([gameRef.current.pgn()], { type: "application/x-chess-pgn;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kxnodesk-chess.pgn";
    link.click();
    URL.revokeObjectURL(url);
  }

  const legalPromotions = pendingPromotion
    ? gameRef.current.moves({ square: pendingPromotion.from, verbose: true })
      .filter((move) => move.to === pendingPromotion.to && move.promotion)
    : [];
  const status = statusText(gameRef.current, flagged, language, paused, thinking);
  const blackCaptures = captures.w.map((piece) => pieceGlyph[`b${piece}`]).join(" ");
  const whiteCaptures = captures.b.map((piece) => pieceGlyph[`w${piece}`]).join(" ");

  return (
    <section className="chess-game" aria-label={text.label} style={rootStyle}>
      <style>{`
        .chess-game{--chess-board-light:color-mix(in srgb,var(--chess-accent-soft) 36%,var(--surface-2,#e9ece9));--chess-board-dark:color-mix(in srgb,var(--chess-accent) 44%,#27342f);--chess-ink:var(--text,#20262b);--chess-panel:var(--surface-1,#fff);--chess-line:var(--line,rgba(40,50,55,.15));color:var(--chess-ink);display:grid;gap:12px;max-width:980px;margin:0 auto}
        .chess-game *{box-sizing:border-box}.chess-game button,.chess-game select,.chess-game textarea{font:inherit}
        .chess-card{background:var(--chess-panel);border:1px solid var(--chess-line);border-radius:calc(var(--radius) + 2px);padding:12px;min-width:0}
        .chess-toolbar,.chess-actions,.chess-stats,.chess-clock-row,.chess-captures,.chess-export-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .chess-toolbar{justify-content:space-between}.chess-settings{display:flex;gap:8px;flex-wrap:wrap}.chess-settings label{display:grid;gap:3px;font-size:11px;color:var(--text-muted,var(--chess-ink))}
        .chess-game select,.chess-game textarea{border:1px solid var(--chess-line);border-radius:var(--radius);color:var(--chess-ink);background:var(--chess-panel);padding:6px 8px}
        .chess-actions{justify-content:flex-end}.chess-button{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--chess-line);border-radius:var(--radius);padding:7px 9px;background:var(--chess-panel);color:var(--chess-ink);cursor:pointer;font-size:12px}.chess-button:hover:not(:disabled){border-color:var(--chess-accent);background:var(--chess-accent-soft)}.chess-button:disabled{opacity:.5;cursor:not-allowed}
        .chess-button--accent{background:var(--chess-accent);border-color:var(--chess-accent);color:#fff}.chess-button--accent:hover:not(:disabled){background:var(--chess-accent-strong)}
        .chess-main{display:grid;grid-template-columns:minmax(280px, min(64vw,560px)) minmax(205px,1fr);align-items:start;gap:12px}
        .chess-board-wrap{width:100%;max-width:560px;justify-self:center}.chess-board{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));aspect-ratio:1;border:3px solid color-mix(in srgb,var(--chess-ink) 25%,transparent);border-radius:7px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.12)}
        .chess-square{border:0;position:relative;display:grid;place-items:center;aspect-ratio:1;padding:0;cursor:pointer;color:#f7f7f4}.chess-square--light{background:var(--chess-board-light)}.chess-square--dark{background:var(--chess-board-dark)}.chess-square--last{box-shadow:inset 0 0 0 999px rgba(245,204,76,.34)}.chess-square--check{box-shadow:inset 0 0 0 999px rgba(230,63,67,.48)}.chess-square--selected{outline:3px solid var(--chess-accent-strong);outline-offset:-3px;z-index:1}
        .chess-piece{font-family:"Segoe UI Symbol","Noto Sans Symbols 2",serif;font-size:clamp(25px,6.8vw,52px);line-height:1;user-select:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.42))}.chess-piece--w{color:#fff;text-shadow:0 1px 2px #24302b,0 0 3px #24302b}.chess-piece--b{color:#1f2926;text-shadow:0 1px 1px rgba(255,255,255,.55)}
        .chess-coordinate{position:absolute;font:700 9px/1 system-ui;opacity:.72;pointer-events:none}.chess-coordinate--file{right:3px;bottom:2px}.chess-coordinate--rank{left:3px;top:3px}.chess-square--light .chess-coordinate{color:#26322e}.chess-square--dark .chess-coordinate{color:#f5f7f4}
        .chess-dot{position:absolute;width:22%;height:22%;border-radius:50%;background:rgba(21,38,31,.34);pointer-events:none}.chess-square:has(.chess-piece) .chess-dot{width:90%;height:90%;background:transparent;border:4px solid rgba(21,38,31,.35)}
        .chess-side{display:grid;gap:10px;min-width:0}.chess-turn{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px}.chess-clock-row{justify-content:space-between}.chess-clock{font-variant-numeric:tabular-nums;font-size:22px;font-weight:750;letter-spacing:.04em;padding:5px 9px;border-radius:8px;background:var(--surface-2,var(--chess-board-light))}.chess-clock--active{outline:2px solid var(--chess-accent)}.chess-clock--low{color:#c52f38}.chess-status{margin:0;padding:8px 10px;border-radius:8px;background:var(--chess-accent-soft);font-size:12px;font-weight:650}.chess-stats{font-size:11px;justify-content:space-between;color:var(--text-muted,var(--chess-ink))}
        .chess-captures{min-height:22px;font-size:19px;letter-spacing:-3px}.chess-capture-label{font-size:10px;color:var(--text-muted,var(--chess-ink));letter-spacing:0}
        .chess-history{max-height:180px;overflow:auto;display:grid;grid-template-columns:38px 1fr 1fr;gap:3px 6px;font-size:12px;font-variant-numeric:tabular-nums}.chess-history span{padding:3px 4px;border-radius:4px}.chess-history__number{color:var(--text-muted,var(--chess-ink))}.chess-history__move:nth-child(4n+2),.chess-history__move:nth-child(4n+3){background:var(--surface-2,var(--chess-board-light))}
        .chess-export{display:grid;gap:10px}.chess-export h3{font-size:12px;margin:0 0 5px}.chess-export textarea{width:100%;resize:vertical;min-height:44px;font-family:ui-monospace,monospace;font-size:11px}.chess-export-actions{justify-content:flex-end}.chess-error{color:#bd2732;margin:0;font-size:12px}        .chess-modal{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:18px}.chess-modal__card{width:min(330px,100%);background:var(--chess-panel);border:1px solid var(--chess-line);border-radius:calc(var(--radius) + 2px);padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.25)}.chess-modal__card h3{margin:0 0 12px;font-size:15px}.chess-promotion{display:flex;justify-content:center;gap:8px}.chess-promotion .chess-piece{font-size:40px}
        @media(max-width:700px){.chess-main{grid-template-columns:minmax(0,1fr)}.chess-board-wrap{max-width:min(100%,520px)}.chess-side{grid-template-columns:1fr 1fr}.chess-side .chess-card{padding:9px}.chess-side .chess-history-card{grid-column:1/-1}.chess-toolbar{align-items:flex-start}.chess-actions{justify-content:flex-start}.chess-piece{font-size:clamp(26px,10vw,50px)}}
        @media(max-width:420px){.chess-settings{width:100%}.chess-settings label{flex:1}.chess-side{grid-template-columns:1fr}.chess-side .chess-history-card{grid-column:auto}.chess-card{padding:9px}.chess-button{padding:6px 7px;font-size:11px}}
      `}</style>
      <div className="chess-card">
        <div className="chess-toolbar">
          <div className="chess-settings">
            <label>{text.mode}
              <select aria-label={text.mode} onChange={(event) => resetGame(event.target.value as PlayMode)} value={mode}>
                <option value="computer">{text.computer}</option><option value="local">{text.local}</option>
              </select>
            </label>
            {mode === "computer" && <label>{text.difficulty}
              <select aria-label={text.difficulty} onChange={(event) => {
                requestIdRef.current += 1;
                setThinking(false);
                setDifficulty(event.target.value as ChessDifficulty);
              }} value={difficulty}>
                <option value="easy">{text.easy}</option><option value="normal">{text.normal}</option><option value="hard">{text.hard}</option>
              </select>
            </label>}
            <label>{text.clock}
              <select aria-label={text.clock} onChange={(event) => {
                const next = event.target.value === "untimed" ? null : Number(event.target.value) as ClockPreset;
                setClockPreset(next);
                if (history.length === 0) setRemaining(emptyClocks(next));
              }} value={clockPreset ?? "untimed"}>
                <option value="untimed">{text.untimed}</option>
                {[3, 5, 10, 15].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </label>
          </div>
          <div className="chess-actions">
            <button className="chess-button" onClick={() => setOrientation((value) => value === "w" ? "b" : "w")} title={text.orient} type="button"><FlipVertical2 size={14} />{text.orient}</button>
            <button className="chess-button" disabled={history.length === 0 || paused || thinking || currentGameOver} onClick={undoMove} type="button"><Undo2 size={14} />{text.undo}</button>
            <button className="chess-button" onClick={() => resetGame()} type="button"><RotateCcw size={14} />{text.restart}</button>
            <button className="chess-button" disabled={currentGameOver} onClick={() => {
              requestIdRef.current += 1;
              setPaused((value) => !value);
              setThinking(false);
            }} type="button">
              {paused ? <Play size={14} /> : <Pause size={14} />}{paused ? text.resume : text.pause}
            </button>
          </div>
        </div>
        <div className="chess-stats" style={{ marginTop: 8 }}>
          <span>{text.best}: {best}</span>
          <span>{text.stats}: {text.wins} {stats.wins} · {text.losses} {stats.losses} · {text.draws} {stats.draws}</span>
        </div>
      </div>

      <div className="chess-main">
        <div className="chess-board-wrap">
          <div className="chess-board" role="grid" aria-label={text.label}>
            {displayedRanks.flatMap((rank) => displayedFiles.map((file) => {
              const square = `${file}${rank}` as Square;
              const piece = gameRef.current.get(square);
              const light = (files.indexOf(file) + Number(rank)) % 2 === 0;
              const last = lastMove?.from === square || lastMove?.to === square;
              const check = checkedSquare === square;
              const target = legalTargets.includes(square);
              const label = `${piece ? `${piece.color === "w" ? text.white : text.black} ${pieceName[language][piece.type]}` : ""} ${square}`;
              return (
                <button
                  aria-label={label}
                  aria-selected={selected === square}
                  className={`chess-square chess-square--${light ? "light" : "dark"}${last ? " chess-square--last" : ""}${check ? " chess-square--check" : ""}${selected === square ? " chess-square--selected" : ""}`}
                  key={square}
                  onClick={() => selectSquare(square)}
                  role="gridcell"
                  type="button"
                >
                  {piece && <span aria-hidden="true" className={`chess-piece chess-piece--${piece.color}`}>{pieceGlyph[`${piece.color}${piece.type}`]}</span>}
                  {target && <span aria-hidden="true" className="chess-dot" />}
                  {file === displayedFiles[0] && <span aria-hidden="true" className="chess-coordinate chess-coordinate--rank">{rank}</span>}
                  {rank === displayedRanks[displayedRanks.length - 1] && <span aria-hidden="true" className="chess-coordinate chess-coordinate--file">{file}</span>}
                </button>
              );
            }))}
          </div>
        </div>
        <aside className="chess-side">
          <div className="chess-card">
            <div className="chess-clock-row">
              <span>{text.white}</span>
              <strong className={`chess-clock${turn === "w" && !paused && !currentGameOver ? " chess-clock--active" : ""}${remaining.w !== null && remaining.w < 30 ? " chess-clock--low" : ""}`}>{formatClock(remaining.w)}</strong>
            </div>
            <div className="chess-clock-row">
              <span>{text.black}</span>
              <strong className={`chess-clock${turn === "b" && !paused && !currentGameOver ? " chess-clock--active" : ""}${remaining.b !== null && remaining.b < 30 ? " chess-clock--low" : ""}`}>{formatClock(remaining.b)}</strong>
            </div>
            <p className="chess-status" aria-live="polite" role="status">{status}</p>
            <div className="chess-captures"><span className="chess-capture-label">{text.black}: </span>{blackCaptures || "—"}</div>
            <div className="chess-captures"><span className="chess-capture-label">{text.white}: </span>{whiteCaptures || "—"}</div>
          </div>
          <div className="chess-card chess-history-card">
            <div className="chess-turn"><span>{text.moves}</span><span>{history.length}</span></div>
            <div aria-label={text.moves} className="chess-history" role="list">
              {Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => (
                <div key={index} style={{ display: "contents" }}>
                  <span className="chess-history__number">{index + 1}.</span>
                  <span className="chess-history__move">{history[index * 2]?.san ?? ""}</span>
                  <span className="chess-history__move">{history[index * 2 + 1]?.san ?? ""}</span>
                </div>
              ))}
              {history.length === 0 && <span className="chess-history__number">—</span>}
            </div>
          </div>
        </aside>
      </div>

      <div className="chess-card chess-export">
        <h3>{text.importExport}</h3>
        <div>
          <h3>{text.pgn}</h3>
          <textarea aria-label={text.exportPgn} onChange={(event) => setPgnInput(event.target.value)} placeholder={gameRef.current.pgn() || text.exportPgn} rows={2} value={pgnInput} />
          <div className="chess-export-actions">
            <button className="chess-button" onClick={() => void copyText(gameRef.current.pgn(), "pgn")} type="button"><Copy size={13} />{copied === "pgn" ? text.copied : text.copy}</button>
            <button className="chess-button" onClick={downloadPgn} type="button"><Download size={13} />{text.exportPgn}</button>
            <button className="chess-button chess-button--accent" onClick={importPgn} type="button"><Upload size={13} />{text.importPgn}</button>
          </div>
        </div>
        <div>
          <h3>{text.fen}</h3>
          <textarea aria-label={text.exportFen} onChange={(event) => setFenInput(event.target.value)} placeholder={gameRef.current.fen()} rows={2} value={fenInput} />
          <div className="chess-export-actions">
            <button className="chess-button" onClick={() => void copyText(gameRef.current.fen(), "fen")} type="button"><Copy size={13} />{copied === "fen" ? text.copied : text.copy}</button>
            <button className="chess-button chess-button--accent" onClick={importFen} type="button"><Upload size={13} />{text.importFen}</button>
          </div>
        </div>
      </div>
      {error && <p className="chess-error" role="alert">{error}</p>}
      {pendingPromotion && (
        <div className="chess-modal" onClick={() => setPendingPromotion(null)} role="presentation">
          <div aria-labelledby="chess-promotion-title" aria-modal="true" className="chess-modal__card" onClick={(event) => event.stopPropagation()} role="dialog">
            <h3 id="chess-promotion-title">{text.promotion}</h3>
            <div className="chess-promotion">
              {legalPromotions.map((move) => (
                <button aria-label={text[move.promotion as "queen" | "rook" | "bishop" | "knight"]} className="chess-button" key={move.promotion} onClick={() => makeMove(move.from, move.to, move.promotion)} title={text[move.promotion as "queen" | "rook" | "bishop" | "knight"]} type="button">
                  <span className={`chess-piece chess-piece--${move.color}`}>{pieceGlyph[`${move.color}${move.promotion}`]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
