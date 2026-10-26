import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, CalendarDays, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const region = germanStates.includes(schoolStateSetting?.value as GermanState)
    ? schoolStateSetting?.value as GermanState
    : "";
  const regionReady = schoolStateSetting !== null;
  const language = i18n.language.startsWith("de") ? "de" : "en";
  const cacheKey = `regionalCalendar:${region || "nationwide"}:${month.getFullYear()}:${language}`;

  useEffect(() => {
    const onOffline = () => setIsOnline(false);
    const onOnline = () => {
      clearRegionalDateRequestFailure(cacheKey);
      setIsOnline(true);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [cacheKey]);

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

  const selectedEvents = events.filter((event) => eventDateKey(event) === selectedDate).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedDate).sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
  const selectedRegionalDates = regionalDates.filter((item) => dateRangeContains(item, selectedDate));
  const monthTitle = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(month);
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index);
    return new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(date);
  });

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

  function monthCellTasks(date: string): SchoolTask[] {
    return tasks.filter((task) => task.dueDate === date && !task.completed);
  }

  return (
    <section className="feature-page calendar-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.calendar")}</h1><p>{t("calendar.subtitle")}</p></div>
        <button className="button button--primary" onClick={openCreateForm} type="button"><Plus size={14} />{t("calendar.add")}</button>
      </header>

      <div className={`calendar-regional-status calendar-regional-status--${regionalStatus}`} aria-live="polite">
        <span>{t(!region && regionalStatus === "ready" ? "calendar.regionalStatus.noState" : `calendar.regionalStatus.${regionalStatus}`)}</span>
        <a href="https://openholidaysapi.org/" rel="noreferrer" target="_blank">{t("calendar.dataSource")}</a>
      </div>

      <div className="calendar-layout">
        <section className="calendar-month" aria-label={t("calendar.monthView")}>
          <div className="calendar-month__heading">
            <div><h2>{monthTitle}</h2><span>{t("calendar.monthView")}</span></div>
            <div className="calendar-month__controls">
              <button aria-label={t("calendar.previousMonth")} className="icon-button" onClick={() => shiftMonth(-1)} type="button"><ArrowLeft size={14} /></button>
              <button className="button button--quiet" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(localDateKey(today)); }} type="button">{t("calendar.today")}</button>
              <button aria-label={t("calendar.nextMonth")} className="icon-button" onClick={() => shiftMonth(1)} type="button"><ArrowRight size={14} /></button>
            </div>
          </div>
          <div className="calendar-grid calendar-grid--weekdays">{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="calendar-grid calendar-grid--days">
            {days.map(({ date, key, inMonth }) => {
              const dayEvents = events.filter((event) => eventDateKey(event) === key);
              const pending = monthCellTasks(key);
              const dayRegionalDates = regionalDates.filter((item) => dateRangeContains(item, key));
              const today = key === localDateKey(new Date());
              const itemCount = dayEvents.length + pending.length + dayRegionalDates.length;
              return (
                <button aria-label={`${new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(date)}${itemCount ? `, ${itemCount} ${t("calendar.items")}` : ""}`} aria-pressed={selectedDate === key} className={`calendar-day${inMonth ? "" : " calendar-day--outside"}${today ? " calendar-day--today" : ""}${selectedDate === key ? " calendar-day--selected" : ""}`} key={key} onClick={() => setSelectedDate(key)} type="button">
                  <span>{date.getDate()}</span>
                  <i className="calendar-day__marks">{dayEvents.slice(0, 2).map((event) => <b key={event.id} style={{ backgroundColor: event.color }} />)}{pending.length > 0 && <b className="calendar-day__task-mark" />}{dayRegionalDates.slice(0, 2).map((item) => <b className={`calendar-day__regional-mark calendar-day__regional-mark--${item.type}`} key={item.id} />)}</i>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="calendar-agenda">
          <div className="calendar-agenda__heading"><div><h2>{new Intl.DateTimeFormat(i18n.language, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))}</h2><span>{t("calendar.agenda")}</span></div><CalendarDays size={15} /></div>
          {selectedEvents.length === 0 && selectedTasks.length === 0 && selectedRegionalDates.length === 0 ? (
            <div className="feature-empty feature-empty--compact"><span className="feature-empty__rule" /><div><strong>{t("calendar.empty")}</strong><p>{t("calendar.emptyHint")}</p></div></div>
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
                  <button className="agenda-item__main" onClick={() => openEditForm(event)} type="button">
                    <strong>{event.title}</strong><span>{event.type === "exam" ? `${t("calendar.exam")} · ` : ""}{event.allDay ? t("calendar.allDay") : new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(new Date(event.startAt))}{event.description && ` · ${event.description}`}</span>
                  </button>
                  <button aria-label={t("calendar.deleteEvent", { title: event.title })} className="icon-button icon-button--small" onClick={() => void deleteEvent(event)} type="button"><Trash2 size={13} /></button>
                </article>
              ))}
              {selectedTasks.map((task) => <article className={`agenda-item agenda-item--task${task.completed ? " is-complete" : ""}`} key={task.id}><i /><Link className="agenda-item__main" to="/tasks"><strong>{task.title}</strong><span>{task.completed ? t("tasks.filter.completed") : task.dueTime ?? t("calendar.deadline")}</span></Link></article>)}
            </div>
          )}
          <button className="button button--quiet calendar-agenda__add" onClick={openCreateForm} type="button"><Plus size={13} />{t("calendar.addEvent")}</button>
        </aside>
      </div>

      {formOpen && (
        <form className="feature-form calendar-event-form" onSubmit={(event) => void saveEvent(event)}>
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
        </form>
      )}
      {error && !formOpen && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
