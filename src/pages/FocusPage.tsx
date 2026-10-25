import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CirclePause, CirclePlay, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createId, db, localDateKey, type FocusKind, type FocusSession } from "../data/db";

interface TimerState {
  id: string;
  kind: FocusKind;
  plannedSeconds: number;
  elapsedSeconds: number;
  startedAt: number;
  runningSince: number | null;
  taskId?: string;
}

const TIMER_SETTING = "focusTimerState";

function parseTimer(value?: string): TimerState | undefined {
  if (!value) return undefined;
  try {
    const item = JSON.parse(value) as Partial<TimerState>;
    if (
      typeof item.id === "string" &&
      (item.kind === "focus" || item.kind === "short-break" || item.kind === "long-break") &&
      typeof item.plannedSeconds === "number" &&
      typeof item.elapsedSeconds === "number" &&
      typeof item.startedAt === "number" &&
      (typeof item.runningSince === "number" || item.runningSince === null)
    ) return item as TimerState;
  } catch {
    return undefined;
  }
  return undefined;
}

function elapsedNow(timer: TimerState, now: number): number {
  return Math.min(timer.plannedSeconds, timer.elapsedSeconds + (timer.runningSince === null ? 0 : Math.floor((now - timer.runningSince) / 1000)));
}

function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function FocusPage() {
  const { t, i18n } = useTranslation();
  const timerSetting = useLiveQuery(() => db.settings.get(TIMER_SETTING), [], null);
  const sessions = useLiveQuery(() => db.focusSessions.orderBy("startedAt").reverse().limit(60).toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const [clock, setClock] = useState(Date.now());
  const [kindDraft, setKindDraft] = useState<FocusKind>("focus");
  const [minutes, setMinutes] = useState(25);
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState("");
  const [completionFailed, setCompletionFailed] = useState(false);
  const finishingId = useRef("");
  const timer = useMemo(() => parseTimer(timerSetting?.value), [timerSetting?.value]);
  const elapsed = timer ? elapsedNow(timer, clock) : 0;
  const remaining = timer ? Math.max(0, timer.plannedSeconds - elapsed) : minutes * 60;
  const today = localDateKey(new Date(clock));
  const todaysSessions = sessions.filter((session) => localDateKey(new Date(session.startedAt)) === today);
  const completedToday = todaysSessions.filter((session) => session.completed);
  const focusSecondsToday = todaysSessions.filter((session) => session.kind === "focus").reduce((total, session) => total + session.durationSeconds, 0);

  useEffect(() => {
    if (!timer?.runningSince) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer?.id, timer?.runningSince]);

  useEffect(() => {
    if (timerSetting && !timer && timerSetting.value) setError(t("focus.invalidTimer"));
  }, [timer, timerSetting, t]);

  async function persistTimer(next: TimerState) {
    await db.transaction("rw", db.settings, async () => {
      const saved = await db.settings.get(TIMER_SETTING);
      if (parseTimer(saved?.value)?.id !== next.id) throw new Error("The active timer changed in another window.");
      await db.settings.update(TIMER_SETTING, { value: JSON.stringify(next) });
    });
    setError("");
    setCompletionFailed(false);
  }

  async function startTimer() {
    if (timer) {
      try {
        if (timer.runningSince === null) await persistTimer({ ...timer, runningSince: Date.now() });
      } catch {
        setError(t("focus.saveError"));
      }
      return;
    }
    const now = Date.now();
    const next: TimerState = {
      id: createId(),
      kind: kindDraft,
      plannedSeconds: minutes * 60,
      elapsedSeconds: 0,
      startedAt: now,
      runningSince: now,
      ...(taskId ? { taskId } : {}),
    };
    try {
      await db.transaction("rw", db.settings, async () => {
        if (await db.settings.get(TIMER_SETTING)) throw new Error("A timer is already active in another window.");
        await db.settings.add({ key: TIMER_SETTING, value: JSON.stringify(next) });
      });
      setError("");
    } catch {
      setError(t("focus.saveError"));
    }
  }

  async function pauseTimer() {
    if (!timer || timer.runningSince === null) return;
    try {
      await persistTimer({ ...timer, elapsedSeconds: elapsed, runningSince: null });
    } catch {
      setError(t("focus.saveError"));
    }
  }

  async function finishTimer(current: TimerState, completed: boolean) {
    if (finishingId.current === current.id) return;
    finishingId.current = current.id;
    const endedAt = Date.now();
    const elapsedSeconds = completed ? current.plannedSeconds : elapsedNow(current, endedAt);
    const session: FocusSession = {
      id: current.id,
      kind: current.kind,
      startedAt: current.startedAt,
      endedAt,
      plannedSeconds: current.plannedSeconds,
      durationSeconds: elapsedSeconds,
      ...(current.taskId ? { taskId: current.taskId } : {}),
      completed,
    };
    try {
      await db.transaction("rw", db.focusSessions, db.settings, async () => {
        const saved = await db.settings.get(TIMER_SETTING);
        if (parseTimer(saved?.value)?.id !== current.id) throw new Error("The active timer changed in another window.");
        await db.focusSessions.add(session);
        await db.settings.delete(TIMER_SETTING);
      });
      setKindDraft(current.kind);
      setMinutes(Math.max(1, Math.round(current.plannedSeconds / 60)));
      setTaskId(current.taskId ?? "");
      setClock(Date.now());
      setError("");
      setCompletionFailed(false);
      finishingId.current = "";
    } catch {
      finishingId.current = "";
      setCompletionFailed(completed);
      setError(t("focus.saveError"));
    }
  }

  useEffect(() => {
    if (timer && timer.runningSince !== null && remaining <= 0 && !completionFailed) {
      void finishTimer(timer, true);
    }
  }, [clock, completionFailed, remaining, timer]);

  async function stopTimer() {
    if (!timer) return;
    if (elapsed <= 0) {
      try {
        await db.transaction("rw", db.settings, async () => {
          const saved = await db.settings.get(TIMER_SETTING);
          if (parseTimer(saved?.value)?.id !== timer.id) throw new Error("The active timer changed in another window.");
          await db.settings.delete(TIMER_SETTING);
        });
        setError("");
      } catch {
        setError(t("focus.saveError"));
      }
    } else {
      await finishTimer(timer, false);
    }
  }

  async function discardInvalidTimer() {
    if (!window.confirm(t("focus.confirmDiscardInvalid"))) return;
    try {
      await db.transaction("rw", db.settings, async () => {
        const saved = await db.settings.get(TIMER_SETTING);
        if (!saved || parseTimer(saved.value)) throw new Error("The timer is no longer invalid.");
        await db.settings.delete(TIMER_SETTING);
      });
      setError("");
    } catch {
      setError(t("focus.saveError"));
    }
  }

  const selectedTaskTitle = tasks.find((task) => task.id === timer?.taskId)?.title;
  const recentSessions = sessions.slice(0, 6);
  const durationLabel = (session: FocusSession) => `${Math.round(session.durationSeconds / 60)} ${t("focus.minutesShort")}`;

  return (
    <section className="feature-page focus-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.focus")}</h1><p>{t("focus.subtitle")}</p></div>
        <div className="focus-today"><strong>{completedToday.length}</strong><span>{t("focus.sessionsToday")}</span><i /><strong>{Math.round(focusSecondsToday / 60)}</strong><span>{t("focus.minutesToday")}</span></div>
      </header>

      <div className="focus-workspace">
        <section className={`focus-timer${timer?.kind === "focus" || (!timer && kindDraft === "focus") ? " focus-timer--active" : ""}`}>
          <div className="focus-mode-switch" role="group" aria-label={t("focus.timerMode")}>
            {(["focus", "short-break", "long-break"] as FocusKind[]).map((kind) => (
              <button aria-pressed={(timer?.kind ?? kindDraft) === kind} className={(timer?.kind ?? kindDraft) === kind ? "is-selected" : ""} disabled={Boolean(timer) || timerSetting === null} key={kind} onClick={() => { setKindDraft(kind); setMinutes(kind === "focus" ? 25 : kind === "short-break" ? 5 : 15); }} type="button">{t(`focus.kind.${kind}`)}</button>
            ))}
          </div>
          <div aria-label={t("focus.timeRemaining")} className="focus-clock" role="timer">{formatTimer(remaining)}</div>
          {timer && selectedTaskTitle && <p className="focus-task-context">{t("focus.workingOn", { title: selectedTaskTitle })}</p>}
          {!timer && <div className="focus-duration"><button aria-label={t("focus.reduceDuration")} disabled={minutes <= 1 || timerSetting === null} onClick={() => setMinutes((value) => Math.max(1, value - 5))} type="button">−</button><span>{minutes} {t("focus.minutesShort")}</span><button aria-label={t("focus.increaseDuration")} disabled={minutes >= 180 || timerSetting === null} onClick={() => setMinutes((value) => Math.min(180, value + 5))} type="button">+</button></div>}
          {!timer && (
            <label className="focus-task-select"><span>{t("focus.linkTask")}</span><select disabled={timerSetting === null} onChange={(event) => setTaskId(event.target.value)} value={taskId}><option value="">{t("focus.noTask")}</option>{tasks.filter((task) => !task.completed).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          )}
          <div className="focus-controls">
            {timer?.runningSince === null ? <button className="button button--primary" onClick={() => void startTimer()} type="button"><CirclePlay size={15} />{t("focus.resume")}</button> : timer ? <button className="button button--primary" onClick={() => void pauseTimer()} type="button"><CirclePause size={15} />{t("focus.pause")}</button> : <button className="button button--primary" disabled={timerSetting === null || Boolean(timerSetting?.value)} onClick={() => void startTimer()} type="button"><CirclePlay size={15} />{t("focus.start")}</button>}
            {timer && <button className="button button--quiet" onClick={() => void stopTimer()} type="button"><RotateCcw size={13} />{t("focus.stop")}</button>}
            {completionFailed && timer && <button className="button button--quiet" onClick={() => void finishTimer(timer, true)} type="button"><Check size={13} />{t("focus.saveSession")}</button>}
          </div>
          {timerSetting?.value && !timer && <button className="inline-button focus-discard" onClick={() => void discardInvalidTimer()} type="button">{t("focus.discardInvalid")}</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="focus-local-note">{t("focus.localNote")}</p>
        </section>

        <aside className="focus-history">
          <div className="section-heading"><h2>{t("focus.recent")}</h2><span>{t("focus.savedLocally")}</span></div>
          {recentSessions.length ? <div className="focus-session-list">{recentSessions.map((session) => {
            const taskTitle = tasks.find((task) => task.id === session.taskId)?.title;
            return <div className="focus-session" key={session.id}><span className={`focus-session__mark${session.completed ? " is-complete" : ""}`}>{session.completed ? <Check size={11} /> : <CirclePause size={11} />}</span><div><strong>{t(`focus.kind.${session.kind}`)}</strong><small>{new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(session.startedAt)}{taskTitle ? ` · ${taskTitle}` : ""}</small></div><time>{durationLabel(session)}</time></div>;
          })}</div> : <div className="feature-empty feature-empty--compact"><span className="feature-empty__rule" /><div><strong>{t("focus.noSessions")}</strong><p>{t("focus.noSessionsHint")}</p></div></div>}
        </aside>
      </div>
    </section>
  );
}
