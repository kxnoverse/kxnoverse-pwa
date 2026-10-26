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

const TIMER_SETTING = "focusTimerState";

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

export function TimerPage() {
  const { t } = useTranslation();
  const timerSetting = useLiveQuery(() => db.settings.get(TIMER_SETTING), [], null);
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState(25);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const finishingId = useRef("");
  const timer = parseTimer(timerSetting?.value);
  const elapsed = timer ? elapsedNow(timer, now) : 0;
  const remaining = timer ? Math.max(0, timer.plannedSeconds - elapsed) : minutes * 60;
  const ready = timerSetting !== null;
  const invalidSavedTimer = Boolean(timerSetting?.value && !timer);

  useEffect(() => {
    if (!timer || timer.runningSince === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer?.id, timer?.runningSince]);

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

  return (
    <section className="feature-page timer-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.timer")}</h1><p>{t("timer.subtitle")}</p></div>
      </header>

      <section className="simple-timer" aria-label={t("timer.title")}>
        <span className="simple-timer__eyebrow">{t("timer.title")}</span>
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="simple-timer__note">{t("timer.localNote")}</p>
      </section>
    </section>
  );
}
