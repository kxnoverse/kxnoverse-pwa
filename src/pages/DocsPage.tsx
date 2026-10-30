import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, FilePlus2, FileText, FileUp, LoaderCircle, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { db, type SchoolDocument, type SchoolDocumentContent, type Subject } from "../data/db";
import { createDocument, deleteDocument, duplicateDocument, isDocumentContent } from "../data/docs";
import { importPdfProject, updatePdfProject } from "../data/docs-pdf";
import { PdfAnnotationWorkspace } from "./PdfAnnotationWorkspace";
import { createSubject as addSubject, deleteSubject as removeSubject, matchesSubject, renameSubject as updateSubject } from "../data/subjects";

const DocumentEditor = lazy(() => import("./DocsEditor").then((module) => ({ default: module.DocsEditor })));
const NotesSection = lazy(() => import("./NotesPage").then((module) => ({ default: module.NotesPage })));
const TasksSection = lazy(() => import("./TasksPage").then((module) => ({ default: module.TasksPage })));

type SaveState = "saved" | "saving" | "error";

export function DocsPage() {
  const { t, i18n } = useTranslation();
  const documentLoadError = t("docs.loadError");
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const section = sectionParam === "notes" || sectionParam === "tasks" ? sectionParam : "documents";
  const requestedDocumentId = searchParams.get("document") ?? "";
  const ignoredDocumentRoute = useRef<string | null>(null);
  const documents = useLiveQuery(() => db.documents.orderBy("updatedAt").reverse().toArray(), [], []);
  const pdfProjects = useLiveQuery(() => db.pdfProjects.orderBy("updatedAt").reverse().toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.orderBy("name").toArray(), [], []);
  const [activeId, setActiveId] = useState(requestedDocumentId);
  const [activePdfProjectId, setActivePdfProjectId] = useState("");
  const [storedContent, setStoredContent] = useState<SchoolDocumentContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [subjectDrafts, setSubjectDrafts] = useState<Record<string, string>>({});
  const [subjectError, setSubjectError] = useState("");
  const [pdfImportStatus, setPdfImportStatus] = useState("");
  const [pdfImportError, setPdfImportError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("kxnodesk-docs-sidebar") === "collapsed");
  const [darkPaper, setDarkPaper] = useState(() => localStorage.getItem("kxnodesk-docs-dark-paper") === "true");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const pdfInput = useRef<HTMLInputElement>(null);

  const visibleDocuments = useMemo(() => documents
    .filter((item) => matchesSubject(item.subjectId, subjectFilter))
    .filter((item) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [documents, query, subjectFilter]);
  const visiblePdfProjects = useMemo(() => pdfProjects.filter((item) => matchesSubject(item.subjectId, subjectFilter)), [pdfProjects, subjectFilter]);
  const activeDocument = documents.find((item) => item.id === activeId);
  const activePdfProject = pdfProjects.find((item) => item.id === activePdfProjectId);

  function selectSection(next: "documents" | "notes" | "tasks") {
    setSearchParams(next === "documents"
      ? activePdfProjectId ? {} : activeId ? { document: activeId } : {}
      : { section: next }, { replace: true });
  }

  useEffect(() => {
    if (requestedDocumentId) {
      if (requestedDocumentId === ignoredDocumentRoute.current) return;
      setActivePdfProjectId("");
      setActiveId(requestedDocumentId);
      return;
    }
    ignoredDocumentRoute.current = null;
    if (!activeId && !activePdfProjectId && documents.length) setActiveId(documents[0].id);
  }, [activeId, activePdfProjectId, documents, requestedDocumentId]);

  useEffect(() => {
    if (!activeId) {
      setStoredContent(null);
      setError("");
      return;
    }
    let active = true;
    setLoadingContent(true);
    void Promise.all([db.documents.get(activeId), db.documentContents.get(activeId)]).then(([document, content]) => {
      if (!active) return;
      if (!document) {
        setStoredContent(null);
        setError("");
        return;
      }
      if (!content || !isDocumentContent(content)) throw new Error("Document content is invalid.");
      setStoredContent(content);
      setError("");
    }).catch(() => {
      if (active) setError(documentLoadError);
    }).finally(() => {
      if (active) setLoadingContent(false);
    });
    return () => { active = false; };
  }, [activeId, documentLoadError]);

  useEffect(() => {
    document.title = `${t("appName")} — ${t("nav.docs")}`;
  }, [i18n.language, t]);

  async function createNewDocument() {
    try {
      const created = await createDocument(t("docs.untitled"));
      setActivePdfProjectId("");
      setActiveId(created.id);
      setSearchParams({ document: created.id }, { replace: true });
      setError("");
    } catch {
      setError(t("docs.saveError"));
    }
  }

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPdfImportStatus(t("docs.pdfImporting", { name: file.name }));
    setPdfImportError("");
    try {
      const project = await importPdfProject(file);
      ignoredDocumentRoute.current = requestedDocumentId || null;
      setActiveId("");
      setActivePdfProjectId(project.id);
      setSearchParams({}, { replace: true });
      setPdfImportStatus(t("docs.pdfImportSuccess", { name: file.name }));
    } catch (reason) {
      setPdfImportStatus("");
      setPdfImportError(reason instanceof Error ? reason.message : t("docs.pdfImportError"));
    }
  }

  async function savePdfProject(project: import("../data/db").PdfProject) {
    await updatePdfProject(project);
  }

  async function createSubjectFromDocs(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await addSubject(newSubjectName);
      setNewSubjectName("");
      setSubjectError("");
      setSubjectFilter(created.id);
    } catch (reason) {
      setSubjectError(reason instanceof Error && reason.message === "invalid-subject" ? t("docs.subjectNameRequired") : t("docs.subjectSaveError"));
    }
  }

  async function renameSubjectFromDocs(event: React.FormEvent<HTMLFormElement>, subject: Subject) {
    event.preventDefault();
    try {
      await updateSubject(subject.id, subjectDrafts[subject.id] ?? subject.name);
      setSubjectDrafts((drafts) => { const next = { ...drafts }; delete next[subject.id]; return next; });
      setSubjectError("");
    } catch (reason) {
      setSubjectError(reason instanceof Error && reason.message === "invalid-subject" ? t("docs.subjectNameRequired") : t("docs.subjectSaveError"));
    }
  }

  async function deleteSubjectFromDocs(subject: Subject) {
    if (!window.confirm(t("docs.confirmDeleteSubject", { name: subject.name }))) return;
    try {
      await removeSubject(subject.id);
      if (subjectFilter === subject.id) setSubjectFilter("");
      setSubjectError("");
    } catch (reason) {
      setSubjectError(reason instanceof Error && reason.message === "subject-in-use" ? t("docs.subjectInUse") : t("docs.subjectSaveError"));
    }
  }

  async function updateDocument(updated: SchoolDocument) {
    try {
      const next = { ...updated, updatedAt: Date.now(), title: updated.title.slice(0, 160) };
      await db.documents.put(next);
      setError("");
    } catch {
      setSaveState("error");
      setError(t("docs.saveError"));
    }
  }

  async function duplicateActive() {
    if (!activeDocument) return;
    try {
      const duplicate = await duplicateDocument(activeDocument.id, t("docs.copySuffix"));
      setActiveId(duplicate.id);
      setSearchParams({ document: duplicate.id }, { replace: true });
    } catch {
      setError(t("docs.saveError"));
    }
  }

  async function deleteActive() {
    if (!activeDocument || !window.confirm(t("docs.confirmDelete", { title: activeDocument.title }))) return;
    try {
      await deleteDocument(activeDocument.id);
      const nextId = documents.find((item) => item.id !== activeDocument.id)?.id ?? "";
      setActiveId(nextId);
      setSearchParams(nextId ? { document: nextId } : {}, { replace: true });
      setStoredContent(null);
      setError("");
    } catch {
      setError(t("docs.saveError"));
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("kxnodesk-docs-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function togglePaper() {
    setDarkPaper((current) => {
      const next = !current;
      localStorage.setItem("kxnodesk-docs-dark-paper", String(next));
      return next;
    });
  }

  const savedLabel = saveState === "saving" ? t("docs.saving") : saveState === "error" ? t("docs.saveError") : t("docs.saved");

  return (
    <section className="docs-unified-page" aria-label={t("nav.docs")}>
      <header className="docs-unified-toolbar">
        <nav className="docs-section-tabs" aria-label={t("docs.sections")}>
          {(["documents", "notes", "tasks"] as const).map((value) => (
            <button key={value} type="button" aria-current={section === value ? "page" : undefined} className={section === value ? "is-active" : ""} onClick={() => selectSection(value)}>{t(`docs.section.${value}`)}</button>
          ))}
        </nav>
        <>
          <label className="docs-subject-filter">
            <span>{t("docs.subjectFilter")}</span>
            <select aria-label={t("docs.subjectFilter")} value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="">{t("docs.allSubjects")}</option>
              <option value="__no_subject__">{t("docs.noSubjectFilter")}</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <button type="button" className={`docs-subject-manage${subjectsOpen ? " is-active" : ""}`} aria-expanded={subjectsOpen} onClick={() => { setSubjectsOpen((open) => !open); setSubjectError(""); }}>{t("docs.manageSubjects")}</button>
        </>
      </header>
      {subjectsOpen && (
        <section className="docs-subject-panel" aria-label={t("docs.manageSubjects")}>
          <form className="docs-subject-create" onSubmit={(event) => void createSubjectFromDocs(event)}>
            <input aria-label={t("docs.newSubject")} maxLength={80} onChange={(event) => setNewSubjectName(event.target.value)} placeholder={t("docs.newSubject")} value={newSubjectName} />
            <button type="submit">{t("docs.addSubject")}</button>
          </form>
          <div className="docs-subject-list">
            {subjects.map((subject) => (
              <form key={subject.id} onSubmit={(event) => void renameSubjectFromDocs(event, subject)}>
                <input aria-label={t("docs.renameSubject", { name: subject.name })} maxLength={80} onChange={(event) => setSubjectDrafts((drafts) => ({ ...drafts, [subject.id]: event.target.value }))} value={subjectDrafts[subject.id] ?? subject.name} />
                <button type="submit">{t("docs.saveSubject")}</button>
                <button type="button" onClick={() => void deleteSubjectFromDocs(subject)}>{t("docs.deleteSubject")}</button>
              </form>
            ))}
            {!subjects.length && <span>{t("docs.noSubjects")}</span>}
          </div>
          {subjectError && <p role="alert">{subjectError}</p>}
        </section>
      )}
      {section === "notes" ? <Suspense fallback={<div className="docs-loading" role="status">{t("app.loading")}</div>}><NotesSection subjectFilter={subjectFilter} /></Suspense>
        : section === "tasks" ? <Suspense fallback={<div className="docs-loading" role="status">{t("app.loading")}</div>}><TasksSection subjectFilter={subjectFilter} /></Suspense>
        : <section className={`docs-page${sidebarCollapsed ? " docs-page--sidebar-collapsed" : ""}`} aria-label={t("docs.section.documents")}>
      <aside id="docs-document-sidebar" className="docs-sidebar">
        <header className="docs-sidebar__header">
          {!sidebarCollapsed && <strong>{t("nav.docs")}</strong>}
          <button id="docs-sidebar-toggle" className="docs-icon-button" type="button" aria-label={sidebarCollapsed ? t("docs.expandSidebar") : t("docs.collapseSidebar")} aria-expanded={!sidebarCollapsed} aria-controls="docs-document-sidebar" onClick={toggleSidebar}>
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </header>
        {!sidebarCollapsed && (
          <>
            <button className="docs-new-button" type="button" onClick={() => void createNewDocument()}><FilePlus2 size={14} />{t("docs.new")}</button>
          <button className="docs-import-pdf-button" type="button" onClick={() => pdfInput.current?.click()}><FileUp size={14} />{t("docs.pdfImport")}</button>
          <input ref={pdfInput} className="docs-pdf-input" type="file" accept="application/pdf,.pdf" aria-label={t("docs.pdfImport")} onChange={(event) => void importPdf(event)} />
          {pdfImportStatus && <p className="docs-pdf-feedback" role="status">{pdfImportStatus}</p>}
          {pdfImportError && <p className="docs-pdf-feedback docs-pdf-feedback--error" role="alert">{pdfImportError}</p>}
          <label className="docs-search"><Search size={13} /><input aria-label={t("docs.search")} placeholder={t("docs.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="docs-document-list">
              {visibleDocuments.map((item) => (
                <button key={item.id} type="button" className={`docs-document-row${item.id === activeId ? " is-active" : ""}`} aria-current={item.id === activeId ? "page" : undefined} onClick={() => {
                  setActivePdfProjectId("");
                  setActiveId(item.id);
                  setSearchParams({ document: item.id }, { replace: true });
                }}>
                  <FileText size={14} />
                  <span><strong>{item.title || t("docs.untitled")}</strong><small>{new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(item.updatedAt)}</small></span>
                </button>
              ))}
              {!visibleDocuments.length && <p className="docs-empty-list">{documents.length || pdfProjects.length ? t("docs.noResults") : t("docs.noDocuments")}</p>}
              {!!visiblePdfProjects.length && <div className="docs-pdf-list">
                <span>{t("docs.pdfProjects")}</span>
                {visiblePdfProjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`docs-document-row${item.id === activePdfProjectId ? " is-active" : ""}`}
                    aria-current={item.id === activePdfProjectId ? "page" : undefined}
                    onClick={() => {
                      setActiveId("");
                      setActivePdfProjectId(item.id);
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    <FileText size={14} />
                    <span><strong>{item.title}</strong><small>{t("docs.pdfPageCount", { count: item.pageCount })}</small></span>
                  </button>
                ))}
              </div>}
            </div>
          </>
        )}
      </aside>
      <main className="docs-main">
        {activePdfProjectId ? activePdfProject ? (
          <PdfAnnotationWorkspace
            key={activePdfProject.id}
            project={activePdfProject}
            subjects={subjects}
            onProjectChange={savePdfProject}
            onBack={() => {
              setActivePdfProjectId("");
              const nextId = documents[0]?.id ?? "";
              setActiveId(nextId);
              setSearchParams(nextId ? { document: nextId } : {}, { replace: true });
            }}
          />
        ) : <div className="docs-loading" role="status"><LoaderCircle size={16} />{t("docs.pdfLoading")}</div> : activeDocument && storedContent && !loadingContent ? (
          <Suspense fallback={<div className="docs-loading" role="status">{t("app.loading")}</div>}>
            <DocumentEditor
              key={activeDocument.id}
              documentInfo={activeDocument}
              storedContent={storedContent}
              darkPaper={darkPaper}
              saveState={saveState}
              onToggleDarkPaper={togglePaper}
              onDocumentChange={(next) => void updateDocument(next)}
              onDuplicate={() => void duplicateActive()}
              onDelete={() => void deleteActive()}
              onSaveState={setSaveState}
              subjects={subjects}
            />
          </Suspense>
        ) : loadingContent ? (
          <div className="docs-loading" role="status"><LoaderCircle size={16} />{t("app.loading")}</div>
        ) : (
          <div className="docs-empty-state">
            <FileText size={24} />
            <strong>{t("docs.welcome")}</strong>
            <p>{t("docs.noDocuments")}</p>
            <button className="docs-new-button" type="button" onClick={() => void createNewDocument()}><FilePlus2 size={14} />{t("docs.new")}</button>
          </div>
        )}
        {error && <p className="docs-error" role="alert">{error}</p>}
        {activeDocument && <span className="docs-page-save-status" role="status">{savedLabel}</span>}
      </main>
      </section>}
    </section>
  );
}
