import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, CalendarDays, Clock3, FileText, ListTodo, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db, localDateKey } from "../data/db";
import { calculateScheduleStatus, formatDuration, getCycleWeek, minutesOfDay } from "../data/schedule";
import { useUiStore } from "../stores/ui-store";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  const lessons = useLiveQuery(() => db.timetable.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const teachers = useLiveQuery(() => db.teachers.toArray(), [], []);
  const exceptions = useLiveQuery(() => db.exceptions.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const calendarEvents = useLiveQuery(() => db.calendarEvents.toArray(), [], []);
  const noteCount = useLiveQuery(() => db.notes.count(), [], 0);
  const anchor = useLiveQuery(() => db.settings.get("weekAnchor"), [], undefined);
  const profileName = useLiveQuery(() => db.settings.get("profileName"), [], undefined)?.value.trim() || "User";
  const appearance = useUiStore((state) => state.appearance);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const anchorDate = anchor?.value.split("|")[0] ?? localDateKey(monday);
  const anchorType = anchor?.value.split("|")[1] === "B" ? "B" : "A";
  const weekType = getCycleWeek(now, anchorDate, anchorType);
  const schedule = calculateScheduleStatus(
    now,
    lessons,
    subjects,
    teachers,
    exceptions,
    anchorDate,
    anchorType,
  );
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
  const greetingPeriod = now.getHours() < 11 ? "morning" : now.getHours() < 18 ? "daytime" : now.getHours() < 22 ? "evening" : "night";
  const upcomingTasks = tasks.filter((task) => !task.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "").localeCompare(b.dueTime ?? "")).slice(0, 3);
  const upcomingEvents = calendarEvents.filter((event) => new Date(event.endAt).getTime() >= now.getTime()).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 3);

  const headline =
    schedule.dayType === "lesson" && schedule.current?.kind === "lesson"
      ? schedule.current.label
      : schedule.dayType === "break"
        ? t("home.break")
        : schedule.dayType === "free"
          ? t("home.freePeriod")
          : schedule.dayType === "before"
            ? t("home.beforeSchool", { time: formatDuration((schedule.firstMinute ?? 0) - schedule.nowMinute) })
            : schedule.dayType === "after"
              ? t("home.afterSchool")
              : schedule.dayType === "weekend"
                ? t("home.weekend")
                : schedule.dayType === "holiday"
                  ? t("home.holiday")
                  : t("home.noSchedule");

  const currentRemaining =
    schedule.current && schedule.endMinute !== undefined
      ? formatDuration(schedule.endMinute - schedule.nowMinute)
      : undefined;
  const currentProgress = Math.round(schedule.lessonProgress);
  const dayProgress = Math.round(schedule.dayProgress);
  const nextLessonIn = schedule.next
    ? formatDuration(
        Math.max(
          0,
          Number(schedule.next.start.slice(0, 2)) * 60 +
            Number(schedule.next.start.slice(3)) -
            schedule.nowMinute,
        ),
      )
    : undefined;

  return (
    <section className="home-page home-page--enter">
      <header className="home-heading">
        <div>
          <h1>{t(`home.greeting.${greetingPeriod}${profileName ? "Named" : ""}`, profileName ? { name: profileName } : undefined)}</h1>
          <p>{date}</p>
        </div>
        <time className="home-clock" aria-label={time}>
          <Clock3 size={17} aria-hidden="true" />
          <span>{time}</span>
        </time>
      </header>

      <div className={`school-overview${schedule.firstMinute === undefined ? " school-overview--empty" : ""}`}>
        <div className="school-overview__main">
          <div className="school-overview__state">
            <span className={`state-dot state-dot--${schedule.dayType}`} />
            <span>{t(schedule.current ? "home.current" : "home.title")}</span>
          </div>
          <h2>{headline}</h2>
          {schedule.current && schedule.dayType === "lesson" && (
            <div className="lesson-context">
              {schedule.current.teacher?.name && <span>{schedule.current.teacher.name}</span>}
              {schedule.current.room && <span>{schedule.current.room}</span>}
              <span>{schedule.current.start} – {schedule.current.end}</span>
            </div>
          )}
          {schedule.current && currentRemaining && (
            <p className="school-overview__remaining">{t("home.remaining", { time: currentRemaining })}</p>
          )}
          {schedule.current && (
            <div className="progress-track progress-track--lesson" aria-label={`${t("home.current")}: ${currentProgress}%`}>
              <span style={{ width: `${currentProgress}%`, backgroundColor: schedule.current.color }} />
            </div>
          )}
          {!schedule.current && schedule.dayType === "empty" && (
            <Link className="text-action" to="/timetable">
              {lessons.length ? t("home.noLessons") : t("home.addFirst")} <ArrowUpRight size={14} />
            </Link>
          )}
          {schedule.next && nextLessonIn && (
            <p className="next-lesson">
              <span>{t("home.next")}</span>
              <strong style={{ color: schedule.next.color }}>{schedule.next.label}</strong>
              <span>{t("home.startsIn", { time: nextLessonIn })}</span>
            </p>
          )}
          {(schedule.dayType === "weekend" || schedule.dayType === "holiday") && (
            <span className="school-overview__quiet">{date}</span>
          )}
        </div>
        {schedule.firstMinute !== undefined && (
          <div className="school-overview__side">
          <div className="day-progress-heading">
            <span>{t("home.progress")}</span>
            {schedule.firstMinute !== undefined && <strong>{dayProgress}%</strong>}
          </div>
          <div className="progress-track" aria-label={`${t("home.progress")}: ${dayProgress}%`}>
            <span style={{ width: `${dayProgress}%` }} />
          </div>
          {schedule.firstMinute !== undefined && (
            <div className="school-times">
              <span>{`${String(Math.floor(schedule.firstMinute / 60)).padStart(2, "0")}:${String(schedule.firstMinute % 60).padStart(2, "0")}`}</span>
              <span>{`${String(Math.floor((schedule.lastMinute ?? 0) / 60)).padStart(2, "0")}:${String((schedule.lastMinute ?? 0) % 60).padStart(2, "0")}`}</span>
            </div>
          )}
          {schedule.remainingSchoolMinutes !== undefined && schedule.dayType !== "after" && (
            <p className="day-progress__countdown">
              {t("home.schoolEnds", { time: formatDuration(schedule.remainingSchoolMinutes) })}
            </p>
          )}
          {schedule.remainingLessonMinutes > 0 && schedule.dayType !== "after" && (
            <p className="day-progress__countdown day-progress__countdown--dim">
              {t("home.scheduledLeft", { time: formatDuration(schedule.remainingLessonMinutes) })}
            </p>
          )}
          {schedule.nextBreak && (
            <p className="day-progress__countdown">
              {t("home.breakIn", { time: formatDuration(Math.max(0, minutesOfDay(schedule.nextBreak.start) - schedule.nowMinute)) })}
            </p>
          )}
          </div>
        )}
      </div>

      <section className="day-schedule" aria-labelledby="day-schedule-heading">
        <div className="section-heading">
          <h2 id="day-schedule-heading">{t("home.schedule")}</h2>
          <span>{t(`timetable.week${weekType}`)}</span>
          <Link to="/timetable" aria-label={t("home.setupTimetable")} title={t("home.setupTimetable")}>
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {schedule.entries.length > 0 ? (
          <div className="schedule-list">
            {schedule.entries.map((entry) => {
              const active =
                now.getHours() * 60 + now.getMinutes() >= Number(entry.start.slice(0, 2)) * 60 + Number(entry.start.slice(3)) &&
                now.getHours() * 60 + now.getMinutes() < Number(entry.end.slice(0, 2)) * 60 + Number(entry.end.slice(3));
              return (
                <div className={`schedule-row${active ? " schedule-row--active" : ""}`} key={entry.id} style={{ "--lesson-color": entry.color } as React.CSSProperties}>
                  <time>{entry.start}</time>
                  <span className="schedule-row__marker" />
                  <span className="schedule-row__name">{entry.label || t(`timetable.${entry.kind}`)}</span>
                  {entry.teacher?.name && <span className="schedule-row__teacher">{entry.teacher.name}</span>}
                  {entry.room && <span className="schedule-row__room">{entry.room}</span>}
                  <span className="schedule-row__end">{entry.end}</span>
                  <span className="schedule-row__week">{entry.weekType === "all" ? "" : t(`timetable.week${entry.weekType}`)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="schedule-empty">
            <span className="schedule-empty__rule" />
            <p>{schedule.dayType === "weekend" ? t("home.weekend") : schedule.dayType === "holiday" ? t("home.holiday") : lessons.length ? t("home.noLessons") : t("home.noSchedule")}</p>
            {schedule.dayType !== "weekend" && schedule.dayType !== "holiday" && lessons.length === 0 && (
              <Link to="/timetable">{t("home.addFirst")} <ArrowUpRight size={13} /></Link>
            )}
          </div>
        )}
      </section>

      <section className="home-widgets" aria-label={t("home.widgets")}>
        <div className="home-widget">
          <div className="section-heading"><h2>{t("home.tasks")}</h2><span>{tasks.filter((task) => !task.completed).length}</span><Link to="/tasks" aria-label={t("home.openTasks")}><ArrowUpRight size={14} /></Link></div>
          {upcomingTasks.length ? <div className="home-widget__rows">{upcomingTasks.map((task) => <Link className="home-widget__row" key={task.id} to="/tasks"><span className="home-widget__marker" /><strong>{task.title}</strong><time>{new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(`${task.dueDate}T12:00:00`))}</time></Link>)}</div> : <p className="home-widget__empty">{t("home.noTasks")}</p>}
        </div>
        <div className="home-widget">
          <div className="section-heading"><h2>{t("home.upcoming")}</h2><span>{calendarEvents.length}</span><Link to="/calendar" aria-label={t("home.openCalendar")}><ArrowUpRight size={14} /></Link></div>
          {upcomingEvents.length ? <div className="home-widget__rows">{upcomingEvents.map((event) => <Link className="home-widget__row" key={event.id} to="/calendar"><span className="home-widget__marker" style={{ backgroundColor: event.color }} /><strong>{event.title}</strong><time>{event.type === "exam" ? t("calendar.exam") : new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(event.startAt))}</time></Link>)}</div> : <p className="home-widget__empty">{t("home.noUpcoming")}</p>}
        </div>
        <div className="home-widget home-widget--quick">
          <div className="section-heading"><h2>{t("home.workspace")}</h2></div>
          <div className="home-quick-links">
            <Link to="/notes"><FileText size={14} /><span>{t("nav.notes")}</span><strong>{noteCount}</strong></Link>
            <Link to="/timer"><Timer size={14} /><span>{t("nav.timer")}</span><ArrowUpRight size={12} /></Link>
            <Link to="/calendar"><CalendarDays size={14} /><span>{t("nav.calendar")}</span><ArrowUpRight size={12} /></Link>
            <Link to="/tasks"><ListTodo size={14} /><span>{t("nav.tasks")}</span><ArrowUpRight size={12} /></Link>
          </div>
        </div>
      </section>
    </section>
  );
}
