import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, CalendarDays, Check, Circle, Plus, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createId, db, localDateKey, type SchoolTask, type TaskPriority, type TaskSubtask } from "../data/db";

type TaskFilter = "all" | "open" | "completed";

export function TasksPage() {
  const { t, i18n } = useTranslation();
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(localDateKey(new Date()));
  const [dueTime, setDueTime] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");

  const visibleTasks = useMemo(() => tasks
    .filter((task) => filter === "all" || (filter === "completed" ? task.completed : !task.completed))
    .filter((task) => !subjectFilter || task.subjectId === subjectFilter)
    .filter((task) => !query.trim() || `${task.title} ${task.description} ${task.tags.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? "").localeCompare(b.dueTime ?? "")), [filter, query, subjectFilter, tasks]);

  function openCreateForm() {
    setEditingId("");
    setTitle("");
    setDescription("");
    setDueDate(localDateKey(new Date()));
    setDueTime("");
    setSubjectId("");
    setPriority("normal");
    setTags("");
    setError("");
    setFormOpen(true);
  }

  function openEditForm(task: SchoolTask) {
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setDueDate(task.dueDate);
    setDueTime(task.dueTime ?? "");
    setSubjectId(task.subjectId ?? "");
    setPriority(task.priority);
    setTags(task.tags.join(", "));
    setError("");
    setFormOpen(true);
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || !dueDate) {
      setError(t("tasks.validation"));
      return;
    }
    const current = editingId ? tasks.find((task) => task.id === editingId) : undefined;
    const now = Date.now();
    const subtasks: TaskSubtask[] = current?.subtasks ?? [];
    const value: SchoolTask = {
      id: editingId || createId(),
      title: cleanTitle,
      description: description.trim(),
      dueDate,
      ...(dueTime ? { dueTime } : {}),
      priority,
      ...(subjectId ? { subjectId } : {}),
      category: current?.category ?? "Homework",
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      subtasks,
      completed: current?.completed ?? false,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await db.tasks.put(value);
      setError("");
      setFormOpen(false);
      setEditingId("");
    } catch {
      setError(t("tasks.saveError"));
    }
  }

  async function toggleTask(task: SchoolTask) {
    try {
      await db.tasks.update(task.id, { completed: !task.completed, updatedAt: Date.now() });
      setError("");
    } catch {
      setError(t("tasks.saveError"));
    }
  }

  async function deleteTask(task: SchoolTask) {
    if (!window.confirm(t("tasks.confirmDelete", { title: task.title }))) return;
    try {
      await db.transaction("rw", db.tasks, db.calendarEvents, async () => {
        await db.tasks.delete(task.id);
        await db.calendarEvents.where("taskId").equals(task.id).modify({ taskId: undefined });
      });
      setError("");
    } catch {
      setError(t("tasks.saveError"));
    }
  }

  const counts = {
    all: tasks.length,
    open: tasks.filter((task) => !task.completed).length,
    completed: tasks.filter((task) => task.completed).length,
  };
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", weekday: "short" });

  return (
    <section className="feature-page tasks-page">
      <header className="page-heading--compact feature-heading">
        <div>
          <h1>{t("nav.tasks")}</h1>
          <p>{t("tasks.subtitle", { count: counts.open })}</p>
        </div>
        <button className="button button--primary" onClick={openCreateForm} type="button"><Plus size={14} />{t("tasks.add")}</button>
      </header>

      <div className="feature-toolbar">
        <div className="feature-search"><Search size={14} /><input aria-label={t("tasks.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("tasks.search")} value={query} /></div>
        <select aria-label={t("tasks.subjectFilter")} onChange={(event) => setSubjectFilter(event.target.value)} value={subjectFilter}>
          <option value="">{t("tasks.allSubjects")}</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <div aria-label={t("tasks.filters")} className="segmented-control">
          {(["open", "all", "completed"] as TaskFilter[]).map((value) => (
            <button aria-pressed={filter === value} className={filter === value ? "is-selected" : ""} key={value} onClick={() => setFilter(value)} type="button">{t(`tasks.filter.${value}`)} <span>{counts[value]}</span></button>
          ))}
        </div>
      </div>

      {formOpen && (
        <form className="feature-form" onSubmit={(event) => void saveTask(event)}>
          <div className="feature-form__heading"><h2>{t(editingId ? "tasks.edit" : "tasks.new")}</h2><button className="inline-button" onClick={() => setFormOpen(false)} type="button">{t("timetable.cancel")}</button></div>
          <div className="form-grid">
            <label className="form-grid__wide"><span>{t("tasks.title")}</span><input autoFocus maxLength={120} onChange={(event) => setTitle(event.target.value)} required value={title} /></label>
            <label><span>{t("tasks.dueDate")}</span><input onChange={(event) => setDueDate(event.target.value)} required type="date" value={dueDate} /></label>
            <label><span>{t("tasks.dueTime")}</span><input onChange={(event) => setDueTime(event.target.value)} type="time" value={dueTime} /></label>
            <label><span>{t("tasks.subject")}</span><select onChange={(event) => setSubjectId(event.target.value)} value={subjectId}><option value="">{t("tasks.noSubject")}</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label><span>{t("tasks.priority")}</span><select onChange={(event) => setPriority(event.target.value as TaskPriority)} value={priority}>{(["low", "normal", "high"] as TaskPriority[]).map((value) => <option key={value} value={value}>{t(`tasks.priorityValue.${value}`)}</option>)}</select></label>
            <label className="form-grid__wide"><span>{t("tasks.description")}</span><textarea maxLength={4000} onChange={(event) => setDescription(event.target.value)} rows={3} value={description} /></label>
            <label className="form-grid__wide"><span>{t("tasks.tags")}</span><input maxLength={200} onChange={(event) => setTags(event.target.value)} placeholder={t("tasks.tagsHint")} value={tags} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="feature-form__actions"><button className="button button--quiet" onClick={() => setFormOpen(false)} type="button">{t("timetable.cancel")}</button><button className="button button--primary" type="submit">{t("timetable.save")}</button></div>
        </form>
      )}

      {error && !formOpen && <p className="form-error" role="alert">{error}</p>}
      <div className="task-list">
        {visibleTasks.map((task) => {
          const isOverdue = !task.completed && task.dueDate < localDateKey(new Date());
          const subject = subjects.find((item) => item.id === task.subjectId);
          return (
            <article className={`task-row${task.completed ? " task-row--complete" : ""}${isOverdue ? " task-row--overdue" : ""}`} key={task.id}>
              <button aria-label={t(task.completed ? "tasks.markOpen" : "tasks.markDone", { title: task.title })} className="task-check" onClick={() => void toggleTask(task)} type="button">
                {task.completed ? <Check size={14} /> : <Circle size={15} />}
              </button>
              <div className="task-row__main">
                <button className="task-row__title" onClick={() => openEditForm(task)} type="button">{task.title}</button>
                {task.description && <p>{task.description}</p>}
                <div className="task-row__meta">
                  {subject && <span className="task-subject"><i style={{ backgroundColor: subject.color }} />{subject.name}</span>}
                  <span className={`task-priority task-priority--${task.priority}`}>{t(`tasks.priorityValue.${task.priority}`)}</span>
                  {task.tags.map((tag) => <span className="task-tag" key={tag}>{tag}</span>)}
                </div>
              </div>
              <time className="task-row__date" dateTime={task.dueDate}><CalendarDays size={12} />{dateFormatter.format(new Date(`${task.dueDate}T12:00:00`))}{task.dueTime && <span>{task.dueTime}</span>}</time>
              <div className="task-row__actions">
                <button aria-label={t("tasks.editTask", { title: task.title })} className="icon-button icon-button--small" onClick={() => openEditForm(task)} type="button"><ArrowUpRight size={13} /></button>
                <button aria-label={t("tasks.deleteTask", { title: task.title })} className="icon-button icon-button--small" onClick={() => void deleteTask(task)} type="button"><Trash2 size={13} /></button>
              </div>
            </article>
          );
        })}
        {visibleTasks.length === 0 && (
          <div className="feature-empty"><span className="feature-empty__rule" /><div><strong>{t(query || subjectFilter || filter !== "open" ? "tasks.emptyFiltered" : "tasks.empty")}</strong><p>{t(query || subjectFilter || filter !== "open" ? "tasks.emptyFilteredHint" : "tasks.emptyHint")}</p></div>{tasks.length === 0 && <button className="inline-button" onClick={openCreateForm} type="button">{t("tasks.add")} <ArrowUpRight size={12} /></button>}</div>
        )}
      </div>
      <footer className="feature-footer"><Link to="/calendar">{t("tasks.openCalendar")} <ArrowUpRight size={12} /></Link></footer>
    </section>
  );
}
