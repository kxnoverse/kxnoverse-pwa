import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, FilePlus2, FileText, Image, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createId, db, type LocalFile } from "../data/db";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function formatBytes(bytes: number, language: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(size) + ` ${units[index]}`;
}

export function FilesPage() {
  const { t, i18n } = useTranslation();
  const files = useLiveQuery(() => db.files.orderBy("modifiedAt").reverse().toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [error, setError] = useState("");
  const selected = files.find((file) => file.id === selectedId);
  const [previewUrl, setPreviewUrl] = useState("");

  const visibleFiles = useMemo(() => files.filter((file) => !query.trim() || `${file.name} ${file.category} ${file.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [files, query]);

  useEffect(() => {
    if (!selected) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(selected.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected?.id, selected?.modifiedAt]);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selectedFiles.length) return;
    const tooLarge = selectedFiles.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setError(t("files.fileTooLarge", { name: tooLarge.name, size: 30 }));
      return;
    }
    const now = Date.now();
    const records: LocalFile[] = selectedFiles.map((file) => ({
      id: createId(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      category: categoryDraft.trim() || t("files.defaultCategory"),
      ...(subjectDraft ? { subjectId: subjectDraft } : {}),
      createdAt: now,
      modifiedAt: file.lastModified || now,
      blob: file,
    }));
    try {
      await db.files.bulkAdd(records);
      setSelectedId(records[0].id);
      setError("");
    } catch {
      setError(t("files.saveError"));
    }
  }

  async function deleteFile(file: LocalFile) {
    if (!window.confirm(t("files.confirmDelete", { name: file.name }))) return;
    try {
      await db.files.delete(file.id);
      if (selectedId === file.id) setSelectedId("");
      setError("");
    } catch {
      setError(t("files.saveError"));
    }
  }

  function downloadFile(file: LocalFile) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const isImage = Boolean(selected?.type.startsWith("image/"));
  const isPdf = selected?.type === "application/pdf";
  const isText = selected?.type === "text/plain" || selected?.type === "text/markdown" || selected?.type === "text/csv";
  const subject = subjects.find((item) => item.id === selected?.subjectId);

  return (
    <section className="feature-page files-page">
      <header className="page-heading--compact feature-heading">
        <div><h1>{t("nav.files")}</h1><p>{t("files.subtitle", { count: files.length })}</p></div>
        <div className="files-import-controls">
          <input aria-label={t("files.category")} maxLength={60} onChange={(event) => setCategoryDraft(event.target.value)} placeholder={t("files.category")} value={categoryDraft} />
          <select aria-label={t("files.subject")} onChange={(event) => setSubjectDraft(event.target.value)} value={subjectDraft}><option value="">{t("tasks.noSubject")}</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button className="button button--primary" onClick={() => inputRef.current?.click()} type="button"><FilePlus2 size={14} />{t("files.add")}</button>
          <input accept="*/*" aria-label={t("files.add")} hidden multiple onChange={(event) => void importFiles(event)} ref={inputRef} type="file" />
        </div>
      </header>
      <div className="files-workspace">
        <aside className="files-list">
          <div className="feature-search"><Search size={14} /><input aria-label={t("files.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("files.search")} value={query} /></div>
          <div className="files-list__items">
            {visibleFiles.map((file) => <button aria-pressed={selected?.id === file.id} className={`file-list-row${selected?.id === file.id ? " is-active" : ""}`} key={file.id} onClick={() => setSelectedId(file.id)} type="button">
              <span className="file-list-row__icon">{file.type.startsWith("image/") ? <Image size={15} /> : <FileText size={15} />}</span>
              <span className="file-list-row__main"><strong>{file.name}</strong><small>{file.category} · {formatBytes(file.size, i18n.language)}</small></span>
            </button>)}
            {visibleFiles.length === 0 && <p className="subtle-empty">{files.length ? t("files.noMatches") : t("files.emptyHint")}</p>}
          </div>
        </aside>
        <section className="file-preview">
          {selected && previewUrl ? (
            <>
              <div className="file-preview__heading"><div><h2>{selected.name}</h2><p>{selected.category}{subject ? ` · ${subject.name}` : ""} · {formatBytes(selected.size, i18n.language)}</p></div><div><button aria-label={t("files.download")} className="icon-button" onClick={() => downloadFile(selected)} type="button"><Download size={14} /></button><button aria-label={t("files.delete")} className="icon-button" onClick={() => void deleteFile(selected)} type="button"><Trash2 size={14} /></button></div></div>
              {isImage ? <div className="file-preview__canvas"><img alt={selected.name} src={previewUrl} /></div>
                : isPdf ? <iframe className="file-preview__pdf" src={previewUrl} title={t("files.previewTitle", { name: selected.name })} />
                  : isText ? <iframe className="file-preview__text" src={previewUrl} title={t("files.previewTitle", { name: selected.name })} />
                    : <div className="file-preview__unsupported"><FileText size={25} /><strong>{t("files.noPreview")}</strong><p>{t("files.downloadHint")}</p><button className="button button--quiet" onClick={() => downloadFile(selected)} type="button"><Download size={13} />{t("files.download")}</button></div>}
            </>
          ) : (
            <div className="file-preview__unsupported"><FileText size={25} /><strong>{t("files.selectFile")}</strong><p>{t("files.previewHint")}</p>{files.length === 0 && <button className="button button--quiet" onClick={() => inputRef.current?.click()} type="button"><FilePlus2 size={13} />{t("files.add")}</button>}</div>
          )}
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
