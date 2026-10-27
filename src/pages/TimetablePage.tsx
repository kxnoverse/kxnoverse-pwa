import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  CalendarClock,
  Copy,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createId,
  db,
  localDateKey,
  type ScheduleException,
  type SessionKind,
  type Subject,
  type Teacher,
  type TimetableEntry,
  type WeekType,
} from "../data/db";
import { getCycleWeek, minutesOfDay, resolveEntries } from "../data/schedule";

type EditorValue = Omit<TimetableEntry, "id">;
type SubjectDraft = Pick<Subject, "name" | "color"> & {
  shortName: string;
  defaultTeacherId: string;
  defaultRoom: string;
  notes: string;
};
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function weekStart(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
}

function addMinutes(time: string, minutes: number): string {
  const total = minutesOfDay(time) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function initialEntry(weekday = 0, start = "08:00"): EditorValue {
  return {
    weekday,
    start,
    end: addMinutes(start, 45),
    weekType: "all",
    kind: "lesson",
    inheritTeacher: true,
    inheritRoom: true,
    inheritColor: true,
  };
}

function weekTypesOverlap(left: WeekType, right: WeekType): boolean {
  return left === "all" || right === "all" || left === right;
}

function timesOverlap(left: Pick<TimetableEntry, "start" | "end">, right: Pick<TimetableEntry, "start" | "end">): boolean {
  return minutesOfDay(left.start) < minutesOfDay(right.end) && minutesOfDay(right.start) < minutesOfDay(left.end);
}

function formatTime(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function findAvailableSlot(entries: TimetableEntry[], weekday: number, weekType: WeekType, schoolStartTime: string) {
  for (let start = minutesOfDay(schoolStartTime); start + 45 <= 23 * 60 + 45; start += 45) {
    const candidate = { start: formatTime(start), end: formatTime(start + 45) };
    const overlaps = entries.some((entry) =>
      entry.weekday === weekday &&
      weekTypesOverlap(entry.weekType, weekType) &&
      timesOverlap(entry, candidate),
    );
    if (!overlaps) return candidate;
  }
  return undefined;
}

function LessonDialog({
  value,
  subjects,
  teachers,
  onCreateTeacher,
  onCreateSubject,
  onClose,
  onSave,
}: {
  value: TimetableEntry | EditorValue;
  subjects: Subject[];
  teachers: Teacher[];
  onCreateTeacher: (name: string, subjectId?: string) => Promise<string>;
  onCreateSubject: (name: string) => Promise<string>;
  onClose: () => void;
  onSave: (value: EditorValue) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<EditorValue>(() => ({
    weekday: value.weekday,
    subjectId: value.subjectId,
    start: value.start,
    end: value.end,
    teacherId: value.teacherId,
    room: value.room ?? "",
    colorOverride: value.colorOverride ?? "",
    notes: value.notes ?? "",
    title: value.title ?? "",
    weekType: value.weekType,
    kind: value.kind,
    inheritTeacher: value.inheritTeacher ?? !value.teacherId,
    inheritRoom: value.inheritRoom ?? !value.room,
    inheritColor: value.inheritColor ?? !value.colorOverride,
  }));
  const [error, setError] = useState("");
  const [teacherDraft, setTeacherDraft] = useState("");
  const [showTeacherDraft, setShowTeacherDraft] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const selectedSubject = subjects.find((subject) => subject.id === draft.subjectId);
  const set = <K extends keyof EditorValue>(key: K, next: EditorValue[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (minutesOfDay(draft.end) <= minutesOfDay(draft.start)) {
      setError("endBeforeStart");
      return;
    }
    if (draft.kind === "lesson" && !draft.subjectId) {
      setError("selectSubject");
      return;
    }
    try {
      await onSave({
        ...draft,
        room: draft.inheritRoom ? undefined : draft.room?.trim() || undefined,
        notes: draft.notes?.trim() || undefined,
        colorOverride: draft.inheritColor ? undefined : draft.colorOverride || undefined,
        subjectId: draft.kind === "lesson" ? draft.subjectId : undefined,
        teacherId: draft.kind === "lesson" && !draft.inheritTeacher ? draft.teacherId : undefined,
        title: draft.kind === "lesson" ? undefined : draft.title?.trim() || undefined,
      });
    } catch (reason) {
      setError(reason instanceof Error && reason.message === "overlap" ? "overlap" : "saveError");
    }
  }

  async function createTeacher() {
    if (!teacherDraft.trim()) return;
    try {
      const teacherId = await onCreateTeacher(teacherDraft, draft.subjectId);
      setDraft((current) => ({ ...current, teacherId, inheritTeacher: false }));
      setTeacherDraft("");
      setShowTeacherDraft(false);
      setError("");
    } catch {
      setError("teacherCreateError");
    }
  }

  async function createSubject() {
    if (!subjectDraft.trim()) return;
    try {
      const subjectId = await onCreateSubject(subjectDraft);
      setDraft((current) => ({ ...current, subjectId }));
      setSubjectDraft("");
      setError("");
    } catch {
      setError("subjectCreateError");
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form aria-labelledby="timetable-dialog-title" aria-modal="true" className="editor-dialog" onSubmit={submit} role="dialog">
        <div className="dialog-heading">
          <h2 id="timetable-dialog-title">{value && "id" in value ? t("timetable.edit") : t("timetable.add")}</h2>
          <button className="icon-button" onClick={onClose} type="button" aria-label={t("timetable.close")}>
            <X size={16} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            <span>{t("timetable.kind")}</span>
            <select value={draft.kind} onChange={(event) => {
              const kind = event.target.value as SessionKind;
              setDraft((current) => ({
                ...current,
                kind,
                title: kind === "lesson" ? undefined : current.title || (kind === "break" ? t("timetable.pauseLabel") : t("timetable.free")),
              }));
            }}>
              <option value="lesson">{t("timetable.lesson")}</option>
              <option value="break">{t("timetable.break")}</option>
              <option value="free">{t("timetable.free")}</option>
            </select>
          </label>
          <label>
            <span>{t("timetable.weekday")}</span>
            <select value={draft.weekday} onChange={(event) => set("weekday", Number(event.target.value))}>
              {weekdays.map((day, index) => <option key={day} value={index}>{t(`weekdays.${day}`)}</option>)}
            </select>
          </label>
          {draft.kind === "lesson" && (
            <>
              {subjects.length === 0 && (
                <div className="subject-inline-create form-grid__wide">
                  <span>{t("timetable.noSubjects")}</span>
                  <div className="teacher-create-inline">
                    <input
                      aria-label={t("timetable.newSubject")}
                      maxLength={40}
                      onChange={(event) => setSubjectDraft(event.target.value)}
                      placeholder={t("timetable.newSubject")}
                      value={subjectDraft}
                    />
                    <button className="icon-button" aria-label={t("timetable.addSubject")} disabled={!subjectDraft.trim()} onClick={() => void createSubject()} type="button"><Plus size={14} /></button>
                  </div>
                </div>
              )}
              <label className="form-grid__wide">
                <span>{t("timetable.subject")}</span>
                <select required value={draft.subjectId ?? ""} onChange={(event) => {
                  const nextSubject = subjects.find((subject) => subject.id === event.target.value);
                  setDraft((current) => ({
                    ...current,
                    subjectId: event.target.value,
                    teacherId: undefined,
                    room: "",
                    colorOverride: "",
                    inheritTeacher: true,
                    inheritRoom: true,
                    inheritColor: true,
                  }));
                  if (!nextSubject) return;
                }}>
                  <option value="">{t("timetable.subject")}</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <label>
                <span>{t("timetable.teacher")}</span>
                <select value={draft.inheritTeacher ? selectedSubject?.defaultTeacherId ?? "" : draft.teacherId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, teacherId: event.target.value || undefined, inheritTeacher: false }))}>
                  <option value="">{t("timetable.noTeacher")}</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <div className="teacher-inline-control">
                {!showTeacherDraft ? (
                  <button className="inline-button" onClick={() => setShowTeacherDraft(true)} type="button">
                    <Plus size={12} /> {t("timetable.createTeacher")}
                  </button>
                ) : (
                  <div className="teacher-create-inline">
                    <input
                      aria-label={t("timetable.newTeacher")}
                      maxLength={60}
                      onChange={(event) => setTeacherDraft(event.target.value)}
                      placeholder={t("timetable.newTeacher")}
                      value={teacherDraft}
                    />
                    <button className="icon-button" aria-label={t("timetable.addTeacher")} disabled={!teacherDraft.trim()} onClick={() => void createTeacher()} type="button"><Plus size={14} /></button>
                  </div>
                )}
              </div>
              <label>
                <span>{t("timetable.room")}</span>
                <input maxLength={32} value={draft.inheritRoom ? selectedSubject?.defaultRoom ?? "" : draft.room ?? ""} onChange={(event) => setDraft((current) => ({ ...current, room: event.target.value, inheritRoom: false }))} />
              </label>
            </>
          )}
          {draft.kind !== "lesson" && (
            <label className="form-grid__wide">
              <span>{t("timetable.label")}</span>
              <input maxLength={40} value={draft.title ?? ""} onChange={(event) => set("title", event.target.value)} />
            </label>
          )}
          <label>
            <span>{t("timetable.start")}</span>
            <input required type="time" value={draft.start} onChange={(event) => set("start", event.target.value)} />
          </label>
          <label>
            <span>{t("timetable.end")}</span>
            <input required type="time" value={draft.end} onChange={(event) => set("end", event.target.value)} />
          </label>
          <label className="form-grid__wide">
            <span>{t("timetable.week")}</span>
            <select value={draft.weekType} onChange={(event) => set("weekType", event.target.value as WeekType)}>
              <option value="all">{t("timetable.weekAll")}</option>
              <option value="A">{t("timetable.weekA")}</option>
              <option value="B">{t("timetable.weekB")}</option>
            </select>
          </label>
          {draft.kind === "lesson" && (
            <label className="color-field form-grid__wide">
              <span>{t("timetable.color")} <small>{t("settings.system")}</small></span>
              <div>
                <input aria-label={t("timetable.color")} type="color" value={draft.inheritColor ? selectedSubject?.color ?? "#89a9c4" : draft.colorOverride || selectedSubject?.color || "#89a9c4"} onChange={(event) => setDraft((current) => ({ ...current, colorOverride: event.target.value, inheritColor: false }))} />
                <input aria-label={`${t("timetable.color")} HEX`} maxLength={7} placeholder={t("settings.system")} value={draft.inheritColor ? "" : draft.colorOverride} onChange={(event) => setDraft((current) => ({ ...current, colorOverride: event.target.value, inheritColor: false }))} />
                {!draft.inheritColor && <button className="inline-button" onClick={() => setDraft((current) => ({ ...current, colorOverride: "", inheritColor: true }))} type="button">{t("settings.system")}</button>}
              </div>
            </label>
          )}
          <label className="form-grid__wide">
            <span>{t("timetable.notes")}</span>
            <textarea maxLength={300} rows={2} value={draft.notes ?? ""} onChange={(event) => set("notes", event.target.value)} />
          </label>
        </div>
        {error && <p className="form-error" role="alert">{t(`timetable.${error}`)}</p>}
        <div className="dialog-actions">
          <button className="button button--quiet" onClick={onClose} type="button">{t("timetable.cancel")}</button>
          <button className="button button--primary" type="submit">{t("timetable.save")}</button>
        </div>
      </form>
    </div>
  );
}

export function TimetablePage() {
  const { t } = useTranslation();
  const lessons = useLiveQuery(() => db.timetable.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const teachers = useLiveQuery(() => db.teachers.toArray(), [], []);
  const exceptions = useLiveQuery(() => db.exceptions.toArray(), [], []);
  const weekAnchor = useLiveQuery(() => db.settings.get("weekAnchor"), [], undefined);
  const schoolDaysSetting = useLiveQuery(() => db.settings.get("schoolDays"), [], undefined);
  const schoolStartSetting = useLiveQuery(() => db.settings.get("schoolStartTime"), [], undefined);
  const schoolStartTime = schoolStartSetting?.value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schoolStartSetting.value) && schoolStartSetting.value <= "23:00"
    ? schoolStartSetting.value
    : "08:00";
  const schoolDays = useMemo(() => {
    try {
      const value = schoolDaysSetting?.value ? JSON.parse(schoolDaysSetting.value) as boolean[] : undefined;
      return Array.from({ length: 7 }, (_, index) => value?.[index] ?? index < 5);
    } catch {
      return Array.from({ length: 7 }, (_, index) => index < 5);
    }
  }, [schoolDaysSetting?.value]);
  const [today, setToday] = useState(() => new Date());
  const anchorDate = weekAnchor?.value.split("|")[0] ?? weekStart(today);
  const anchorType = weekAnchor?.value.split("|")[1] === "B" ? "B" : "A";
  const currentWeek = getCycleWeek(today, anchorDate, anchorType);
  const [selectedWeek, setSelectedWeek] = useState<"A" | "B">(currentWeek);
  const [editor, setEditor] = useState<TimetableEntry | EditorValue>();
  const [editorMode, setEditorMode] = useState(false);
  const [dropTargetDay, setDropTargetDay] = useState<number>();
  const [manageOpen, setManageOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [subjectDraft, setSubjectDraft] = useState<SubjectDraft>({
    name: "", shortName: "", color: "#8da9c0", defaultTeacherId: "", defaultRoom: "", notes: "",
  });
  const [editingSubject, setEditingSubject] = useState<string>();
  const [teacherDraft, setTeacherDraft] = useState({ name: "", subjectIds: [] as string[] });
  const [editingTeacher, setEditingTeacher] = useState<string>();
  const [exceptionDate, setExceptionDate] = useState(localDateKey(today));
  const [exceptionType, setExceptionType] = useState<"holiday" | "cancelled" | "extra">("holiday");
  const [exceptionEntry, setExceptionEntry] = useState("");
  const [extraEditor, setExtraEditor] = useState<{ date: string; value: EditorValue }>();

  useEffect(() => {
    const interval = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => setSelectedWeek(currentWeek), [currentWeek]);

  const days = useMemo(
    () =>
      weekdays.map((key, index) => ({
        key,
        index,
        entries: lessons
          .filter(
            (entry) =>
              entry.weekday === index &&
              (entry.weekType === "all" || entry.weekType === selectedWeek),
          )
          .sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start)),
      })).filter((day) => schoolDays[day.index]),
    [lessons, schoolDays, selectedWeek],
  );

  async function saveEntry(value: EditorValue, existingId?: string) {
    const overlap = lessons.some(
      (entry) =>
        entry.id !== existingId &&
        entry.weekday === value.weekday &&
        weekTypesOverlap(entry.weekType, value.weekType) &&
        timesOverlap(entry, value),
    );
    if (overlap) throw new Error("overlap");
    await db.timetable.put({ ...value, id: existingId ?? createId() });
    setEditor(undefined);
    setNotice("lessonSaved");
  }

  async function createTeacherRecord(name: string, subjectIds: string[] = []): Promise<string> {
    const trimmedName = name.trim();
    if (!trimmedName || subjectIds.some((subjectId) => !subjects.some((subject) => subject.id === subjectId))) {
      throw new Error("invalid-teacher");
    }
    const id = createId();
    await db.teachers.add({ id, name: trimmedName, subjectIds });
    return id;
  }

  async function createTeacherForSubject(name: string, subjectId?: string): Promise<string> {
    return createTeacherRecord(name, subjectId ? [subjectId] : []);
  }

  async function createSubjectForLesson(name: string): Promise<string> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("invalid-subject");
    const id = createId();
    await db.subjects.add({ id, name: trimmedName, color: "#8da9c0" });
    return id;
  }

  async function deleteEntry(id: string) {
    if (!window.confirm(t("timetable.confirmDelete"))) return;
    try {
      await db.transaction("rw", db.timetable, db.exceptions, async () => {
        await db.timetable.delete(id);
        await db.exceptions.where("entryId").equals(id).delete();
      });
      setNotice("lessonDeleted");
    } catch {
      setNotice("storageError");
    }
  }

  async function submitSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = editingSubject ?? createId();
    try {
      await db.subjects.put({
        id,
        name: subjectDraft.name.trim(),
        shortName: subjectDraft.shortName.trim() || undefined,
        color: subjectDraft.color,
        defaultTeacherId: subjectDraft.defaultTeacherId || undefined,
        defaultRoom: subjectDraft.defaultRoom.trim() || undefined,
        notes: subjectDraft.notes.trim() || undefined,
      });
      setSubjectDraft({ name: "", shortName: "", color: "#8da9c0", defaultTeacherId: "", defaultRoom: "", notes: "" });
      setEditingSubject(undefined);
    } catch {
      setNotice("storageError");
    }
  }

  async function removeSubject(subject: Subject) {
    const isUsed = lessons.some((entry) => entry.subjectId === subject.id) ||
      exceptions.some((item) => item.extra?.subjectId === subject.id);
    if (isUsed) {
      setNotice("subjectInUse");
      return;
    }
    if (!window.confirm(t("timetable.confirmDeleteSubject", { name: subject.name }))) return;
    try {
      await db.subjects.delete(subject.id);
    } catch {
      setNotice("storageError");
    }
  }

  function duplicateSubject(subject: Subject) {
    setEditingSubject(undefined);
    setSubjectDraft({
      name: `${subject.name} ${t("timetable.copySuffix")}`,
      shortName: subject.shortName ?? "",
      color: subject.color,
      defaultTeacherId: subject.defaultTeacherId ?? "",
      defaultRoom: subject.defaultRoom ?? "",
      notes: subject.notes ?? "",
    });
    setManageOpen(true);
  }

  async function submitTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = teacherDraft.name.trim();
    if (!name) {
      setNotice("teacherNameRequired");
      return;
    }
    try {
      if (editingTeacher) {
        await db.teachers.put({ id: editingTeacher, name, subjectIds: teacherDraft.subjectIds });
      } else {
        await createTeacherRecord(name, teacherDraft.subjectIds);
      }
      setTeacherDraft({ name: "", subjectIds: [] });
      setEditingTeacher(undefined);
    } catch {
      setNotice("storageError");
    }
  }

  async function removeTeacher(teacher: Teacher) {
    if (lessons.some((entry) => entry.teacherId === teacher.id) || subjects.some((subject) => subject.defaultTeacherId === teacher.id)) {
      setNotice("teacherInUse");
      return;
    }
    try {
      await db.teachers.delete(teacher.id);
    } catch {
      setNotice("storageError");
    }
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exceptionType === "extra") {
      setExtraEditor({ date: exceptionDate, value: initialEntry((new Date(`${exceptionDate}T12:00:00`).getDay() + 6) % 7) });
      return;
    }
    const exception: ScheduleException = {
      id: createId(),
      date: exceptionDate,
      type: exceptionType,
      ...(exceptionType === "cancelled" ? { entryId: exceptionEntry } : {}),
    };
    try {
      await db.exceptions.put(exception);
    } catch {
      setNotice("storageError");
    }
  }

  async function updateWeekAnchor(date: string, type: "A" | "B") {
    if (!date) return;
    try {
      await db.settings.put({ key: "weekAnchor", value: `${date}|${type}` });
    } catch {
      setNotice("storageError");
    }
  }

  async function deleteException(id: string) {
    try {
      await db.exceptions.delete(id);
    } catch {
      setNotice("storageError");
    }
  }

  async function saveExtra(value: EditorValue) {
    const currentExtra = extraEditor;
    if (!currentExtra) return;
    const date = new Date(`${currentExtra.date}T12:00:00`);
    const weekday = (date.getDay() + 6) % 7;
    const existing = resolveEntries(
      lessons,
      subjects,
      teachers,
      weekday,
      date,
      exceptions,
      anchorDate,
      anchorType,
    );
    if (existing.some((entry) => timesOverlap(entry, value))) throw new Error("overlap");
    const entry: TimetableEntry = { ...value, id: createId() };
    await db.exceptions.put({
      id: createId(),
      date: currentExtra.date,
      type: "extra",
      extra: entry,
    });
    setExtraEditor(undefined);
  }

  async function dropOnDay(event: React.DragEvent, weekday: number) {
    event.preventDefault();
    setDropTargetDay(undefined);
    const payload = event.dataTransfer.getData("text/plain");
    const paletteSubjectId = payload.startsWith("palette:subject:") ? payload.slice("palette:subject:".length) : "";
    const paletteBreak = payload === "palette:break";
    if (editorMode && (paletteSubjectId || paletteBreak)) {
      const subject = paletteSubjectId ? subjects.find((item) => item.id === paletteSubjectId) : undefined;
      if (paletteSubjectId && !subject) return;
      const weekType: WeekType = selectedWeek;
      const slot = findAvailableSlot(lessons, weekday, weekType, schoolStartTime);
      if (!slot) {
        setNotice("noOpenSlot");
        return;
      }
      try {
        await saveEntry({
          weekday,
          start: slot.start,
          end: slot.end,
          weekType,
          kind: paletteBreak ? "break" : "lesson",
          ...(subject ? { subjectId: subject.id } : { title: t("timetable.pauseLabel") }),
          inheritTeacher: true,
          inheritRoom: true,
          inheritColor: true,
        });
      } catch (reason) {
        setNotice(reason instanceof Error && reason.message === "overlap" ? "overlap" : "storageError");
      }
      return;
    }
    const id = payload;
    const entry = lessons.find((item) => item.id === id);
    if (!entry || entry.weekday === weekday) return;
    try {
      await saveEntry({ ...entry, weekday }, entry.id);
    } catch (reason) {
      setNotice(reason instanceof Error && reason.message === "overlap" ? "overlap" : "storageError");
    }
  }

  const exceptionDateObject = new Date(`${exceptionDate}T12:00:00`);
  const exceptionWeek = getCycleWeek(exceptionDateObject, anchorDate, anchorType);
  const exceptionWeekday = (exceptionDateObject.getDay() + 6) % 7;
  const cancellableLessons = lessons.filter(
    (entry) =>
      entry.weekday === exceptionWeekday &&
      (entry.weekType === "all" || entry.weekType === exceptionWeek),
  );

  return (
    <section className="timetable-page">
      <div className="page-heading page-heading--compact">
        <div>
          <h1>{t("timetable.title")}</h1>
          <p className="page-heading__date">{t("timetable.referenceIs")} {t(`timetable.week${currentWeek}`)}</p>
        </div>
        <div className="page-controls">
          <div className="segmented-control" aria-label={t("timetable.week")}>
            {(["A", "B"] as const).map((week) => (
              <button
                aria-pressed={selectedWeek === week}
                className={selectedWeek === week ? "is-selected" : ""}
                key={week}
                onClick={() => setSelectedWeek(week)}
                type="button"
              >
                {t(`timetable.week${week}`)}
              </button>
            ))}
          </div>
          <button className="button button--quiet" aria-expanded={manageOpen} onClick={() => setManageOpen((open) => !open)} type="button">
            <CalendarClock size={15} /> {t("timetable.manage")}
          </button>
          <button
            aria-pressed={editorMode}
            className={`button ${editorMode ? "button--primary" : "button--quiet"}`}
            onClick={() => setEditorMode((enabled) => !enabled)}
            type="button"
          >
            {t(editorMode ? "timetable.finishEditing" : "timetable.editMode")}
          </button>
          <button
            className="button button--primary"
            onClick={() => setEditor(initialEntry(0, schoolStartTime))}
            type="button"
          >
            <Plus size={15} /> {t("timetable.add")}
          </button>
        </div>
      </div>

      {notice &&       <div className="inline-notice" role="status">{t(`timetable.${notice}`)}<button onClick={() => setNotice("")} aria-label={t("timetable.close")}><X size={13} /></button></div>}

      {editorMode && (
        <section className="timetable-editor" aria-label={t("timetable.editMode")}>
          <div className="timetable-editor__palette">
            <h2>{t("timetable.dragToSchedule")}</h2>
            {subjects.map((subject) => (
              <button
                className="timetable-editor__item"
                draggable
                key={subject.id}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", `palette:subject:${subject.id}`)}
                type="button"
              >
                <span className="timetable-editor__swatch" style={{ backgroundColor: subject.color }} />
                {subject.name}
              </button>
            ))}
            <button
              className="timetable-editor__item"
              draggable
              onDragStart={(event) => event.dataTransfer.setData("text/plain", "palette:break")}
              type="button"
            >
              <span className="timetable-editor__swatch" style={{ backgroundColor: "#94ad9e" }} />
              {t("timetable.pauseLabel")}
            </button>
            <p className="timetable-editor__hint">{t("timetable.editorHint")}</p>
          </div>
        </section>
      )}

      {manageOpen && (
        <section className="manage-panel">
          <div className="manage-columns">
            <div className="manage-section">
              <h2>{t("timetable.subjects")}</h2>
              <form className="subject-form" onSubmit={submitSubject}>
                <input aria-label={t("timetable.name")} maxLength={40} placeholder={t("timetable.name")} required value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} />
                <input aria-label={t("timetable.shortName")} maxLength={16} placeholder={t("timetable.shortName")} value={subjectDraft.shortName} onChange={(event) => setSubjectDraft({ ...subjectDraft, shortName: event.target.value })} />
                <select aria-label={t("timetable.defaultTeacher")} value={subjectDraft.defaultTeacherId} onChange={(event) => setSubjectDraft({ ...subjectDraft, defaultTeacherId: event.target.value })}>
                  <option value="">{t("timetable.noTeacher")}</option>
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
                <input aria-label={t("timetable.defaultRoom")} maxLength={32} placeholder={t("timetable.defaultRoom")} value={subjectDraft.defaultRoom} onChange={(event) => setSubjectDraft({ ...subjectDraft, defaultRoom: event.target.value })} />
                <input aria-label={t("timetable.subjectNotes")} maxLength={160} placeholder={t("timetable.subjectNotes")} value={subjectDraft.notes} onChange={(event) => setSubjectDraft({ ...subjectDraft, notes: event.target.value })} />
                <div className="hex-color-control">
                  <input aria-label={t("timetable.color")} type="color" value={/^#[0-9a-f]{6}$/i.test(subjectDraft.color) ? subjectDraft.color : "#8da9c0"} onChange={(event) => setSubjectDraft({ ...subjectDraft, color: event.target.value })} />
                  <input aria-label={`${t("timetable.color")} HEX`} maxLength={7} pattern="#[0-9a-fA-F]{6}" value={subjectDraft.color} onChange={(event) => setSubjectDraft({ ...subjectDraft, color: event.target.value })} />
                </div>
                <button className="icon-button" title={t("timetable.addSubject")} type="submit" aria-label={t("timetable.addSubject")}><Plus size={16} /></button>
              </form>
              <div className="manage-list">
                {subjects.map((subject) => (
                  <div className="manage-row" key={subject.id}>
                    <span className="subject-swatch" style={{ backgroundColor: subject.color }} />
                    {editingSubject === subject.id ? (
                      <form className="manage-edit" onSubmit={submitSubject}>
                        <input aria-label={t("timetable.name")} required value={subjectDraft.name} onChange={(event) => setSubjectDraft({ ...subjectDraft, name: event.target.value })} />
                        <input aria-label={t("timetable.shortName")} value={subjectDraft.shortName} onChange={(event) => setSubjectDraft({ ...subjectDraft, shortName: event.target.value })} />
                        <select aria-label={t("timetable.defaultTeacher")} value={subjectDraft.defaultTeacherId} onChange={(event) => setSubjectDraft({ ...subjectDraft, defaultTeacherId: event.target.value })}>
                          <option value="">{t("timetable.noTeacher")}</option>
                          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                        </select>
                        <input aria-label={t("timetable.defaultRoom")} value={subjectDraft.defaultRoom} onChange={(event) => setSubjectDraft({ ...subjectDraft, defaultRoom: event.target.value })} />
                        <input aria-label={t("timetable.subjectNotes")} value={subjectDraft.notes} onChange={(event) => setSubjectDraft({ ...subjectDraft, notes: event.target.value })} />
                        <input aria-label={t("timetable.color")} type="color" value={subjectDraft.color} onChange={(event) => setSubjectDraft({ ...subjectDraft, color: event.target.value })} />
                        <input aria-label={`${t("timetable.color")} HEX`} maxLength={7} pattern="#[0-9a-fA-F]{6}" value={subjectDraft.color} onChange={(event) => setSubjectDraft({ ...subjectDraft, color: event.target.value })} />
                        <button className="inline-button" type="submit">{t("timetable.save")}</button>
                      </form>
                    ) : (
                      <>
                        <span className="manage-row__name">{subject.name}</span>
                        <span className="manage-row__hex">{[subject.shortName, teachers.find((teacher) => teacher.id === subject.defaultTeacherId)?.name, subject.defaultRoom].filter(Boolean).join(" · ") || subject.color.toUpperCase()}</span>
                        <button className="icon-button icon-button--small" aria-label={`${t("timetable.edit")} ${subject.name}`} onClick={() => { setSubjectDraft({ name: subject.name, shortName: subject.shortName ?? "", color: subject.color, defaultTeacherId: subject.defaultTeacherId ?? "", defaultRoom: subject.defaultRoom ?? "", notes: subject.notes ?? "" }); setEditingSubject(subject.id); }} type="button"><Pencil size={13} /></button>
                        <button className="icon-button icon-button--small" aria-label={`${t("timetable.duplicateSubject")} ${subject.name}`} onClick={() => duplicateSubject(subject)} type="button"><Copy size={13} /></button>
                        <button className="icon-button icon-button--small" aria-label={`${t("timetable.delete")} ${subject.name}`} onClick={() => void removeSubject(subject)} type="button"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                ))}
                {subjects.length === 0 && <p className="subtle-empty">{t("timetable.noSubjects")}</p>}
              </div>
            </div>

            <div className="manage-section">
              <h2>{t("timetable.teachers")}</h2>
              <form className="inline-form teacher-create" onSubmit={submitTeacher}>
                <input aria-label={t("timetable.name")} maxLength={60} placeholder={t("timetable.name")} required value={teacherDraft.name} onChange={(event) => setTeacherDraft({ ...teacherDraft, name: event.target.value })} />
                <button className="button button--quiet teacher-create__submit" type="submit"><Plus size={14} />{t("timetable.addTeacher")}</button>
                <div className="teacher-subjects">
                  {subjects.map((subject) => (
                    <label key={subject.id}>
                      <input checked={teacherDraft.subjectIds.includes(subject.id)} onChange={(event) => setTeacherDraft((draft) => ({ ...draft, subjectIds: event.target.checked ? [...draft.subjectIds, subject.id] : draft.subjectIds.filter((id) => id !== subject.id) }))} type="checkbox" />
                      {subject.name}
                    </label>
                  ))}
                </div>
              </form>
              <div className="manage-list">
                {teachers.map((teacher) => (
                  <div className="teacher-row" key={teacher.id}>
                    {editingTeacher === teacher.id ? (
                      <form className="teacher-edit" onSubmit={submitTeacher}>
                        <input aria-label={t("timetable.name")} required value={teacherDraft.name} onChange={(event) => setTeacherDraft({ ...teacherDraft, name: event.target.value })} />
                        <div className="teacher-subjects">
                          {subjects.map((subject) => (
                            <label key={subject.id}>
                              <input checked={teacherDraft.subjectIds.includes(subject.id)} onChange={(event) => setTeacherDraft((draft) => ({ ...draft, subjectIds: event.target.checked ? [...draft.subjectIds, subject.id] : draft.subjectIds.filter((id) => id !== subject.id) }))} type="checkbox" />
                              {subject.name}
                            </label>
                          ))}
                        </div>
                        <button className="inline-button" type="submit">{t("timetable.save")}</button>
                      </form>
                    ) : (
                      <>
                        <span className="manage-row__name">{teacher.name}</span>
                        <span className="manage-row__hex">{teacher.subjectIds.map((id) => subjects.find((subject) => subject.id === id)?.name).filter(Boolean).join(", ")}</span>
                        <button className="icon-button icon-button--small" aria-label={`${t("timetable.edit")} ${teacher.name}`} onClick={() => { setTeacherDraft({ name: teacher.name, subjectIds: teacher.subjectIds }); setEditingTeacher(teacher.id); }} type="button"><Pencil size={13} /></button>
                        <button className="icon-button icon-button--small" aria-label={`${t("timetable.delete")} ${teacher.name}`} onClick={() => void removeTeacher(teacher)} type="button"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="exception-section">
            <h2>{t("timetable.scheduleSettings")}</h2>
            <div className="exception-layout">
              <div className="cycle-settings">
                <span>{t("timetable.weekAnchor")}</span>
                <label>
                  <span>{t("timetable.referenceDate")}</span>
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(event) => void updateWeekAnchor(event.target.value, anchorType)}
                  />
                </label>
                <select aria-label={t("timetable.referenceIs")} value={anchorType} onChange={(event) => void updateWeekAnchor(anchorDate, event.target.value as "A" | "B")}>
                  <option value="A">{t("timetable.weekA")}</option>
                  <option value="B">{t("timetable.weekB")}</option>
                </select>
              </div>
              <form className="exception-form" onSubmit={(event) => void addException(event)}>
                <input aria-label={t("timetable.date")} required type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
                <select value={exceptionType} onChange={(event) => setExceptionType(event.target.value as typeof exceptionType)}>
                  <option value="holiday">{t("timetable.addHoliday")}</option>
                  <option value="cancelled">{t("timetable.addCancellation")}</option>
                  <option value="extra">{t("timetable.addExtra")}</option>
                </select>
                {exceptionType === "cancelled" && (
                  <select aria-label={t("timetable.lesson")} required value={exceptionEntry} onChange={(event) => setExceptionEntry(event.target.value)}>
                    <option value="">{t("timetable.lesson")}</option>
                    {cancellableLessons.map((entry) => <option key={entry.id} value={entry.id}>{subjects.find((subject) => subject.id === entry.subjectId)?.name ?? t(`timetable.${entry.kind}`)} · {entry.start}</option>)}
                  </select>
                )}
                <button className="icon-button" type="submit" aria-label={t("timetable.add")}><Plus size={15} /></button>
              </form>
            </div>
            <div className="exception-list">
              {exceptions.map((exception) => (
                <div className="exception-row" key={exception.id}>
                  <span>{exception.date}</span>
                  <span>{t(`timetable.${exception.type}`)}{exception.extra?.subjectId ? ` · ${subjects.find((subject) => subject.id === exception.extra?.subjectId)?.name ?? ""}` : ""}</span>
                  <button className="icon-button icon-button--small" aria-label={`${t("timetable.deleteException")} ${exception.date}`} onClick={() => void deleteException(exception.id)} type="button"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className={`timetable-grid${editorMode ? " timetable-grid--editing" : ""}`} role="list" aria-label={t("timetable.title")}>
        {days.map(({ key, index, entries }) => (
          <section
            className={`day-column${index === (new Date().getDay() + 6) % 7 ? " day-column--today" : ""}${dropTargetDay === index ? " day-column--drop-target" : ""}`}
            key={key}
            onDragOver={(event) => {
              event.preventDefault();
              if (editorMode) setDropTargetDay((current) => current === index ? current : index);
            }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setDropTargetDay(undefined);
              }
            }}
            onDrop={(event) => void dropOnDay(event, index)}
            role="listitem"
          >
            <div className="day-column__header">
              <span>{t(`weekdays.${key.slice(0, 3)}`)}</span>
              {index === (new Date().getDay() + 6) % 7 && <span className="day-column__today" aria-label={t("home.current")} />}
            </div>
            <div className="day-column__entries">
              {entries.map((entry) => {
                const subject = subjects.find((item) => item.id === entry.subjectId);
                const teacher = teachers.find((item) => item.id === (entry.inheritTeacher ? subject?.defaultTeacherId : entry.teacherId));
                const color = entry.inheritColor ? subject?.color ?? "#81909c" : entry.colorOverride ?? subject?.color ?? "#81909c";
                const room = entry.inheritRoom ? subject?.defaultRoom : entry.room;
                return (
                  <article
                    className={`lesson-item lesson-item--${entry.kind}`}
                    draggable
                    key={entry.id}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.id)}
                    style={{ "--lesson-color": color, "--lesson-length": Math.max(40, minutesOfDay(entry.end) - minutesOfDay(entry.start)) } as React.CSSProperties}
                    title={entry.notes ?? ""}
                  >
                    <div className="lesson-item__time">{entry.start}<span>–</span>{entry.end}</div>
                    <div className="lesson-item__subject">{subject?.shortName || subject?.name || entry.title || t(`timetable.${entry.kind}`)}</div>
                    <div className="lesson-item__meta">
                      <span>{teacher?.name ?? room ?? t(`timetable.week${entry.weekType === "all" ? "All" : entry.weekType}`)}</span>
                      {room && teacher && <span>{room}</span>}
                    </div>
                    <div className="lesson-item__actions">
                      <button className="icon-button icon-button--small" aria-label={`${t("timetable.edit")} ${subject?.name ?? ""}`} onClick={() => setEditor(entry)} type="button"><Pencil size={12} /></button>
                      <button className="icon-button icon-button--small" aria-label={`${t("timetable.duplicate")} ${subject?.name ?? ""}`} onClick={() => { const { id: _id, ...copy } = entry; setEditor(copy); }} type="button"><Copy size={12} /></button>
                      <button className="icon-button icon-button--small" aria-label={`${t("timetable.delete")} ${subject?.name ?? ""}`} onClick={() => void deleteEntry(entry.id)} type="button"><Trash2 size={12} /></button>
                    </div>
                  </article>
                );
              })}
              {entries.length === 0 && <button className="day-column__empty" onClick={() => setEditor(initialEntry(index, schoolStartTime))} type="button"><Plus size={13} /><span>{t("timetable.add")}</span></button>}
            </div>
          </section>
        ))}
      </div>
      <p className="timetable-hint"><ArrowDownToLine size={13} /> {t("timetable.dragHint")}</p>

      {editor && !extraEditor && (
        <LessonDialog
          key={"id" in editor ? editor.id : `new-${editor.weekday}`}
          onClose={() => setEditor(undefined)}
          onCreateTeacher={createTeacherForSubject}
          onCreateSubject={createSubjectForLesson}
          onSave={(value) => saveEntry(value, "id" in editor ? editor.id : undefined)}
          subjects={subjects}
          teachers={teachers}
          value={editor}
        />
      )}
      {extraEditor && (
        <LessonDialog
          key={`extra-${extraEditor.date}`}
          onClose={() => setExtraEditor(undefined)}
          onCreateTeacher={createTeacherForSubject}
          onCreateSubject={createSubjectForLesson}
          onSave={saveExtra}
          subjects={subjects}
          teachers={teachers}
          value={extraEditor.value}
        />
      )}
    </section>
  );
}
