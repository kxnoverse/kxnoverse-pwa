import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Lightbulb, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  checkCrosswordEntry,
  createCrosswordPuzzle,
  createCrosswordSession,
  crosswordCellKey,
  revealCrosswordHint,
  seededCrosswordSeed,
  validateCrosswordSession,
  type CrosswordDifficulty,
  type CrosswordEntry,
  type CrosswordSession,
  type CrosswordStats,
} from "../data/phase6d/crossword-infinite";

const SESSION_KEY = "crossword-infinite:session";
const STATS_KEY = "crossword-infinite:stats";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIFFICULTIES: CrosswordDifficulty[] = ["easy", "medium", "hard", "expert"];

const emptyStats: CrosswordStats = { completed: 0, bestSeconds: null, totalMistakes: 0, totalHints: 0 };

function readStats(value: string | undefined): CrosswordStats | null {
  if (!value) return { ...emptyStats };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const stats = parsed as Partial<CrosswordStats>;
    if (!Number.isInteger(stats.completed) || (stats.completed ?? -1) < 0 ||
        !Number.isInteger(stats.totalMistakes) || (stats.totalMistakes ?? -1) < 0 ||
        !Number.isInteger(stats.totalHints) || (stats.totalHints ?? -1) < 0 ||
        !(stats.bestSeconds === null || (typeof stats.bestSeconds === "number" && Number.isInteger(stats.bestSeconds) && stats.bestSeconds >= 0))) return null;
    return stats as CrosswordStats;
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function entryCells(entry: CrosswordEntry): string[] {
  return Array.from({ length: entry.answer.length }, (_, index) =>
    crosswordCellKey(entry.row + (entry.direction === "down" ? index : 0), entry.column + (entry.direction === "across" ? index : 0)));
}

export function CrosswordInfinite() {
  const { t } = useTranslation();
  const [session, setSession] = useState<CrosswordSession | null>(null);
  const [stats, setStats] = useState<CrosswordStats>(emptyStats);
  const [difficulty, setDifficulty] = useState<CrosswordDifficulty>("easy");
  const [seedInput, setSeedInput] = useState("");
  const [activeEntryId, setActiveEntryId] = useState("");
  const [selectedCell, setSelectedCell] = useState("");
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const boardRef = useRef<HTMLDivElement>(null);
  const translation = useRef(t);
  translation.current = t;

  const save = useCallback((key: string, value: string) => {
    const operation = writeQueue.current.then(async () => {
      await db.arcadeData.put({ id: key, value, updatedAt: Date.now() });
    });
    writeQueue.current = operation.catch(() => {
      setFailure(translation.current("arcade.phase6d.crossword.saveError"));
    });
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([db.arcadeData.get(SESSION_KEY), db.arcadeData.get(STATS_KEY)])
      .then(([savedSession, savedStats]) => {
        if (!active) return;
        const parsedStats = readStats(savedStats?.value);
        if (!parsedStats) {
          setFailure(translation.current("arcade.phase6d.crossword.invalidSave"));
          setReady(true);
          return;
        }
        setStats(parsedStats);
        if (savedSession) {
          let parsedSession: unknown;
          try {
            parsedSession = JSON.parse(savedSession.value);
          } catch {
            parsedSession = null;
          }
          if (!validateCrosswordSession(parsedSession)) {
            setFailure(translation.current("arcade.phase6d.crossword.invalidSave"));
            setReady(true);
            return;
          }
          setSession(parsedSession);
          setDifficulty(parsedSession.puzzle.difficulty);
          setSeedInput(String(parsedSession.puzzle.seed));
          setActiveEntryId(parsedSession.puzzle.entries[0]?.id ?? "");
          const entry = parsedSession.puzzle.entries[0];
          if (entry) setSelectedCell(crosswordCellKey(entry.row, entry.column));
          setReady(true);
          return;
        }
        const seed = seededCrosswordSeed();
        const initial = createCrosswordSession(createCrosswordPuzzle("easy", seed));
        setSession(initial);
        setSeedInput(String(seed));
        setActiveEntryId(initial.puzzle.entries[0]?.id ?? "");
        const firstEntry = initial.puzzle.entries[0];
        if (firstEntry) setSelectedCell(crosswordCellKey(firstEntry.row, firstEntry.column));
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setFailure(translation.current("arcade.phase6d.crossword.saveError"));
        setReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    save(SESSION_KEY, JSON.stringify(session));
  }, [ready, save, session]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      if (!session) return;
      const end = session.completedAt ?? Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((end - session.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, session]);

  const activeEntry = useMemo(
    () => session?.puzzle.entries.find((entry) => entry.id === activeEntryId) ?? null,
    [activeEntryId, session],
  );
  const activeCells = useMemo(() => activeEntry ? entryCells(activeEntry) : [], [activeEntry]);

  function chooseCell(cellKey: string) {
    if (!session) return;
    const cell = session.puzzle.cells[cellKey];
    if (!cell) return;
    const currentFits = activeEntry && activeCells.includes(cellKey);
    const preferredId = currentFits
      ? activeEntry.id
      : (cell[activeEntry?.direction ?? "across"] ?? cell.across ?? cell.down);
    setSelectedCell(cellKey);
    if (preferredId) setActiveEntryId(preferredId);
    setFeedback("");
  }

  function moveSelection(step: -1 | 1) {
    if (!activeEntry || !activeCells.length) return;
    const index = activeCells.indexOf(selectedCell);
    const next = activeCells[Math.max(0, Math.min(activeCells.length - 1, index + step))];
    setSelectedCell(next);
  }

  function enterLetter(letter: string) {
    if (!session || session.completedAt !== null || !activeCells.includes(selectedCell)) return;
    const normalized = letter.toUpperCase();
    if (!/^[A-Z]$/.test(normalized)) return;
    setSession({ ...session, letters: { ...session.letters, [selectedCell]: normalized } });
    setFeedback("");
    moveSelection(1);
  }

  function eraseLetter() {
    if (!session || session.completedAt !== null || !activeCells.includes(selectedCell)) return;
    const letters = { ...session.letters };
    delete letters[selectedCell];
    setSession({ ...session, letters });
    setFeedback("");
  }

  function toggleDirection() {
    if (!session) return;
    const cell = session.puzzle.cells[selectedCell];
    if (!cell) return;
    const nextId = activeEntry?.direction === "across" ? cell.down : cell.across;
    if (nextId) setActiveEntryId(nextId);
  }

  function onBoardKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      eraseLetter();
    } else if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      enterLetter(event.key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      checkEntry();
    } else if (event.key === " ") {
      event.preventDefault();
      toggleDirection();
    }
  }

  function recordCompletion(next: CrosswordSession) {
    if (!session || session.completedAt !== null || next.completedAt === null) return;
    const seconds = Math.max(0, Math.floor((next.completedAt - next.startedAt) / 1000));
    const nextStats = {
      completed: stats.completed + 1,
      bestSeconds: stats.bestSeconds === null ? seconds : Math.min(stats.bestSeconds, seconds),
      totalMistakes: stats.totalMistakes + next.mistakes - session.mistakes,
      totalHints: stats.totalHints + next.hints - session.hints,
    };
    setStats(nextStats);
    save(STATS_KEY, JSON.stringify(nextStats));
    setFeedback(t("arcade.phase6d.crossword.completed"));
  }

  function checkEntry() {
    if (!session || !activeEntry || session.completedAt !== null) return;
    if (activeCells.some((cellKey) => !session.letters[cellKey])) {
      setFeedback(t("arcade.phase6d.crossword.incomplete"));
      return;
    }
    const result = checkCrosswordEntry(session, activeEntry.id);
    const next = result.session;
    setSession(next);
    if (!result.correct) setFeedback(t("arcade.phase6d.crossword.incorrect"));
    else if (next.completedAt !== null) recordCompletion(next);
    else setFeedback(t("arcade.phase6d.crossword.correct"));
  }

  function revealHint() {
    if (!session || !activeEntry || session.completedAt !== null) return;
    const next = revealCrosswordHint(session, activeEntry.id);
    if (next === session) return;
    setSession(next);
    setFeedback("");
    recordCompletion(next);
  }

  function startNewPuzzle(useEnteredSeed: boolean) {
    if (session?.completedAt === null && !window.confirm(t("arcade.phase6d.crossword.confirmNew"))) return;
    const parsedSeed = useEnteredSeed ? Number(seedInput) : Date.now();
    if (!Number.isSafeInteger(parsedSeed)) {
      setFailure(t("arcade.phase6d.crossword.generationError"));
      return;
    }
    try {
      let seed = seededCrosswordSeed(parsedSeed);
      if (!useEnteredSeed && seed === session?.puzzle.seed) seed = seededCrosswordSeed(seed + 1);
      const next = createCrosswordSession(createCrosswordPuzzle(difficulty, seed));
      setSession(next);
      setSeedInput(String(seed));
      setActiveEntryId(next.puzzle.entries[0]?.id ?? "");
      const entry = next.puzzle.entries[0];
      setSelectedCell(entry ? crosswordCellKey(entry.row, entry.column) : "");
      setFeedback(t(useEnteredSeed ? "arcade.phase6d.crossword.seedLoaded" : "arcade.phase6d.crossword.seedCreated", { seed }));
      setFailure("");
    } catch {
      setFailure(t("arcade.phase6d.crossword.generationError"));
    }
  }

  if (!ready) return <p className="arcade-loading">{t("arcade.loading")}</p>;

  return (
    <div className="phase6-game phase6d-crossword" data-game="crossword-infinite">
      <div className="phase6-game__toolbar phase6d-toolbar">
        <div className="phase6-game__stats">
          <span>{t("arcade.phase6d.crossword.elapsed")} <strong>{formatTime(elapsedSeconds)}</strong></span>
          <span>{t("arcade.phase6d.crossword.mistakes")} <strong>{session?.mistakes ?? 0}</strong></span>
          <span>{t("arcade.phase6d.crossword.hints")} <strong>{session?.hints ?? 0}</strong></span>
          <span>{t("arcade.phase6d.crossword.solvedCount")} <strong>{stats.completed}</strong></span>
        </div>
        <div className="phase6-game__actions phase6d-toolbar__actions">
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.crossword.difficulty")}</span>
            <select onChange={(event) => setDifficulty(event.target.value as CrosswordDifficulty)} value={difficulty}>
              {DIFFICULTIES.map((item) => <option key={item} value={item}>{t(`arcade.phase6d.crossword.difficulties.${item}`)}</option>)}
            </select>
          </label>
          <label className="phase6d-field phase6d-seed">
            <span>{t("arcade.phase6d.crossword.seed")}</span>
            <input onChange={(event) => setSeedInput(event.target.value)} type="number" value={seedInput} />
          </label>
          <button className="button button--quiet" onClick={() => startNewPuzzle(false)} type="button"><RotateCcw size={13} />{t("arcade.phase6d.crossword.newPuzzle")}</button>
          <button className="button button--quiet" onClick={() => startNewPuzzle(true)} type="button">{t("arcade.phase6d.crossword.useSeed")}</button>
        </div>
      </div>

      <div className="phase6d-crossword__layout">
        <section className="phase6d-panel phase6d-crossword__play">
          {session ? (
            <>
              <div
                aria-label={t("arcade.phase6d.crossword.instructions")}
                className="phase6d-crossword__board"
                onKeyDown={onBoardKeyDown}
                ref={boardRef}
                role="application"
                tabIndex={0}
                style={{ "--crossword-columns": session.puzzle.columns, "--crossword-rows": session.puzzle.rows } as React.CSSProperties}
              >
                {Array.from({ length: session.puzzle.rows * session.puzzle.columns }, (_, index) => {
                  const row = Math.floor(index / session.puzzle.columns);
                  const column = index % session.puzzle.columns;
                  const cellKey = crosswordCellKey(row, column);
                  const cell = session.puzzle.cells[cellKey];
                  if (!cell) return <span aria-hidden="true" className="phase6d-crossword__blank" key={cellKey} />;
                  const active = activeCells.includes(cellKey);
                  const entered = session.letters[cellKey] ?? "";
                  return (
                    <button
                      aria-label={`${cell.number ? `${cell.number}. ` : ""}${entered || t("arcade.phase6d.crossword.empty")}`}
                      aria-pressed={selectedCell === cellKey}
                      className={`phase6d-crossword__cell${active ? " is-active-word" : ""}${selectedCell === cellKey ? " is-selected" : ""}${entered ? " has-letter" : ""}`}
                      key={cellKey}
                      onClick={() => chooseCell(cellKey)}
                      type="button"
                    >
                      {cell.number && <span className="phase6d-crossword__number">{cell.number}</span>}
                      <strong>{entered}</strong>
                    </button>
                  );
                })}
              </div>
              <p className="phase6d-crossword__instructions">{t("arcade.phase6d.crossword.instructions")}</p>
            </>
          ) : (
            <p className="phase6d-empty">{t("arcade.phase6d.crossword.invalidSave")}</p>
          )}
        </section>

        <aside className="phase6d-crossword__side">
          <section className="phase6d-panel phase6d-crossword__active">
            <div className="phase6d-panel__heading">
              <div>
                <span>{t("arcade.phase6d.crossword.selected")}</span>
                <h2>{activeEntry ? `${activeEntry.number}. ${t(`arcade.phase6d.crossword.${activeEntry.direction}`)}` : "—"}</h2>
              </div>
              <button aria-label={t(activeEntry?.direction === "across" ? "arcade.phase6d.crossword.down" : "arcade.phase6d.crossword.across")} className="icon-button" disabled={!activeEntry} onClick={toggleDirection} type="button">
                {activeEntry?.direction === "across" ? "↓" : "→"}
              </button>
            </div>
            <p className="phase6d-crossword__clue">{activeEntry?.clue ?? t("arcade.phase6d.crossword.noActiveClue")}</p>
            <div className="phase6d-crossword__actions">
              <button className="button button--primary" disabled={!session || session.completedAt !== null || !activeEntry} onClick={checkEntry} type="button"><Check size={14} />{t("arcade.phase6d.crossword.check")}</button>
              <button className="button button--quiet" disabled={!session || session.completedAt !== null || !activeEntry} onClick={revealHint} type="button"><Lightbulb size={14} />{t("arcade.phase6d.crossword.hint")}</button>
            </div>
            <p aria-live="polite" className={`phase6d-feedback${feedback ? " is-visible" : ""}`} role={feedback && failure ? "alert" : "status"}>{failure || feedback}</p>
          </section>

          <section aria-label={t("arcade.phase6d.crossword.clues")} className="phase6d-panel phase6d-crossword__clues">
            {(["across", "down"] as const).map((direction) => (
              <div className="phase6d-crossword__clue-group" key={direction}>
                <h3>{t(`arcade.phase6d.crossword.${direction}`)}</h3>
                {session?.puzzle.entries.filter((entry) => entry.direction === direction).map((entry) => (
                  <button
                    aria-current={activeEntryId === entry.id ? "true" : undefined}
                    className={activeEntryId === entry.id ? "is-current" : ""}
                    key={entry.id}
                    onClick={() => {
                      setActiveEntryId(entry.id);
                      setSelectedCell(crosswordCellKey(entry.row, entry.column));
                      boardRef.current?.focus();
                    }}
                    type="button"
                  >
                    <strong>{entry.number}</strong><span>{entry.clue}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>

          <section aria-label={t("arcade.phase6d.crossword.keyboard")} className="phase6d-panel phase6d-crossword__keyboard">
            <div className="phase6d-crossword__keyboard-grid">
              {LETTERS.split("").map((letter) => <button key={letter} onClick={() => enterLetter(letter)} type="button">{letter}</button>)}
              <button aria-label={t("arcade.phase6d.crossword.erase")} className="phase6d-crossword__erase" onClick={eraseLetter} type="button">⌫</button>
            </div>
          </section>
          <section className="phase6d-panel phase6d-crossword__best">
            <span>{t("arcade.phase6d.crossword.best")}</span><strong>{stats.bestSeconds === null ? t("arcade.phase6d.crossword.noTime") : formatTime(stats.bestSeconds)}</strong>
          </section>
        </aside>
      </div>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>
  );
}
