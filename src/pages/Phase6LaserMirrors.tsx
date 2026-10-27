import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Lightbulb, RotateCcw, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  laserPuzzleFingerprint,
  createLaserMirrors,
  nextLaserPuzzle,
  randomLaserSeed,
  resetLaserMirrors,
  restoreLaserPuzzle,
  rotateLaserMirror,
  solveLaserPuzzle,
  traceLaser,
  undoLaserMirror,
  type LaserDifficulty,
  type LaserMirrorsState,
  type LaserPoint,
  type MirrorOrientation,
} from "../data/phase6/laser-mirrors";
import { Phase6GameFrame } from "./Phase6GameFrame";

interface Props {
  best?: number;
  onBest: (score: number) => void;
}

type LaserMode = "challenge" | "endless";

interface LaserSession {
  puzzle: LaserMirrorsState;
  orientations: MirrorOrientation[];
  history: MirrorOrientation[][];
  mode: LaserMode;
  fingerprints: string[];
}

interface LaserHint extends LaserPoint {
  orientation: MirrorOrientation;
}

const progressKey = "save:game:laser-mirrors";
const sessionKey = "save:game:laser-mirrors:session";
const difficulties: LaserDifficulty[] = ["easy", "medium", "hard", "expert"];

function isLaserDifficulty(value: string): value is LaserDifficulty {
  return difficulties.includes(value as LaserDifficulty);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoint(value: unknown, size: number): value is LaserPoint {
  return isRecord(value) && Number.isInteger(value.x) && Number.isInteger(value.y) &&
    (value.x as number) >= 0 && (value.x as number) < size &&
    (value.y as number) >= 0 && (value.y as number) < size;
}

function parseSession(value: string): { puzzle: LaserMirrorsState; mode: LaserMode; fingerprints: string[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.puzzle)) return null;
  const puzzle = data.puzzle;
  if (!Number.isInteger(puzzle.size) || (puzzle.size as number) < 6 || (puzzle.size as number) > 12 ||
      typeof puzzle.difficulty !== "string" || !difficulties.includes(puzzle.difficulty as LaserDifficulty) ||
      !Number.isInteger(puzzle.seed) || !Number.isInteger(puzzle.level) ||
      !Number.isInteger(puzzle.requiredRotations) || !Number.isInteger(puzzle.pathLength) ||
      !Array.isArray(puzzle.emitters) || !Array.isArray(puzzle.receivers) ||
      !Array.isArray(puzzle.mirrors) || !Array.isArray(puzzle.blockers) ||
      typeof puzzle.fingerprint !== "string") return null;
  const size = puzzle.size as number;
  const emitters = puzzle.emitters;
  const receivers = puzzle.receivers;
  const mirrors = puzzle.mirrors;
  const blockers = puzzle.blockers;
  if (emitters.length === 0 || emitters.some((emitter) =>
    !isRecord(emitter) || !isPoint(emitter, size) ||
    !["right", "left", "up", "down"].includes(String(emitter.direction)) ||
    !Number.isInteger(emitter.receiverIndex) ||
    (emitter.receiverIndex as number) < 0 || (emitter.receiverIndex as number) >= receivers.length)) return null;
  if (receivers.length !== emitters.length ||
      receivers.some((point) => !isPoint(point, size)) ||
      blockers.some((point) => !isPoint(point, size)) ||
      mirrors.some((mirror) => !isRecord(mirror) || !isPoint(mirror, size) ||
        (mirror.orientation !== "/" && mirror.orientation !== "\\"))) return null;
  if (puzzle.fingerprint !== laserPuzzleFingerprint(puzzle as unknown as LaserMirrorsState)) return null;
  if (!Array.isArray(data.orientations) || data.orientations.length !== mirrors.length ||
      data.orientations.some((item) => item !== "/" && item !== "\\")) return null;
  if (!Array.isArray(data.history) || data.history.some((entry) =>
    !Array.isArray(entry) || entry.length !== mirrors.length ||
    entry.some((item) => item !== "/" && item !== "\\"))) return null;
  if (data.mode !== "challenge" && data.mode !== "endless") return null;
  const mode = data.mode;
  const restored = restoreLaserPuzzle(
    { ...puzzle, history: [], complete: false } as unknown as LaserMirrorsState,
    data.orientations as MirrorOrientation[],
    data.history as MirrorOrientation[][],
  );
  const fingerprints = Array.isArray(data.fingerprints) &&
    data.fingerprints.every((fingerprint) => typeof fingerprint === "string")
    ? data.fingerprints.slice(-32)
    : [restored.fingerprint];
  if (!fingerprints.includes(restored.fingerprint)) fingerprints.push(restored.fingerprint);
  return { puzzle: restored, mode, fingerprints };
}

export function Phase6LaserMirrors({ best, onBest }: Props) {
  const { t } = useTranslation();
  const [game, setGame] = useState<LaserMirrorsState>(() => createLaserMirrors());
  const gameRef = useRef(game);
  const [unlocked, setUnlocked] = useState(1);
  const [mode, setMode] = useState<LaserMode>("challenge");
  const [fingerprints, setFingerprints] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sessionWritable, setSessionWritable] = useState(true);
  const [progressWritable, setProgressWritable] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState<LaserHint | null>(null);

  const commit = useCallback((next: LaserMirrorsState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([db.arcadeData.get(sessionKey), db.arcadeData.get(progressKey)])
      .then(([sessionRecord, progressRecord]) => {
        if (!active) return;
        if (sessionRecord) {
          const session = parseSession(sessionRecord.value);
          if (session) {
            setMode(session.mode);
            setFingerprints(session.fingerprints);
            commit(session.puzzle);
          } else {
            setSessionWritable(false);
            setError(t("arcade.phase6.laser.invalidSave"));
          }
        } else {
          setFingerprints([gameRef.current.fingerprint]);
        }
        if (progressRecord) {
          const savedProgress = Number(progressRecord.value);
          if (Number.isInteger(savedProgress) && savedProgress >= 1 && savedProgress <= 5) {
            setUnlocked(savedProgress);
          } else {
            setProgressWritable(false);
            setError(t("arcade.phase6.laser.invalidSave"));
          }
        }
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        console.error("Could not load Laser Mirrors save data.", cause);
        setError(t("arcade.phase6.laser.saveError"));
        setLoaded(true);
      });
    return () => { active = false; };
  }, [commit, t]);

  useEffect(() => {
    if (game.complete && game.level > (best ?? 0)) onBest(game.level);
  }, [best, game.complete, game.level, onBest]);

  useEffect(() => {
    if (!loaded || !progressWritable || !game.complete) return;
    const nextUnlocked = Math.min(5, Math.max(unlocked, game.level + 1));
    if (nextUnlocked === unlocked) return;
    setUnlocked(nextUnlocked);
    db.arcadeData.put({ id: progressKey, value: String(nextUnlocked), updatedAt: Date.now() })
      .catch((cause: unknown) => {
        console.error("Could not save Laser Mirrors progress.", cause);
        setError(t("arcade.phase6.laser.saveError"));
      });
  }, [game.complete, game.level, loaded, progressWritable, t, unlocked]);

  useEffect(() => {
    if (!loaded || !sessionWritable) return;
    const session: LaserSession = {
      puzzle: game,
      orientations: game.mirrors.map((mirror) => mirror.orientation),
      history: game.history,
      mode,
      fingerprints,
    };
    db.arcadeData.put({
      id: sessionKey,
      value: JSON.stringify(session),
      updatedAt: Date.now(),
    }).catch((cause: unknown) => {
      console.error("Could not save the Laser Mirrors session.", cause);
      setError(t("arcade.phase6.laser.saveError"));
    });
  }, [fingerprints, game, loaded, mode, sessionWritable, t]);

  const trace = useMemo(() => traceLaser(game), [game]);
  const beamCells = useMemo(() => {
    const cells = new Map<string, number[]>();
    trace.paths.forEach((path, beamIndex) => path.forEach(({ x, y }) => {
      const key = `${x},${y}`;
      const beams = cells.get(key) ?? [];
      if (!beams.includes(beamIndex)) beams.push(beamIndex);
      cells.set(key, beams);
    }));
    return cells;
  }, [trace]);
  const blockerCells = new Set(game.blockers.map(({ x, y }) => `${x},${y}`));
  const emitterCells = new Map(game.emitters.map((emitter, index) => [`${emitter.x},${emitter.y}`, { ...emitter, index }]));
  const receiverCells = new Map(game.receivers.map((receiver, index) => [`${receiver.x},${receiver.y}`, index]));

  const restart = () => {
    setHint(null);
    setError("");
    commit(resetLaserMirrors(gameRef.current));
  };
  const startNext = () => {
    try {
      setHint(null);
      setError("");
      const next = nextLaserPuzzle(gameRef.current, randomLaserSeed(), fingerprints);
      setFingerprints((current) => [...new Set([...current, next.fingerprint])].slice(-32));
      commit(next);
    } catch (cause) {
      console.error("Could not generate the next Laser Mirrors puzzle.", cause);
      setError(t("arcade.phase6.laser.generationError"));
    }
  };
  const selectDifficulty = (difficulty: LaserDifficulty) => {
    if (difficulty === gameRef.current.difficulty) return;
    try {
      setHint(null);
      setError("");
      const next = nextLaserPuzzle({ ...gameRef.current, difficulty }, randomLaserSeed(), fingerprints);
      setFingerprints((current) => [...new Set([...current, next.fingerprint])].slice(-32));
      commit(next);
    } catch (cause) {
      console.error("Could not generate a Laser Mirrors puzzle at this difficulty.", cause);
      setError(t("arcade.phase6.laser.generationError"));
    }
  };
  const toggleHint = () => {
    if (hint) {
      setHint(null);
      return;
    }
    const solution = solveLaserPuzzle(gameRef.current);
    const mirror = solution?.length ? gameRef.current.mirrors[solution[0]] : undefined;
    if (!mirror) {
      setError(t("arcade.phase6.laser.noHint"));
      return;
    }
    setError("");
    setHint({
      x: mirror.x,
      y: mirror.y,
      orientation: mirror.orientation === "/" ? "\\" : "/",
    });
  };

  return (
    <Phase6GameFrame
      best={best}
      error={error}
      gameId="laser-mirrors"
      gameKey="laser"
      hideActions
      hideOverlay
      onPause={() => undefined}
      onResume={() => undefined}
      onRestart={restart}
      score={Math.max(0, game.level - 1)}
      status={game.complete ? "levelComplete" : "playing"}
    >
      <div className="phase6-laser__toolbar">
        <span className="phase6-laser__level">
          {t("arcade.phase6.laser.level", { level: game.level })}
          <small>{t("arcade.phase6.laser.rotations", { count: game.requiredRotations })}</small>
        </span>
        <label className="phase6-laser__difficulty">
          <span>{t("arcade.phase6.laser.difficulty")}</span>
          <select
            disabled={!loaded}
            onChange={(event) => {
              const difficulty = event.currentTarget.value;
              if (isLaserDifficulty(difficulty)) selectDifficulty(difficulty);
            }}
            value={game.difficulty}
          >
            {difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>{t(`arcade.phase6.laser.${difficulty}`)}</option>
            ))}
          </select>
        </label>
        <div className="phase6-laser__modes" role="group" aria-label={t("arcade.phase6.laser.mode")}>
          {(["challenge", "endless"] as const).map((nextMode) => (
            <button
              aria-pressed={mode === nextMode}
              key={nextMode}
              onClick={() => setMode(nextMode)}
              type="button"
            >
              {t(`arcade.phase6.laser.${nextMode}Mode`)}
            </button>
          ))}
        </div>
        <button className="button button--quiet" disabled={!game.history.length || game.complete || !loaded} onClick={() => { setHint(null); commit(undoLaserMirror(gameRef.current)); }} type="button"><Undo2 size={13} />{t("arcade.phase6.laser.undo")}</button>
        <button className="button button--quiet" disabled={!loaded} onClick={restart} type="button"><RotateCcw size={13} />{t("arcade.phase6.laser.reset")}</button>
        <button className="button button--quiet" disabled={!loaded || game.complete} onClick={toggleHint} type="button"><Lightbulb size={13} />{t(hint ? "arcade.phase6.laser.hideHint" : "arcade.phase6.laser.hintAction")}</button>
        <button className="button button--primary" disabled={!loaded || (mode === "challenge" && !game.complete)} onClick={startNext} type="button"><ArrowRight size={13} />{t(game.complete ? "arcade.phase6.laser.next" : "arcade.phase6.laser.newPuzzle")}</button>
        {game.complete && <span className="phase6-laser__complete" role="status">{t("arcade.phase6.laser.complete")}</span>}
      </div>
      <div aria-label={t("arcade.phase6.laser.board")} className={`phase6-laser__grid phase6-laser__grid--${game.difficulty}`} role="grid" style={{ "--laser-size": game.size } as React.CSSProperties}>
        {Array.from({ length: game.size * game.size }, (_, index) => {
          const x = index % game.size;
          const y = Math.floor(index / game.size);
          const mirror = game.mirrors.find((item) => item.x === x && item.y === y);
          const key = `${x},${y}`;
          const emitter = emitterCells.get(key);
          const receiverIndex = receiverCells.get(key);
          const blocked = blockerCells.has(key);
          const beams = beamCells.get(key) ?? [];
          const hinted = Boolean(hint && hint.x === x && hint.y === y);
          const orientationLabel = mirror
            ? t(mirror.orientation === "/" ? "arcade.phase6.laser.slash" : "arcade.phase6.laser.backslash")
            : "";
          const hintInstruction = hinted && hint
            ? t("arcade.phase6.laser.hintTarget", {
              row: hint.y + 1,
              column: hint.x + 1,
              orientation: t(hint.orientation === "/" ? "arcade.phase6.laser.slash" : "arcade.phase6.laser.backslash"),
            })
            : "";
          const label = mirror
            ? t("arcade.phase6.laser.mirror", { row: y + 1, column: x + 1, orientation: orientationLabel })
            : emitter
              ? t("arcade.phase6.laser.emitter", { number: emitter.index + 1 })
              : receiverIndex !== undefined
                ? t("arcade.phase6.laser.receiver", { number: receiverIndex + 1 })
                : blocked
                  ? t("arcade.phase6.laser.blocker")
                  : t("arcade.phase6.laser.empty");
          return (
            <button
              aria-label={hintInstruction ? `${label}. ${hintInstruction}` : label}
              aria-pressed={mirror ? mirror.orientation === "/" : undefined}
              className={`phase6-laser__cell${beams.length ? " is-lit" : ""}${beams.length > 1 ? " has-crossing-beams" : ""}${mirror ? " is-mirror" : ""}${blocked ? " is-blocked" : ""}${emitter ? " is-emitter" : ""}${receiverIndex !== undefined ? " is-receiver" : ""}${hinted ? " is-hinted" : ""}`}
              data-beams={beams.join(" ")}
              disabled={!mirror || !loaded || game.complete}
              key={key}
              onClick={() => { setHint(null); commit(rotateLaserMirror(gameRef.current, x, y)); }}
              role="gridcell"
              type="button"
            >
              {mirror
                ? <i data-orientation={mirror.orientation} />
                : emitter
                  ? <span className={`phase6-laser__emitter phase6-laser__emitter--${emitter.direction}`}><b>{emitter.index + 1}</b></span>
                  : receiverIndex !== undefined
                    ? <span className="phase6-laser__receiver-mark"><b>{receiverIndex + 1}</b></span>
                    : blocked
                      ? <span className="phase6-laser__block-mark" />
                      : null}
            </button>
          );
        })}
      </div>
      {!loaded && <p className="phase6-game__hint">{t("arcade.loading")}</p>}
      {hint && <p className="phase6-laser__hint" role="status">{t("arcade.phase6.laser.hintTarget", { row: hint.y + 1, column: hint.x + 1, orientation: t(hint.orientation === "/" ? "arcade.phase6.laser.slash" : "arcade.phase6.laser.backslash") })}</p>}
      <p className="phase6-game__hint">{t("arcade.phase6.laser.hint")}</p>
    </Phase6GameFrame>
  );
}
