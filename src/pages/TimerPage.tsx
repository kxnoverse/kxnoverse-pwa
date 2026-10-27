import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CirclePause, CirclePlay, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db, createId } from "../data/db";

interface TimerState {
  id: string;
  plannedSeconds: number;
  elapsedSeconds: number;
  startedAt: number;
  runningSince: number | null;
}

interface StopwatchState {
  elapsedMs: number;
  runningSince: number | null;
}

const TIMER_SETTING = "focusTimerState";
const STOPWATCH_SETTING = "stopwatchState";

function parseTimer(value?: string): TimerState | undefined {
  if (!value) return undefined;
  try {
    const item = JSON.parse(value) as Partial<TimerState>;
    if (
      typeof item.id === "string" &&
      Number.isSafeInteger(item.plannedSeconds) &&
      Number.isSafeInteger(item.elapsedSeconds) &&
      typeof item.startedAt === "number" &&
      (typeof item.runningSince === "number" || item.runningSince === null)
    ) return item as TimerState;
  } catch {
    return undefined;
  }
  return undefined;
}

function elapsedNow(timer: TimerState, now: number): number {
  return Math.min(
    timer.plannedSeconds,
    timer.elapsedSeconds + (timer.runningSince === null ? 0 : Math.floor((now - timer.runningSince) / 1000)),
  );
}

function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function parseStopwatch(value?: string): StopwatchState | undefined {
  if (!value) return undefined;
  try {
    const item = JSON.parse(value) as Partial<StopwatchState>;
    if (
      Number.isSafeInteger(item.elapsedMs) &&
      item.elapsedMs! >= 0 &&
      (typeof item.runningSince === "number" || item.runningSince === null)
    ) return item as StopwatchState;
  } catch {
    return undefined;
  }
  return undefined;
}

function elapsedStopwatch(stopwatch: StopwatchState | undefined, now: number): number {
  if (!stopwatch) return 0;
  return stopwatch.elapsedMs + (stopwatch.runningSince === null ? 0 : Math.max(0, now - stopwatch.runningSince));
}

function formatStopwatch(totalMs: number): string {
  const tenths = Math.floor(totalMs / 100);
  const seconds = Math.floor(tenths / 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`;
}

export function TimerPage() {
  const { t } = useTranslation();
  const timerSetting = useLiveQuery(() => db.settings.get(TIMER_SETTING), [], null);
  const stopwatchSetting = useLiveQuery(() => db.settings.get(STOPWATCH_SETTING), [], null);
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState(45);
  const [mode, setMode] = useState<"countdown" | "stopwatch">("countdown");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const finishingId = useRef("");
  const timer = parseTimer(timerSetting?.value);
  const stopwatch = parseStopwatch(stopwatchSetting?.value);
  const elapsed = timer ? elapsedNow(timer, now) : 0;
  const stopwatchElapsed = elapsedStopwatch(stopwatch, now);
  const remaining = timer ? Math.max(0, timer.plannedSeconds - elapsed) : minutes * 60;
  const ready = timerSetting !== null;
  const invalidSavedTimer = Boolean(timerSetting?.value && !timer);
  const invalidSavedStopwatch = Boolean(stopwatchSetting?.value && !stopwatch);

  useEffect(() => {
    if ((!timer || timer.runningSince === null) && (!stopwatch || stopwatch.runningSince === null)) return;
    const interval = window.setInterval(
      () => setNow(Date.now()),
      mode === "stopwatch" ? 100 : 1000,
    );
    return () => window.clearInterval(interval);
  }, [mode, timer?.id, timer?.runningSince, stopwatch?.runningSince]);

  async function saveTimer(next: TimerState) {
    await db.transaction("rw", db.settings, async () => {
      const saved = await db.settings.get(TIMER_SETTING);
      if (parseTimer(saved?.value)?.id !== next.id) throw new Error("The active timer changed in another window.");
      await db.settings.update(TIMER_SETTING, { value: JSON.stringify(next) });
    });
  }

  async function clearTimer(expectedId?: string) {
    await db.transaction("rw", db.settings, async () => {
      const saved = await db.settings.get(TIMER_SETTING);
      if (expectedId && parseTimer(saved?.value)?.id !== expectedId) return;
      await db.settings.delete(TIMER_SETTING);
    });
  }

  useEffect(() => {
    if (!timer || timer.runningSince === null || remaining > 0 || finishingId.current === timer.id) return;
    finishingId.current = timer.id;
    void clearTimer(timer.id).then(() => {
      setCompleted(true);
      setError("");
    }).catch(() => {
      setError(t("timer.saveError"));
    }).finally(() => {
      finishingId.current = "";
    });
  }, [remaining, timer, t]);

  async function toggleTimer() {
    if (!ready || invalidSavedTimer) return;
    setCompleted(false);
    try {
      if (timer) {
        if (timer.runningSince === null) {
          await saveTimer({ ...timer, runningSince: Date.now() });
        } else {
          await saveTimer({ ...timer, elapsedSeconds: elapsed, runningSince: null });
        }
      } else {
        const startedAt = Date.now();
        const next: TimerState = {
          id: createId(),
          plannedSeconds: minutes * 60,
          elapsedSeconds: 0,
          startedAt,
          runningSince: startedAt,
        };
        await db.transaction("rw", db.settings, async () => {
          if (await db.settings.get(TIMER_SETTING)) throw new Error("A timer is already active in another window.");
          await db.settings.add({ key: TIMER_SETTING, value: JSON.stringify(next) });
        });
      }
      setNow(Date.now());
      setError("");
    } catch {
      setError(t("timer.saveError"));
    }
  }

  async function resetTimer() {
    try {
      await clearTimer();
      setCompleted(false);
      setError("");
      setNow(Date.now());
    } catch {
      setError(t("timer.saveError"));
    }
  }

  async function toggleStopwatch() {
    if (!ready) return;
    try {
      const startedAt = Date.now();
      const next: StopwatchState = stopwatch
        ? {
            elapsedMs: elapsedStopwatch(stopwatch, startedAt),
            runningSince: stopwatch.runningSince === null ? startedAt : null,
          }
        : { elapsedMs: 0, runningSince: startedAt };
      await db.settings.put({ key: STOPWATCH_SETTING, value: JSON.stringify(next) });
      setNow(startedAt);
      setError("");
    } catch {
      setError(t("timer.saveError"));
    }
  }

  async function resetStopwatch() {
    try {
      await db.settings.delete(STOPWATCH_SETTING);
      setNow(Date.now());
      setError("");
    } catch {
      setError(t("timer.saveError"));
    }
  }

  return (
    <section className="feature-page timer-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.timer")}</h1><p>{t("timer.subtitle")}</p></div>
      </header>

      <div className="segmented-control timer-mode" aria-label={t("timer.mode")}>
        {(["countdown", "stopwatch"] as const).map((nextMode) => (
          <button
            aria-pressed={mode === nextMode}
            className={mode === nextMode ? "is-selected" : ""}
            key={nextMode}
            onClick={() => { setMode(nextMode); setError(""); }}
            type="button"
          >{t(`timer.${nextMode}`)}</button>
        ))}
      </div>

      <section className="simple-timer" aria-label={t(mode === "countdown" ? "timer.title" : "timer.stopwatch")}>
        <span className="simple-timer__eyebrow">{t(`timer.${mode}`)}</span>
        {mode === "countdown" ? (
          <>
            <div className={`simple-timer__clock${timer?.runningSince !== null && timer ? " is-running" : ""}`} role="timer" aria-label={t("timer.remaining")}>
              {formatTimer(remaining)}
            </div>
            {!timer && (
              <>
                <label className="simple-timer__duration">
                  <span>{t("timer.duration")}</span>
                  <input
                    aria-label={t("timer.duration")}
                    disabled={!ready || invalidSavedTimer}
                    max={180}
                    min={1}
                    onChange={(event) => setMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 1)))}
                    type="number"
                    value={minutes}
                  />
                  <span>{t("timer.minutes")}</span>
                </label>
                <div className="simple-timer__presets" aria-label={t("timer.presets")}>
                  {[15, 25, 45].map((value) => (
                    <button
                      aria-pressed={minutes === value}
                      className={minutes === value ? "is-selected" : ""}
                      disabled={!ready || invalidSavedTimer}
                      key={value}
                      onClick={() => setMinutes(value)}
                      type="button"
                    >{value}</button>
                  ))}
                </div>
              </>
            )}
            {timer && <p className="simple-timer__state">{t(timer.runningSince === null ? "timer.paused" : "timer.running")}</p>}
            <div className="simple-timer__controls">
              <button className="button button--primary" disabled={!ready || invalidSavedTimer} onClick={() => void toggleTimer()} type="button">
                {timer?.runningSince !== null && timer
                  ? <><CirclePause size={15} />{t("timer.pause")}</>
                  : <><CirclePlay size={15} />{timer ? t("timer.resume") : t("timer.start")}</>}
              </button>
              {(timer || invalidSavedTimer) && <button className="button button--quiet" onClick={() => void resetTimer()} type="button"><RotateCcw size={14} />{t("timer.reset")}</button>}
            </div>
            {completed && <p className="simple-timer__message" role="status">{t("timer.completed")}</p>}
          </>
        ) : (
          <>
            <div className={`simple-timer__clock simple-timer__clock--stopwatch${stopwatch?.runningSince !== null && stopwatch ? " is-running" : ""}`} role="timer" aria-label={t("timer.stopwatch")}>
              {formatStopwatch(stopwatchElapsed)}
            </div>
            <p className="simple-timer__state">{t(stopwatch?.runningSince !== null && stopwatch ? "timer.running" : "timer.paused")}</p>
            <div className="simple-timer__controls">
              <button className="button button--primary" disabled={!ready || invalidSavedStopwatch} onClick={() => void toggleStopwatch()} type="button">
                {stopwatch?.runningSince !== null && stopwatch
                  ? <><CirclePause size={15} />{t("timer.pause")}</>
                  : <><CirclePlay size={15} />{t(stopwatch ? "timer.resume" : "timer.startStopwatch")}</>}
              </button>
              {(stopwatch || invalidSavedStopwatch) && <button className="button button--quiet" onClick={() => void resetStopwatch()} type="button"><RotateCcw size={14} />{t("timer.reset")}</button>}
            </div>
            {invalidSavedStopwatch && <p className="form-error" role="alert">{t("timer.invalidStopwatch")}</p>}
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </section>
  );
}
