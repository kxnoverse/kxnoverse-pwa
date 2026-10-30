import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Calculator,
  FileText,
  Gamepad2,
  Languages,
  ListTodo,
  MapPin,
  Moon,
  PanelsTopLeft,
  Star,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScreensaver } from "../components/Screensaver";
import { db, localDateKey } from "../data/db";
import {
  calculateScheduleStatus,
  formatDuration,
  mergeConsecutiveLessons,
  minutesOfDay,
} from "../data/schedule";
import {
  createHomePreviewDate,
  createHomePreviewFixture,
} from "../data/home-preview-fixture";
import type { HomePreviewFixture } from "../data/home-preview-fixture";
import {
  useUiStore,
  type HomeWidgetId,
} from "../stores/ui-store";

const homeWidgetOptions: {
  id: HomeWidgetId;
  icon: LucideIcon;
  href: string;
}[] = [
  { id: "tasks", icon: ListTodo, href: "/docs?section=tasks" },
  { id: "upcoming", icon: CalendarDays, href: "/calendar" },
  { id: "workspace", icon: PanelsTopLeft, href: "/workspace" },
  { id: "assistant", icon: Bot, href: "/assistant" },
  { id: "docs", icon: FileText, href: "/docs" },
  { id: "minigames", icon: Gamepad2, href: "/minigames" },
  { id: "calculator", icon: Calculator, href: "/calculator" },
  { id: "translate", icon: Languages, href: "/translate" },
];

export function HomePage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { activate: activateScreensaver } = useScreensaver();
  const isDevPreview =
    import.meta.env.DEV &&
    [window.location.search, location.search].some(
      (search) =>
        new URLSearchParams(search).get("homePreview") === "timetable",
    );
  const homeDemoData = useUiStore((state) => state.homeDemoData);
  const homeWidgets = useUiStore((state) => state.homeWidgets);
  const setHomeWidgets = useUiStore((state) => state.setHomeWidgets);
  const isDemoData = isDevPreview || homeDemoData;
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [previewData, setPreviewData] = useState<{
    now: Date;
    fixture: HomePreviewFixture;
  } | null>(null);
  const now = isDemoData ? previewData?.now ?? liveNow : liveNow;
  const storedLessons = useLiveQuery(() => db.timetable.toArray(), [], []);
  const storedSubjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const teachers = useLiveQuery(() => db.teachers.toArray(), [], []);
  const exceptions = useLiveQuery(() => db.exceptions.toArray(), [], []);
  const storedTasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const storedEvents = useLiveQuery(() => db.calendarEvents.toArray(), [], []);
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0);
  const anchor = useLiveQuery(() => db.settings.get("weekAnchor"), [], undefined);
  const profileName =
    useLiveQuery(() => db.settings.get("profileName"), [], undefined)?.value.trim() ||
    "User";
  const appearance = useUiStore((state) => state.appearance);

  useEffect(() => {
    if (!isDemoData) {
      setPreviewData(null);
      return;
    }
    const previewDate = createHomePreviewDate();
    setPreviewData({
      now: previewDate,
      fixture: createHomePreviewFixture(previewDate),
    });
  }, [isDemoData]);

  useEffect(() => {
    if (isDemoData) return;
    const interval = window.setInterval(() => setLiveNow(new Date()), 15_000);
    return () => window.clearInterval(interval);
  }, [isDemoData]);

  const lessons = isDemoData ? previewData?.fixture.timetable ?? [] : storedLessons;
  const subjects = isDemoData ? previewData?.fixture.subjects ?? [] : storedSubjects;
  const tasks = isDemoData ? previewData?.fixture.tasks ?? [] : storedTasks;
  const calendarEvents = isDemoData
    ? previewData?.fixture.calendarEvents ?? []
    : storedEvents;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const anchorDate = isDemoData
    ? localDateKey(monday)
    : anchor?.value.split("|")[0] ?? localDateKey(monday);
  const anchorType = isDemoData
    ? "A"
    : anchor?.value.split("|")[1] === "B"
      ? "B"
      : "A";
  const schedule = calculateScheduleStatus(
    now,
    lessons,
    subjects,
    teachers,
    isDemoData ? [] : exceptions,
    anchorDate,
    anchorType,
  );
  const displayEntries = mergeConsecutiveLessons(schedule.entries, 10);
  const lessonEntries = displayEntries.filter((entry) => entry.kind === "lesson");
  const activeLesson =
    schedule.current?.kind === "lesson" ? schedule.current : undefined;
  const activeBlock = activeLesson
    ? lessonEntries.find(
        (entry) =>
          entry.subjectId === activeLesson.subjectId &&
          minutesOfDay(entry.start) <= minutesOfDay(activeLesson.start) &&
          minutesOfDay(entry.end) >= minutesOfDay(activeLesson.end),
      )
    : undefined;
  const focusLesson = activeLesson ?? schedule.next;
  const focusLessonBlock = focusLesson
    ? lessonEntries.find(
        (entry) =>
          entry.subjectId === focusLesson.subjectId &&
          minutesOfDay(entry.start) <= minutesOfDay(focusLesson.start) &&
          minutesOfDay(entry.end) >= minutesOfDay(focusLesson.end),
      ) ?? focusLesson
    : undefined;
  const activeIndex = activeBlock
    ? lessonEntries.findIndex((entry) => entry.id === activeBlock.id)
    : -1;
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: appearance.hourFormat === "24" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: appearance.hourFormat === "12",
  }).format(now);
  const greetingPeriod =
    now.getHours() < 11
      ? "morning"
      : now.getHours() < 18
        ? "daytime"
        : now.getHours() < 22
          ? "evening"
          : "night";
  const upcomingTasks = tasks
    .filter((task) => !task.completed)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        (a.dueTime ?? "").localeCompare(b.dueTime ?? ""),
    )
    .slice(0, 3);
  const openTaskCount = tasks.filter((task) => !task.completed).length;
  const upcomingEvents = calendarEvents
    .filter((event) => new Date(event.endAt).getTime() >= now.getTime())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3);
  const nextTest = calendarEvents
    .filter(
      (event) =>
        event.type === "exam" &&
        new Date(event.endAt).getTime() >= now.getTime(),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const headline =
    focusLesson?.label ??
    (schedule.dayType === "break"
      ? t("home.break")
      : schedule.dayType === "free"
        ? t("home.freePeriod")
        : schedule.dayType === "before"
          ? t("home.beforeSchool", {
              time: formatDuration(
                (schedule.firstMinute ?? 0) - schedule.nowMinute,
              ),
            })
          : schedule.dayType === "after"
            ? t("home.afterSchool")
            : schedule.dayType === "weekend"
              ? t("home.weekend")
              : schedule.dayType === "holiday"
                ? t("home.holiday")
                : t("home.noSchedule"));
  const activeTimerBlock = activeLesson ? activeBlock ?? activeLesson : undefined;
  const remainingLessonMinutes = activeTimerBlock
    ? Math.max(0, minutesOfDay(activeTimerBlock.end) - schedule.nowMinute)
    : 0;
  const currentRemaining = activeTimerBlock
    ? formatDuration(remainingLessonMinutes)
    : undefined;
  const activeLessonMinutes = activeTimerBlock
    ? Math.max(
        1,
        minutesOfDay(activeTimerBlock.end) - minutesOfDay(activeTimerBlock.start),
      )
    : 0;
  const nextLessonIn = schedule.next
    ? formatDuration(
        Math.max(0, minutesOfDay(schedule.next.start) - schedule.nowMinute),
      )
    : undefined;
  const countdown = currentRemaining ?? nextLessonIn;
  const dayProgress = Math.round(schedule.dayProgress);
  const activeTimerTicks = activeLesson
    ? Math.max(
        0,
        Math.min(8, Math.ceil((remainingLessonMinutes / activeLessonMinutes) * 8)),
      )
    : 0;
  const currentEntryIndex = displayEntries.findIndex(
    (entry) => entry.id === activeBlock?.id,
  );
  const widgetTitle = (widget: HomeWidgetId) =>
    widget === "tasks" || widget === "upcoming"
      ? t(`home.${widget}`)
      : t(`nav.${widget}`);
  const advanceWidget = (slot: 0 | 1) => {
    const current = homeWidgets[slot];
    const other = homeWidgets[slot === 0 ? 1 : 0];
    const currentIndex = homeWidgetOptions.findIndex(
      (option) => option.id === current,
    );
    const next = Array.from({ length: homeWidgetOptions.length }, (_, offset) =>
      homeWidgetOptions[(currentIndex + offset + 1) % homeWidgetOptions.length],
    ).find((option) => option.id !== other);
    if (!next) {
      console.error("Could not find an available Home widget to switch to.");
      return;
    }
    setHomeWidgets(
      slot === 0
        ? [next.id, homeWidgets[1]]
        : [homeWidgets[0], next.id],
    );
  };
  const renderSecondaryWidget = (widget: HomeWidgetId, slot: 0 | 1) => {
    const option = homeWidgetOptions.find((item) => item.id === widget);
    if (!option) {
      console.error(`Unknown Home widget: ${widget}`);
      return null;
    }
    const WidgetIcon = option.icon;
    const isTasks = widget === "tasks";
    const isUpcoming = widget === "upcoming";
    const count = isTasks
      ? openTaskCount
      : isUpcoming
        ? upcomingEvents.length
        : undefined;
    const headingId = `home-widget-${slot}-heading`;
    return (
      <section
        className="home-ref-list nm-raised"
        aria-labelledby={headingId}
        key={slot}
      >
        <header>
          <h2 id={headingId}>{widgetTitle(widget)}</h2>
          {count !== undefined && (
            <span className="nm-well doto">{String(count).padStart(2, "0")}</span>
          )}
          <div className="home-ref-widget-actions">
            {(isTasks || isUpcoming) && (
              <Link
                className="nm-well"
                to={option.href}
                aria-label={isTasks ? t("home.openTasks") : t("home.openCalendar")}
              >
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            )}
            <button
              className="home-ref-widget-switch nm-well"
              type="button"
              aria-label={t("home.switchWidget", { widget: widgetTitle(widget) })}
              title={t("home.switchWidget", { widget: widgetTitle(widget) })}
              onClick={() => advanceWidget(slot)}
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        {isTasks ? (
          upcomingTasks.length > 0 ? (
            <ul>
              {upcomingTasks.map((task) => (
                <li key={task.id}>
                  <Link to="/docs?section=tasks">
                    <span className="home-ref-task-check nm-well" aria-hidden="true" />
                    <strong>{task.title}</strong>
                    <time>
                      {new Intl.DateTimeFormat(i18n.language, {
                        month: "short",
                        day: "numeric",
                      }).format(new Date(`${task.dueDate}T12:00:00`))}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("home.noTasks")}</p>
          )
        ) : isUpcoming ? (
          upcomingEvents.length > 0 ? (
            <ul>
              {upcomingEvents.map((event) => (
                <li key={event.id}>
                  <Link to="/calendar">
                    <span className="home-ref-event-date nm-well">
                      <strong>
                        {new Intl.DateTimeFormat(i18n.language, {
                          day: "2-digit",
                        }).format(new Date(event.startAt))}
                      </strong>
                      <small>
                        {new Intl.DateTimeFormat(i18n.language, {
                          month: "short",
                        }).format(new Date(event.startAt))}
                      </small>
                    </span>
                    <span className="home-ref-event-copy">
                      <strong>{event.title}</strong>
                      <small>
                        {event.type === "exam"
                          ? t("calendar.exam")
                          : new Intl.DateTimeFormat(i18n.language, {
                              weekday: "short",
                            }).format(new Date(event.startAt))}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("home.noUpcoming")}</p>
          )
        ) : (
          <div className="home-ref-app-widget">
            <div
              className="home-ref-widget-preview"
              data-widget={widget}
              aria-hidden="true"
            >
              {widget === "workspace" && (
                <div className="home-ref-widget-preview__workspace">
                  <span className="home-ref-preview-workspace-rail">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="home-ref-preview-workspace-head">
                    <b>My workspace</b>
                    <i />
                  </span>
                  <span className="home-ref-preview-workspace-canvas">
                    <i><b>Ideas</b><em /></i>
                    <i><b>Today</b><em /></i>
                    <i><b>Plan</b><em /></i>
                  </span>
                </div>
              )}
              {widget === "assistant" && (
                <div className="home-ref-widget-preview__chat">
                  <span className="home-ref-preview-ai"><WidgetIcon size={9} /> KXNO AI</span>
                  <span className="home-ref-preview-message is-user">Help me plan</span>
                  <span className="home-ref-preview-message is-assistant">Let’s organize your day.</span>
                  <span className="home-ref-preview-prompt">Ask anything…</span>
                </div>
              )}
              {widget === "docs" && (
                <div className="home-ref-widget-preview__docs">
                  <span className="home-ref-preview-doc-page">
                    <small>MY NOTES</small>
                    <strong>Study plan</strong>
                    <i />
                    <i />
                    <i />
                    <em />
                    <i />
                  </span>
                  <span className="home-ref-preview-doc-rail"><i /><i /><i /></span>
                </div>
              )}
              {widget === "minigames" && (
                <div className="home-ref-widget-preview__game">
                  <small>QUICK PLAY</small>
                  <span className="home-ref-preview-game-board">
                    {Array.from({ length: 9 }, (_, index) => (
                      <i key={index}>{index === 4 ? "✦" : ""}</i>
                    ))}
                  </span>
                  <span className="home-ref-preview-game-label">Memory match</span>
                </div>
              )}
              {widget === "calculator" && (
                <div className="home-ref-widget-preview__calculator">
                  <span className="home-ref-preview-calculation">12 × 4 <strong>48</strong></span>
                  <span className="home-ref-preview-keypad">
                    {["7", "8", "9", "4", "5", "6", "1", "2", "3", "÷", "0", "+"].map((key) => (
                      <i key={key}>{key}</i>
                    ))}
                  </span>
                </div>
              )}
              {widget === "translate" && (
                <div className="home-ref-widget-preview__translate">
                  <span className="home-ref-preview-language"><b>EN</b><i>Good morning</i></span>
                  <ChevronRight size={13} />
                  <span className="home-ref-preview-language"><b>DE</b><i>Guten Morgen</i></span>
                </div>
              )}
            </div>
            <div className="home-ref-app-widget-copy">
              <p>{t(`home.widgetDescriptions.${widget}`)}</p>
              <Link to={option.href}>
                {t("home.openWidget", { widget: widgetTitle(widget) })}
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </section>
    );
  };
  return (
    <section className="home-page home-page--enter home-reference">
      <header className="home-ref-masthead">
        <div className="home-ref-heading">
          <p className="home-ref-eyebrow">
            <span className="home-ref-live-dot" />
            <span>{date}</span>
            {isDemoData && (
              <span
                className="home-ref-preview"
                role="status"
              >
                {t(previewData ? "home.previewData" : "home.previewLoading")}
              </span>
            )}
          </p>
          <h1>
            {t(
              `home.greeting.${greetingPeriod}${profileName ? "Named" : ""}`,
              profileName ? { name: profileName } : undefined,
            )}
          </h1>
        </div>
        <nav className="home-ref-header-actions" aria-label={t("home.workspace")}>
          <Link to="/calendar">
            <CalendarDays size={14} aria-hidden="true" />
            <span>{t("nav.calendar")}</span>
          </Link>
          <button type="button" onClick={activateScreensaver}>
            <Moon size={14} aria-hidden="true" />
            <span>{t("screensaver.enter")}</span>
          </button>
          <Link to="/docs?section=tasks">
            <ListTodo size={14} aria-hidden="true" />
            <span>{t("nav.tasks")}</span>
          </Link>
          <Link to="/docs?section=notes">
            <FileText size={14} aria-hidden="true" />
            <span>{t("nav.notes")}</span>
            <strong>{noteCount}</strong>
          </Link>
          <Link to="/timer">
            <Timer size={14} aria-hidden="true" />
            <span>{t("nav.timer")}</span>
          </Link>
        </nav>
        <time className="home-ref-clock nm-inset" aria-label={time}>
          <span>{time}</span>
        </time>
      </header>

      <div className="home-ref-top">
        <section
          className="home-ref-hero glass"
          aria-labelledby="home-hero-heading"
          style={
            focusLesson
              ? ({ "--lesson-color": focusLesson.color } as CSSProperties)
              : undefined
          }
        >
          <div className="home-ref-hero-copy">
            <p className="home-ref-hero-label">
              <span className="home-ref-live-dot" />
              {activeLesson
                ? t("home.current")
                : focusLesson
                  ? t("home.next")
                  : t("home.title")}
              {countdown && (
                <span className="home-ref-remaining">
                  ·{" "}
                  {activeLesson
                    ? t("home.remaining", { time: countdown })
                    : t("home.startsIn", { time: countdown })}
                </span>
              )}
            </p>
            <h2 id="home-hero-heading">
              {isDemoData && !previewData
                ? t("home.previewLoading")
                : headline}
            </h2>
            {focusLesson && focusLessonBlock && (
              <>
                <div className="home-ref-hero-meta">
                  <span>
                    <Clock3 size={12} aria-hidden="true" />
                    {focusLessonBlock.start} – {focusLessonBlock.end}
                  </span>
                  {focusLessonBlock.room && (
                    <span>
                      <MapPin size={12} aria-hidden="true" />
                      {t("home.room", { room: focusLessonBlock.room })}
                    </span>
                  )}
                  <span>
                    {t("home.lessonCount", {
                      number:
                        lessonEntries.findIndex(
                          (entry) =>
                            entry.id === (activeBlock?.id ?? focusLesson.id),
                        ) + 1,
                      count: lessonEntries.length,
                    })}
                  </span>
                </div>
                {lessonEntries.length > 0 && (
                  <div className="home-ref-progress">
                    <div
                      className="home-ref-progress-segments"
                      role="img"
                      aria-label={`${t("home.progress")}: ${dayProgress}%`}
                    >
                      {lessonEntries.map((entry, index) => {
                        const complete =
                          index < activeIndex ||
                          (activeIndex === -1 &&
                            minutesOfDay(entry.end) <= schedule.nowMinute);
                        const current = entry.id === activeBlock?.id;
                        const blockDuration =
                          minutesOfDay(entry.end) - minutesOfDay(entry.start);
                        const blockProgress = current
                          ? Math.round(
                              Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((schedule.nowMinute -
                                    minutesOfDay(entry.start)) /
                                    blockDuration) *
                                    100,
                                ),
                              ),
                            )
                          : 0;
                        return (
                          <span
                            className={[
                              "nm-inset--sm",
                              complete && "is-complete",
                              current && "is-current",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={entry.id}
                          >
                            <i
                              style={{
                                width: current
                                  ? `${blockProgress}%`
                                  : complete
                                    ? "100%"
                                    : "0%",
                              }}
                            />
                          </span>
                        );
                      })}
                    </div>
                    <div className="home-ref-progress-labels">
                      <span>{schedule.firstMinute !== undefined ? `${String(Math.floor(schedule.firstMinute / 60)).padStart(2, "0")}:${String(schedule.firstMinute % 60).padStart(2, "0")}` : ""}</span>
                      <span>
                        {t("home.dayLessonCount", { count: lessonEntries.length })}
                      </span>
                      <span>{schedule.lastMinute !== undefined ? `${String(Math.floor(schedule.lastMinute / 60)).padStart(2, "0")}:${String(schedule.lastMinute % 60).padStart(2, "0")}` : ""}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="home-ref-countdown" aria-hidden="true">
            <svg
              className="home-ref-countdown__ticks"
              viewBox="0 0 100 100"
              focusable="false"
            >
              <circle className="home-ref-countdown__track" cx="50" cy="50" r="46" />
              {Array.from({ length: 48 }, (_, index) => (
                <line
                  className={
                    index < activeTimerTicks
                      ? "home-ref-countdown__tick is-active"
                      : "home-ref-countdown__tick is-inactive"
                  }
                  key={index}
                  x1="50"
                  x2="50"
                  y1="1.8"
                  y2="3"
                  transform={`rotate(${(index * 360) / 48} 50 50)`}
                />
              ))}
            </svg>
            <span>
              <strong>{countdown ?? "—"}</strong>
            </span>
          </div>
        </section>

        <aside className="home-ref-stats" aria-label={t("home.widgets")}>
          <Link className="home-ref-stat nm-raised--sm" to="/timetable">
            <span className="home-ref-stat-icon nm-well">
              <CalendarDays size={15} aria-hidden="true" />
            </span>
            <span className="home-ref-stat-copy">
              <small>{t("home.lessonsToday")}</small>
              <strong>{String(lessonEntries.length).padStart(2, "0")}</strong>
            </span>
          </Link>
          <Link className="home-ref-stat nm-raised--sm" to="/docs?section=tasks">
            <span className="home-ref-stat-icon nm-well">
              <Check size={16} aria-hidden="true" />
            </span>
            <span className="home-ref-stat-copy">
              <small>{t("home.openTasks")}</small>
              <strong>{String(openTaskCount).padStart(2, "0")}</strong>
            </span>
          </Link>
          <Link className="home-ref-stat home-ref-stat--test nm-raised--sm" to="/calendar">
            <span className="home-ref-stat-icon home-ref-stat-icon--accent nm-well">
              <Star size={15} aria-hidden="true" />
            </span>
            <span className="home-ref-stat-copy">
              <small>{t("home.nextTest")}</small>
              <strong>
                {nextTest
                  ? `${new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(new Date(nextTest.startAt))} · ${nextTest.title}`
                  : t("home.noUpcoming")}
              </strong>
            </span>
          </Link>
        </aside>
      </div>

      <div className="home-ref-lower">
        <section
          className="home-ref-schedule nm-raised"
          aria-labelledby="home-schedule-heading"
        >
          <header className="home-ref-section-heading">
            <div>
              <h2 id="home-schedule-heading">{t("home.schedule")}</h2>
            </div>
            <Link
              to="/timetable"
              aria-label={t("home.setupTimetable")}
              title={t("home.setupTimetable")}
              className="nm-well"
            >
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </header>
          {isDemoData && !previewData ? (
            <div className="home-ref-empty" role="status">
              {t("home.previewLoading")}
            </div>
          ) : schedule.entries.length > 0 ? (
            <>
              <div className="home-ref-lesson-head" aria-hidden="true">
                <span>{t("home.time")}</span>
                <span className="home-ref-lesson-number-heading">#</span>
                <span>{t("timetable.subject")}</span>
                <span>{t("home.status")}</span>
              </div>
              <ol className="home-ref-lesson-list">
                {displayEntries.map((entry, index) => {
                  const previous = displayEntries[index - 1];
                  const gapMinutes =
                    previous?.kind === "lesson" && entry.kind === "lesson"
                      ? minutesOfDay(entry.start) - minutesOfDay(previous.end)
                      : 0;
                  const lessonNumber =
                    entry.kind === "lesson"
                      ? lessonEntries.findIndex((item) => item.id === entry.id) + 1
                      : undefined;
                  const isCurrent = entry.id === activeBlock?.id;
                  const isPast =
                    !isCurrent && minutesOfDay(entry.end) <= schedule.nowMinute;
                  const isBeforeCurrent =
                    currentEntryIndex >= 0 && index < currentEntryIndex;
                  return (
                    <Fragment key={entry.id}>
                      {gapMinutes >= 15 && (
                        <li
                          className={`home-ref-break${currentEntryIndex >= 0 && index <= currentEntryIndex ? " is-before-current" : ""}`}
                          aria-hidden="true"
                        >
                          <span className="home-ref-break-label">
                            {t("home.break")} · {formatDuration(gapMinutes)}
                          </span>
                          <span className="home-ref-break-trail" />
                        </li>
                      )}
                      {entry.kind === "break" ? (
                        <li
                          className={`home-ref-break${currentEntryIndex >= 0 && index < currentEntryIndex ? " is-before-current" : ""}`}
                        >
                          <span className="home-ref-break-label">
                            {t("home.break")} ·{" "}
                            {formatDuration(
                              minutesOfDay(entry.end) - minutesOfDay(entry.start),
                            )}
                          </span>
                          <span className="home-ref-break-trail" />
                        </li>
                      ) : (
                        <li
                          className={[
                            "home-ref-lesson",
                            isCurrent && "is-current",
                            isPast && "is-past",
                            isBeforeCurrent && "is-before-current",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{ "--lesson-color": entry.color } as CSSProperties}
                          aria-current={isCurrent ? "time" : undefined}
                        >
                          <div className="home-ref-lesson-time">
                            <time>{entry.start}</time>
                            <span>{entry.end}</span>
                          </div>
                          <span
                            className={`home-ref-lesson-number nm-well${lessonNumber && lessonNumber >= 10 ? " is-two-digit" : ""}`}
                          >
                            {lessonNumber ?? "–"}
                          </span>
                          <div className="home-ref-lesson-copy">
                            <strong>
                              {entry.label || t(`timetable.${entry.kind}`)}
                            </strong>
                            {(entry.room || entry.teacher?.name) && (
                              <span>
                                {entry.room
                                  ? t("home.room", { room: entry.room })
                                  : entry.teacher?.name}
                              </span>
                            )}
                          </div>
                          <span className={`home-ref-lesson-status${isCurrent ? " nm-status--current" : isPast ? " nm-status--done" : " nm-status--upcoming"}`}>
                            {isPast && <Check size={12} aria-hidden="true" />}
                            {isCurrent
                              ? t("home.current")
                              : isPast
                                ? t("home.done")
                                : t("home.upcoming")}
                          </span>
                        </li>
                      )}
                    </Fragment>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="home-ref-empty">
              <span>
                {schedule.dayType === "weekend"
                  ? t("home.weekend")
                  : schedule.dayType === "holiday"
                    ? t("home.holiday")
                    : lessons.length === 0
                      ? t("home.noSchedule")
                      : t("home.noLessons")}
              </span>
              {lessons.length === 0 &&
                schedule.dayType !== "weekend" &&
                schedule.dayType !== "holiday" && (
                  <Link to="/timetable">{t("home.addFirst")}</Link>
                )}
            </div>
          )}
        </section>

        <aside className="home-ref-secondary" aria-label={t("home.widgets")}>
          {renderSecondaryWidget(homeWidgets[0], 0)}
          {renderSecondaryWidget(homeWidgets[1], 1)}
        </aside>
      </div>
    </section>
  );
}
