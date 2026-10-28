import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FilePlus2, Pin, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createId, db, type SchoolNote } from "../data/db";
import { matchesSubject } from "../data/subjects";

export function NotesPage({ subjectFilter }: { subjectFilter?: string }) {
  const { t, i18n } = useTranslation();
  const notes = useLiveQuery(() => db.notes.orderBy("updatedAt").reverse().toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const filteredNotes = useMemo(() => notes
    .filter((note) => subjectFilter === undefined || matchesSubject(note.subjectId, subjectFilter))
    .filter((note) => !query.trim() || `${note.title} ${note.content} ${note.folder}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [notes, query, subjectFilter]);
  const activeNote = filteredNotes.find((note) => note.id === activeId) ?? filteredNotes[0];

  useEffect(() => {
    if (!activeNote) return;
    setTitleDraft(activeNote.title);
    setContentDraft(activeNote.content);
    setFolderDraft(activeNote.folder);
    setSubjectDraft(activeNote.subjectId ?? "");
    setPreview(false);
    setSaveState("saved");
  }, [activeNote?.id]);

  useEffect(() => {
    if (!activeNote) return;
    const unchanged = activeNote.title === titleDraft && activeNote.content === contentDraft && activeNote.folder === folderDraft && (activeNote.subjectId ?? "") === subjectDraft;
    if (unchanged) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      void db.notes.update(activeNote.id, {
        title: titleDraft.trim().slice(0, 160) || t("notes.untitled"),
        content: contentDraft,
        folder: folderDraft.trim().slice(0, 60) || t("notes.defaultFolder"),
        ...(subjectDraft ? { subjectId: subjectDraft } : { subjectId: undefined }),
        updatedAt: Date.now(),
      }).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeNote?.id, activeNote?.content, activeNote?.folder, activeNote?.subjectId, activeNote?.title, contentDraft, folderDraft, subjectDraft, t, titleDraft]);

  async function saveDraft() {
    if (!activeNote) return;
    try {
      await db.notes.update(activeNote.id, {
        title: titleDraft.trim().slice(0, 160) || t("notes.untitled"),
        content: contentDraft,
        folder: folderDraft.trim().slice(0, 60) || t("notes.defaultFolder"),
        ...(subjectDraft ? { subjectId: subjectDraft } : { subjectId: undefined }),
        updatedAt: Date.now(),
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function createNote() {
    const now = Date.now();
    const note: SchoolNote = {
      id: createId(),
      title: t("notes.untitled"),
      content: "",
      folder: t("notes.defaultFolder"),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.notes.add(note);
      setActiveId(note.id);
      setQuery("");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function togglePin(note: SchoolNote) {
    try {
      await db.notes.update(note.id, { pinned: !note.pinned, updatedAt: Date.now() });
    } catch {
      setSaveState("error");
    }
  }

  async function deleteNote(note: SchoolNote) {
    if (!window.confirm(t("notes.confirmDelete", { title: note.title }))) return;
    try {
      await db.notes.delete(note.id);
      if (activeId === note.id) setActiveId("");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const savedAt = activeNote ? new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(activeNote.updatedAt) : "";

  return (
    <section className="feature-page notes-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.notes")}</h1><p>{t("notes.subtitle", { count: notes.length })}</p></div>
        <button className="button button--primary" onClick={() => void createNote()} type="button"><FilePlus2 size={14} />{t("notes.new")}</button>
      </header>

      <div className="notes-workspace">
        <aside className="notes-list">
          <div className="feature-search"><Search size={14} /><input aria-label={t("notes.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("notes.search")} value={query} /></div>
          <div className="notes-list__items">
            {filteredNotes.map((note) => {
              const subject = subjects.find((item) => item.id === note.subjectId);
              return (
                <div className={`note-list-item${activeNote?.id === note.id ? " is-active" : ""}`} key={note.id}>
                  <button className="note-list-item__main" onClick={() => setActiveId(note.id)} type="button">
                    <strong>{note.title || t("notes.untitled")}</strong>
                    <span>{note.content.slice(0, 90).replace(/\s+/g, " ") || t("notes.noContent")}</span>
                    <small>{subject?.name ?? note.folder} · {new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(note.updatedAt)}</small>
                  </button>
                  {note.pinned && <Pin aria-label={t("notes.pinned")} className="note-list-item__pin" size={12} />}
                </div>
              );
            })}
            {filteredNotes.length === 0 && <p className="subtle-empty">{notes.length ? t("notes.noMatches") : t("notes.emptyHint")}</p>}
          </div>
        </aside>

        {activeNote ? (
          <article className="note-editor">
            <div className="note-editor__toolbar">
              <div className="note-save-state" role="status">{saveState === "saving" ? t("notes.saving") : saveState === "error" ? t("notes.saveError") : t("notes.savedAt", { time: savedAt })}</div>
              <button aria-label={t(activeNote.pinned ? "notes.unpin" : "notes.pin")} className={`icon-button${activeNote.pinned ? " is-active" : ""}`} onClick={() => void togglePin(activeNote)} type="button"><Pin size={14} /></button>
              <button className="button button--quiet" onClick={() => setPreview(!preview)} type="button">{t(preview ? "notes.edit" : "notes.preview")}</button>
              <button aria-label={t("notes.delete")} className="icon-button" onClick={() => void deleteNote(activeNote)} type="button"><Trash2 size={14} /></button>
            </div>
            <input aria-label={t("notes.title")} className="note-editor__title" maxLength={160} onBlur={() => void saveDraft()} onChange={(event) => setTitleDraft(event.target.value)} placeholder={t("notes.untitled")} value={titleDraft} />
            <div className="note-editor__meta">
              <label><span>{t("notes.folder")}</span><input maxLength={60} onBlur={() => void saveDraft()} onChange={(event) => setFolderDraft(event.target.value)} value={folderDraft} /></label>
              <label><span>{t("notes.subject")}</span><select onBlur={() => void saveDraft()} onChange={(event) => setSubjectDraft(event.target.value)} value={subjectDraft}><option value="">{t("tasks.noSubject")}</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            </div>
            {preview ? (
              <pre className="note-editor__preview">{contentDraft || t("notes.emptyPreview")}</pre>
            ) : (
              <textarea aria-label={t("notes.content")} className="note-editor__content" onBlur={() => void saveDraft()} onChange={(event) => setContentDraft(event.target.value)} placeholder={t("notes.placeholder")} value={contentDraft} />
            )}
          </article>
        ) : (
          <div className="note-editor note-editor--empty"><span className="feature-empty__rule" /><strong>{t("notes.empty")}</strong><p>{t("notes.emptyHint")}</p><button className="button button--quiet" onClick={() => void createNote()} type="button"><FilePlus2 size={13} />{t("notes.new")}</button></div>
        )}
      </div>
    </section>
  );
}
