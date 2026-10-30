import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Surface } from "../components/Surface";
import { createId, db, localDateKey, type CalendarEvent, type SchoolTask } from "../data/db";
import { useUiStore } from "../stores/ui-store";
import {
  clearRegionalDateRequestFailure,
  dateRangeContains,
  fetchRegionalDates,
  germanStates,
  parseRegionalDateCache,
  regionalDateRequestIsCoolingDown,
  storeRegionalDateRequestFailure,
  type GermanState,
  type RegionalDate,
} from "../data/regional-calendar";

function localDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function eventDateKey(event: CalendarEvent): string {
  return localDateKey(new Date(event.startAt));
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const events = useLiveQuery(() => db.calendarEvents.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const schoolStateSetting = useLiveQuery(() => db.settings.get("schoolState"), [], null);
  const accent = useUiStore((state) => state.appearance.accent);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [eventType, setEventType] = useState<CalendarEvent["type"]>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [error, setError] = useState("");
  const [regionalDates, setRegionalDates] = useState<RegionalDate[]>([]);
  const [regionalStatus, setRegionalStatus] = useState<"loading" | "refreshing" | "ready" | "cached" | "offlineCached" | "offlineEmpty" | "error" | "cacheError" | "cacheReadError">("loading");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const cacheKeyRef = useRef("");
  const region = germanStates.includes(schoolStateSetting?.value as GermanState)
    ? schoolStateSetting?.value as GermanState
    : "";
  const regionReady = schoolStateSetting !== null;
  const language = i18n.language.startsWith("de") ? "de" : "en";
  const cacheKey = `regionalCalendar:${region || "nationwide"}:${month.getFullYear()}:${language}`;
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    const onOffline = () => setIsOnline(false);
    const onOnline = () => {
      clearRegionalDateRequestFailure(cacheKeyRef.current);
      setIsOnline(true);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!regionReady) return;
    let active = true;
    let hasCachedData = false;
    let cacheReadFailed = false;
    const controller = new AbortController();
    setRegionalStatus(isOnline ? "loading" : "offlineEmpty");
    setRegionalDates([]);

    void (async () => {
      try {
        const cached = await db.settings.get(cacheKey);
        if (cached) {
          const parsed = parseRegionalDateCache(cached.value);
          if (parsed) {
            hasCachedData = true;
            if (active) {
              setRegionalDates(parsed.dates);
              if (isOnline) setRegionalStatus("refreshing");
            }
          } else {
            cacheReadFailed = true;
          }
        }
      } catch {
        cacheReadFailed = true;
      }

      if (!active) return;
      if (!isOnline) {
        setRegionalStatus(cacheReadFailed ? "cacheReadError" : hasCachedData ? "offlineCached" : "offlineEmpty");
        return;
      }
      if (regionalDateRequestIsCoolingDown(cacheKey)) {
        setRegionalStatus(hasCachedData ? "cached" : cacheReadFailed ? "cacheReadError" : "error");
        return;
      }
      try {
        const dates = await fetchRegionalDates(region, month.getFullYear(), language, controller.signal);
        if (!active) return;
        try {
          await db.settings.put({
            key: cacheKey,
            value: JSON.stringify({ version: 1, fetchedAt: Date.now(), dates }),
          });
          clearRegionalDateRequestFailure(cacheKey);
          if (active) {
            setRegionalDates(dates);
            setRegionalStatus("ready");
          }
        } catch {
          if (active) {
            setRegionalDates(dates);
            setRegionalStatus("cacheError");
          }
        }
      } catch {
        if (!active || controller.signal.aborted) return;
        storeRegionalDateRequestFailure(cacheKey);
        setRegionalStatus(hasCachedData ? "cached" : cacheReadFailed ? "cacheReadError" : "error");
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, isOnline, language, month, region, regionReady]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + count) / 7) * 7;
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index - offset + 1);
      return { date, key: localDateKey(date), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = eventDateKey(event);
      const group = grouped.get(key);
      if (group) group.push(event);
      else grouped.set(key, [event]);
    }
    for (const group of grouped.values()) group.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return grouped;
  }, [events]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, SchoolTask[]>();
    for (const task of tasks) {
      const group = grouped.get(task.dueDate);
      if (group) group.push(task);
      else grouped.set(task.dueDate, [task]);
    }
    for (const group of grouped.values()) group.sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
    return grouped;
  }, [tasks]);
  const pendingTasksByDate = useMemo(() => {
    const grouped = new Map<string, SchoolTask[]>();
    for (const task of tasks) {
      if (task.completed) continue;
      const group = grouped.get(task.dueDate);
      if (group) group.push(task);
      else grouped.set(task.dueDate, [task]);
    }
    return grouped;
  }, [tasks]);
  const regionalDatesByDate = useMemo(() => {
    const grouped = new Map<string, RegionalDate[]>();
    for (const item of regionalDates) {
      for (const day of days) {
        if (!dateRangeContains(item, day.key)) continue;
        const group = grouped.get(day.key);
        if (group) group.push(item);
        else grouped.set(day.key, [item]);
      }
    }
    return grouped;
  }, [days, regionalDates]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedTasks = tasksByDate.get(selectedDate) ?? [];
  const selectedRegionalDates = regionalDatesByDate.get(selectedDate) ?? [];
  const todayKey = localDateKey(new Date());
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(month),
    [i18n.language, month],
  );
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(new Date(2024, 0, 1 + index)),
    ),
    [i18n.language],
  );
  const fullDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }),
    [i18n.language],
  );
  const selectedDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "long", month: "long", day: "numeric" }),
    [i18n.language],
  );
  const hourFormat = useUiStore((state) => state.appearance.hourFormat);
  const eventTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, {
      hour: hourFormat === "24" ? "2-digit" : "numeric",
      minute: "2-digit",
      hour12: hourFormat === "12",
    }),
    [hourFormat, i18n.language],
  );

  function openCreateForm() {
    const start = new Date(`${selectedDate}T09:00:00`);
    setEditingId("");
    setEventType("event");
    setTitle("");
    setDescription("");
    setStartsAt(localDateTimeValue(start));
    setEndsAt(localDateTimeValue(new Date(start.getTime() + 30 * 60_000)));
    setAllDay(false);
    setError("");
    setFormOpen(true);
  }

  function openEditForm(event: CalendarEvent) {
    setEditingId(event.id);
    setEventType(event.type);
    setTitle(event.title);
    setDescription(event.description);
    setStartsAt(localDateTimeValue(new Date(event.startAt)));
    setEndsAt(localDateTimeValue(new Date(event.endAt)));
    setAllDay(event.allDay);
    setSelectedDate(eventDateKey(event));
    setError("");
    setFormOpen(true);
  }

  async function saveEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || !startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setError(t("calendar.validation"));
      return;
    }
    const existing = events.find((event) => event.id === editingId);
    const now = Date.now();
    const value: CalendarEvent = {
      id: editingId || createId(),
      type: eventType,
      title: cleanTitle,
      description: description.trim(),
      startAt: new Date(startsAt).toISOString(),
      endAt: new Date(endsAt).toISOString(),
      allDay,
      color: accent,
      ...(existing?.taskId ? { taskId: existing.taskId } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await db.calendarEvents.put(value);
      setSelectedDate(localDateKey(new Date(value.startAt)));
      setMonth(new Date(new Date(value.startAt).getFullYear(), new Date(value.startAt).getMonth(), 1));
      setFormOpen(false);
      setError("");
    } catch {
      setError(t("calendar.saveError"));
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    if (!window.confirm(t("calendar.confirmDelete", { title: event.title }))) return;
    try {
      await db.calendarEvents.delete(event.id);
      setError("");
    } catch {
      setError(t("calendar.saveError"));
    }
  }

  function shiftMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <section className="feature-page calendar-page">
      <header className="page-heading--compact feature-heading calendar-page__heading">
        <div className="calendar-page__intro">
          <span className="calendar-page__eyebrow"><CalendarDays size={13} />{monthTitle}</span>
          <h1>{t("nav.calendar")}</h1>
          <p>{t("calendar.subtitle")}</p>
        </div>
        <button className="button button--primary" onClick={openCreateForm} type="button"><Plus size={14} />{t("calendar.add")}</button>
      </header>

      <Surface
        aria-live="polite"
        className={`calendar-regional-status calendar-regional-status--${regionalStatus}`}
        role="status"
        variant="glass"
      >
        <span>{t(!region && regionalStatus === "ready" ? "calendar.regionalStatus.noState" : `calendar.regionalStatus.${regionalStatus}`)}</span>
        <a href="https://openholidaysapi.org/" rel="noreferrer" target="_blank">{t("calendar.dataSource")}</a>
      </Surface>

      <div className="calendar-layout">
        <Surface as="section" className="calendar-month" aria-label={t("calendar.monthView")}>
          <div className="calendar-month__heading">
            <div className="calendar-month__title"><span>{t("calendar.monthView")}</span><h2>{monthTitle}</h2></div>
            <div className="calendar-month__controls">
              <button aria-label={t("calendar.previousMonth")} className="icon-button" onClick={() => shiftMonth(-1)} type="button"><ChevronLeft size={15} /></button>
              <button className="button button--quiet" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(localDateKey(today)); }} type="button">{t("calendar.today")}</button>
              <button aria-label={t("calendar.nextMonth")} className="icon-button" onClick={() => shiftMonth(1)} type="button"><ChevronRight size={15} /></button>
            </div>
          </div>
          <div className="calendar-legend" aria-label={t("calendar.legend")}>
            <span><i className="calendar-legend__event" />{t("calendar.event")}</span>
            <span><i className="calendar-legend__task" />{t("calendar.deadline")}</span>
            <span><i className="calendar-legend__public" />{t("calendar.publicHoliday")}</span>
            <span><i className="calendar-legend__school" />{t("calendar.schoolHoliday")}</span>
          </div>
          <div className="calendar-grid calendar-grid--weekdays" aria-hidden="true">{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <Surface className="calendar-grid calendar-grid--days" variant="inset">
            {days.map(({ date, key, inMonth }) => {
              const dayEvents = eventsByDate.get(key) ?? [];
              const pending = pendingTasksByDate.get(key) ?? [];
              const dayRegionalDates = regionalDatesByDate.get(key) ?? [];
              const today = key === todayKey;
              const itemCount = dayEvents.length + pending.length + dayRegionalDates.length;
              const shownCount = Math.min(2, dayEvents.length) + Number(pending.length > 0) + Number(dayRegionalDates.length > 0);
              const remainingCount = Math.max(0, itemCount - shownCount);
              return (
                <button
                  aria-label={`${fullDateFormatter.format(date)}${itemCount ? `, ${itemCount} ${t("calendar.items")}` : ""}`}
                  aria-current={today ? "date" : undefined}
                  aria-pressed={selectedDate === key}
                  className={`calendar-day${inMonth ? "" : " calendar-day--outside"}${today ? " calendar-day--today" : ""}${selectedDate === key ? " calendar-day--selected" : ""}`}
                  key={key}
                  onClick={() => {
                    setSelectedDate(key);
                    if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }}
                  type="button"
                >
                  <span className="calendar-day__number">{date.getDate()}</span>
                  <span className="calendar-day__entries" aria-hidden="true">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span className={`calendar-day__entry${event.type === "exam" ? " calendar-day__entry--exam" : ""}`} key={event.id}>
                        <i style={{ backgroundColor: event.color }} />{event.title}
                      </span>
                    ))}
                    {pending.length > 0 && <span className="calendar-day__entry calendar-day__entry--task"><i />{t("calendar.deadline")}</span>}
                    {dayRegionalDates.slice(0, 1).map((item) => <span className={`calendar-day__entry calendar-day__entry--${item.type}`} key={item.id}><i />{item.name}</span>)}
                    {remainingCount > 0 && <span className="calendar-day__more">{t("calendar.moreItems", { count: remainingCount })}</span>}
                  </span>
                </button>
              );
            })}
          </Surface>
        </Surface>

        <Surface as="aside" aria-label={t("calendar.agenda")} className="calendar-agenda">
          <div className="calendar-agenda__heading"><div><span>{t("calendar.agenda")}</span><h2>{selectedDateFormatter.format(new Date(`${selectedDate}T12:00:00`))}</h2></div><CalendarDays size={16} /></div>
          {selectedEvents.length === 0 && selectedTasks.length === 0 && selectedRegionalDates.length === 0 ? (
            <Surface className="calendar-agenda__empty" variant="inset">
              <div className="feature-empty feature-empty--compact"><span className="feature-empty__rule" /><div><strong>{t("calendar.empty")}</strong><p>{t("calendar.emptyHint")}</p></div></div>
            </Surface>
          ) : (
            <div className="agenda-list">
              {selectedRegionalDates.map((item) => (
                <article className={`agenda-item agenda-item--regional agenda-item--regional-${item.type}`} key={item.id}>
                  <i />
                  <div className="agenda-item__main">
                    <strong>{item.name}</strong>
                    <span>{t(item.type === "school" ? "calendar.schoolHoliday" : "calendar.publicHoliday")}{item.startDate !== item.endDate ? ` · ${new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.startDate}T12:00:00Z`))} – ${new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.endDate}T12:00:00Z`))}` : ""}</span>
                  </div>
                </article>
              ))}
              {selectedEvents.map((event) => (
                <article className="agenda-item" key={event.id}>
                  <i style={{ backgroundColor: event.color }} />
                  <button aria-label={t("calendar.editEvent", { title: event.title })} className="agenda-item__main" onClick={() => openEditForm(event)} type="button">
                    <strong>{event.title}</strong><span>{event.type === "exam" ? `${t("calendar.exam")} · ` : ""}{event.allDay ? t("calendar.allDay") : eventTimeFormatter.format(new Date(event.startAt))}{event.description && ` · ${event.description}`}</span>
                  </button>
                  <button aria-label={t("calendar.deleteEvent", { title: event.title })} className="icon-button icon-button--small" onClick={() => void deleteEvent(event)} type="button"><Trash2 size={13} /></button>
                </article>
              ))}
              {selectedTasks.map((task) => <article className={`agenda-item agenda-item--task${task.completed ? " is-complete" : ""}`} key={task.id}><i /><Link className="agenda-item__main" to="/docs?section=tasks"><strong>{task.title}</strong><span>{task.completed ? t("tasks.filter.completed") : task.dueTime ?? t("calendar.deadline")}</span></Link></article>)}
            </div>
          )}
          <button className="button button--quiet calendar-agenda__add" onClick={openCreateForm} type="button"><Plus size={13} />{t("calendar.addEvent")}</button>
        </Surface>
      </div>

      {formOpen && (
        <Surface as="form" className="feature-form calendar-event-form" onSubmit={(event) => void saveEvent(event)}>
          <div className="feature-form__heading"><h2>{t(editingId ? "calendar.edit" : "calendar.new")}</h2><button className="inline-button" onClick={() => setFormOpen(false)} type="button">{t("timetable.cancel")}</button></div>
          <div className="form-grid">
            <label className="form-grid__wide"><span>{t("calendar.title")}</span><input autoFocus maxLength={120} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
            <label className="form-grid__wide"><span>{t("calendar.type")}</span><select onChange={(event) => setEventType(event.target.value as CalendarEvent["type"])} value={eventType}><option value="event">{t("calendar.event")}</option><option value="exam">{t("calendar.exam")}</option></select></label>
            <label><span>{t("calendar.starts")}</span><input onChange={(event) => setStartsAt(event.target.value)} required type="datetime-local" value={startsAt} /></label>
            <label><span>{t("calendar.ends")}</span><input onChange={(event) => setEndsAt(event.target.value)} required type="datetime-local" value={endsAt} /></label>
            <label className="setting-row setting-row--toggle form-grid__wide"><span>{t("calendar.allDay")}</span><input checked={allDay} onChange={(event) => setAllDay(event.target.checked)} type="checkbox" /></label>
            <label className="form-grid__wide"><span>{t("calendar.description")}</span><textarea maxLength={4000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="feature-form__actions"><button className="button button--quiet" onClick={() => setFormOpen(false)} type="button">{t("timetable.cancel")}</button><button className="button button--primary" type="submit">{t("timetable.save")}</button></div>
        </Surface>
      )}
      {error && !formOpen && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
