import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { db, localDateKey } from "../data/db";
import { useUiStore } from "../stores/ui-store";
import {
  calculateScheduleStatus,
  formatDuration,
  mergeConsecutiveLessons,
  minutesOfDay,
} from "../data/schedule";

const INACTIVITY_DELAY = 5 * 60 * 1000;

function getAccentTextColor(accent: string): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(accent);
  if (!match) return "#0b0b0c";
  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => `${digit}${digit}`).join("")
      : match[1];
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#0b0b0c" : "#ffffff";
}

interface ScreensaverContextValue {
  isActive: boolean;
  activate: () => void;
  dismiss: () => void;
}

const ScreensaverContext = createContext<ScreensaverContextValue | null>(null);

function isFormControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select, [role='textbox']") ||
      target.isContentEditable ||
      target.closest("[contenteditable='true']") !== null)
  );
}

export function ScreensaverProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isActive, setIsActive] = useState(false);
  const isGame = pathname.startsWith("/minigames");

  const activate = useCallback(() => setIsActive(true), []);
  const dismiss = useCallback(() => setIsActive(false), []);

  useEffect(() => {
    if (isActive || isGame) return;

    let timer: number | undefined;
    let focusTimer: number | undefined;
    let pointerDown = false;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const schedule = () => {
      clearTimer();
      if (
        document.hidden ||
        pointerDown ||
        isFormControl(document.activeElement)
      ) {
        return;
      }
      timer = window.setTimeout(activate, INACTIVITY_DELAY);
    };
    const onPointerDown = () => {
      pointerDown = true;
      clearTimer();
    };
    const onPointerUp = () => {
      pointerDown = false;
      schedule();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isFormControl(event.target)) clearTimer();
      else schedule();
    };
    const onFocusOut = () => {
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = undefined;
        schedule();
      }, 0);
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearTimer();
      else {
        pointerDown = false;
        schedule();
      }
    };

    window.addEventListener("pointermove", schedule, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("keydown", schedule);
    window.addEventListener("click", schedule);
    window.addEventListener("wheel", schedule, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();

    return () => {
      clearTimer();
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      window.removeEventListener("pointermove", schedule);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", schedule);
      window.removeEventListener("click", schedule);
      window.removeEventListener("wheel", schedule);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activate, isActive, isGame]);

  useEffect(() => {
    if (!isActive) return;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [isActive]);

  const value = useMemo(
    () => ({ isActive, activate, dismiss }),
    [activate, dismiss, isActive],
  );

  return (
    <ScreensaverContext.Provider value={value}>
      {children}
    </ScreensaverContext.Provider>
  );
}

export function useScreensaver(): ScreensaverContextValue {
  const context = useContext(ScreensaverContext);
  if (!context) {
    throw new Error("useScreensaver must be used inside ScreensaverProvider.");
  }
  return context;
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };
    const scheduleNextMinute = () => {
      clearTimer();
      if (document.hidden) return;
      const current = new Date();
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleNextMinute();
      }, 60_000 - current.getSeconds() * 1_000 - current.getMilliseconds());
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearTimer();
      else {
        setNow(new Date());
        scheduleNextMinute();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleNextMinute();
    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return now;
}

type TransitionPhase = "entering" | "visible" | "exiting";

export function ScreensaverOverlay() {
  const { isActive } = useScreensaver();
  return isActive ? <ActiveScreensaver /> : null;
}

function ActiveScreensaver() {
  const { t, i18n } = useTranslation();
  const { dismiss } = useScreensaver();
  const now = useMinuteClock();
  const [phase, setPhase] = useState<TransitionPhase>("entering");
  const rootRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const exitTimerRef = useRef<number | undefined>(undefined);

  const lessons = useLiveQuery(() => db.timetable.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const teachers = useLiveQuery(() => db.teachers.toArray(), [], []);
  const exceptions = useLiveQuery(() => db.exceptions.toArray(), [], []);
  const anchor = useLiveQuery(
    () => db.settings.get("weekAnchor"),
    [],
    undefined,
  );
  const profileName =
    useLiveQuery(
      () => db.settings.get("profileName"),
      [],
      undefined,
    )?.value.trim() || "User";
  const appearance = useUiStore((state) => state.appearance);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      setPhase("visible");
      rootRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
      }
    },
    [],
  );

  const finishExit = useCallback(() => {
    if (exitTimerRef.current !== undefined) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = undefined;
    }
    dismiss();
    const previousFocus = previousFocusRef.current;
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }, [dismiss]);

  const requestExit = useCallback(() => {
    if (phase === "exiting") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finishExit();
      return;
    }
    setPhase("exiting");
    exitTimerRef.current = window.setTimeout(finishExit, 800);
  }, [finishExit, phase]);

  const onTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (
      event.target === event.currentTarget &&
      event.propertyName === "transform" &&
      phase === "exiting"
    ) {
      finishExit();
    }
  };

  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const schedule = calculateScheduleStatus(
    now,
    lessons,
    subjects,
    teachers,
    exceptions,
    anchor?.value.split("|")[0] ?? localDateKey(monday),
    anchor?.value.split("|")[1] === "B" ? "B" : "A",
  );
  const todayLessons = mergeConsecutiveLessons(schedule.entries, 10).filter(
    (entry) => entry.kind === "lesson",
  );
  const currentLesson =
    schedule.current?.kind === "lesson" ? schedule.current : undefined;
  const nextLesson = schedule.next;
  const focusLesson = currentLesson ?? nextLesson;
  const focusBlock = focusLesson
    ? todayLessons.find(
        (entry) =>
          entry.subjectId === focusLesson.subjectId &&
          minutesOfDay(entry.start) <= minutesOfDay(focusLesson.start) &&
          minutesOfDay(entry.end) >= minutesOfDay(focusLesson.end),
      )
    : undefined;
  const focusRemaining = currentLesson
    ? Math.max(0, minutesOfDay(currentLesson.end) - schedule.nowMinute)
    : nextLesson
      ? Math.max(0, minutesOfDay(nextLesson.start) - schedule.nowMinute)
      : undefined;
  const detail = focusRemaining === undefined
    ? null
    : currentLesson
      ? t("home.remaining", { time: formatDuration(focusRemaining) })
      : t("home.startsIn", { time: formatDuration(focusRemaining) });
  const greetingPeriod =
    now.getHours() < 11
      ? "morning"
      : now.getHours() < 18
        ? "daytime"
        : now.getHours() < 22
          ? "evening"
          : "night";
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
    .format(now)
    .replace(",", " ·");
  const timeFormatter = new Intl.DateTimeFormat(i18n.language, {
    hour: appearance.hourFormat === "24" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: appearance.hourFormat === "12",
  });
  const timeParts = timeFormatter.formatToParts(now);

  return (
    <section
      aria-label={t("screensaver.active")}
      className={`screensaver screensaver--${phase}`}
      onClick={requestExit}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          requestExit();
        }
      }}
      onTransitionEnd={onTransitionEnd}
      ref={rootRef}
      role="group"
      style={
        {
          "--screensaver-on-accent": getAccentTextColor(appearance.accent),
        } as CSSProperties
      }
      tabIndex={0}
    >
      <div aria-hidden="true" className="screensaver__lighting" />
      <header className="screensaver__heading">
        <p className="screensaver__eyebrow">
          <span className="screensaver__dot" />
          <span>{date}</span>
        </p>
        <h1>
          {t(
            `home.greeting.${greetingPeriod}Named`,
            profileName ? { name: profileName } : undefined,
          )}
        </h1>
      </header>

      <div aria-label={timeFormatter.format(now)} className="screensaver__clock" aria-live="off">
        {timeParts.map((part, index) =>
          part.type === "literal" && part.value.includes(":") ? (
            <span className="screensaver__clock-separator" key={`${part.type}-${index}`}>
              {part.value}
            </span>
          ) : (
            <span key={`${part.type}-${index}`}>{part.value}</span>
          ),
        )}
      </div>

      <div className="screensaver__bottom">
        <section
          aria-label={t("screensaver.today")}
          className="screensaver__lesson-panel"
        >
          <div className="screensaver__lesson-heading">
            <span className="screensaver__eyebrow">
              <span className="screensaver__dot" />
              {t("screensaver.today")}
            </span>
            {detail && <span className="screensaver__detail">{detail}</span>}
          </div>
          <div className="screensaver__lesson-list">
            {todayLessons.length > 0 ? (
              todayLessons.slice(0, 5).map((lesson) => (
                <span
                  className={`screensaver__lesson-chip${lesson.id === focusBlock?.id ? " is-highlighted" : ""}`}
                  key={lesson.id}
                >
                  {lesson.label}
                </span>
              ))
            ) : (
              <span className="screensaver__no-lessons">
                {t("screensaver.noLessons")}
              </span>
            )}
          </div>
        </section>
        <footer className="screensaver__footer">
          <span>{t("screensaver.exitHint")}</span>
          <span>KXNO DESK · MADE BY KXNO (SHERO)</span>
        </footer>
      </div>
    </section>
  );
}
