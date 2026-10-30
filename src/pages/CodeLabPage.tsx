import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Play,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CodeInput } from "../components/CodeInput";
import { CodeReference } from "../components/CodeReference";
import { CodeWorkspace } from "../components/CodeWorkspace";
import {
  buildCodePreviewDocument,
  checkCodeLesson,
  CODE_LESSONS,
  createCodeProject,
  duplicateCodeProject,
  initializeCodeLab,
  saveCodeLabProgress,
  saveCodeProject,
} from "../data/code-lab";
import { db, type CodeLabProgress, type CodeProject } from "../data/db";

type Area = "learn" | "playground" | "garden";
type CodeField = "html" | "css" | "javascript";

const EMPTY_CODE = { html: "", css: "", javascript: "" };
const CodeGardenGame = lazy(() => import("./CodeGardenGame").then((module) => ({ default: module.CodeGardenGame })));

export function CodeLabPage() {
  const { t } = useTranslation();
  const previewRef = useRef<HTMLIFrameElement>(null);
  const lessonPreviewRef = useRef<HTMLIFrameElement>(null);
  const progressRef = useRef<CodeLabProgress | null>(null);
  const [area, setArea] = useState<Area>("learn");
  const [projects, setProjects] = useState<CodeProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [projectDraft, setProjectDraft] = useState<CodeProject | null>(null);
  const [lessonCode, setLessonCode] = useState<Record<string, typeof EMPTY_CODE>>({});
  const [progress, setProgress] = useState<CodeLabProgress | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState(CODE_LESSONS[0].id);
  const [hintCount, setHintCount] = useState(0);
  const [lessonFeedback, setLessonFeedback] = useState<"correct" | "tryAgain" | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [lessonPreviewError, setLessonPreviewError] = useState("");
  const [previewDocument, setPreviewDocument] = useState("");
  const [projectNameInput, setProjectNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty">("saved");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const currentLesson = CODE_LESSONS.find((lesson) => lesson.id === selectedLessonId) ?? CODE_LESSONS[0];
  const currentLessonCode = lessonCode[currentLesson.id] ?? currentLesson.starter;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const completedCount = progress?.completedLessonIds.length ?? 0;

  useEffect(() => {
    let active = true;
    initializeCodeLab()
      .then(({ projects: loadedProjects, progress: loadedProgress }) => {
        if (!active) return;
        setProjects(loadedProjects);
        setProgress(loadedProgress);
        progressRef.current = loadedProgress;
        setLessonCode(loadedProgress.lessonCode);
        setSelectedLessonId(
          CODE_LESSONS.some((lesson) => lesson.id === loadedProgress.currentLessonId)
            ? loadedProgress.currentLessonId
            : CODE_LESSONS[0].id,
        );
        setActiveProjectId(loadedProjects[0]?.id ?? "");
        setProjectDraft(loadedProjects[0] ?? null);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handlePreviewMessage(event: MessageEvent<unknown>) {
      const isPlaygroundPreview = event.source === previewRef.current?.contentWindow;
      const isLessonPreview = event.source === lessonPreviewRef.current?.contentWindow;
      if ((!isPlaygroundPreview && !isLessonPreview) || !event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; message?: unknown };
      if (message.type !== "kxno-code-error") return;
      const text = typeof message.message === "string" ? message.message.slice(0, 500) : t("codeLab.previewErrorFallback");
      if (isPlaygroundPreview) setPreviewError(text);
      if (isLessonPreview) setLessonPreviewError(text);
    }
    window.addEventListener("message", handlePreviewMessage);
    return () => window.removeEventListener("message", handlePreviewMessage);
  }, [t]);

  useEffect(() => {
    if (!progress || loading) return;
    const timer = window.setTimeout(() => {
      const latestProgress = progressRef.current;
      if (!latestProgress) return;
      void saveCodeLabProgress({
        ...latestProgress,
        currentLessonId: selectedLessonId,
        lessonCode: { ...lessonCode },
      }).then((saved) => {
        progressRef.current = saved;
        setProgress(saved);
      }).catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [lessonCode, loading, selectedLessonId]);

  useEffect(() => {
    if (!projectDraft || !activeProject || projectDraft.id !== activeProject.id) return;
    const changed = projectDraft.name !== activeProject.name ||
      projectDraft.html !== activeProject.html ||
      projectDraft.css !== activeProject.css ||
      projectDraft.javascript !== activeProject.javascript;
    setSaveState(changed ? "dirty" : "saved");
  }, [activeProject, projectDraft]);

  const lessonPreview = useMemo(
    () => buildCodePreviewDocument(currentLessonCode.html, currentLessonCode.css, currentLessonCode.javascript),
    [currentLessonCode],
  );
  const revealedHint = currentLesson.hintKeys.slice(0, hintCount);

  function updateLessonCode(field: CodeField, value: string) {
    setLessonFeedback(null);
    setLessonPreviewError("");
    setLessonCode((previous) => ({
      ...previous,
      [currentLesson.id]: { ...currentLessonCode, [field]: value },
    }));
  }

  function selectLesson(id: string) {
    setSelectedLessonId(id);
    setHintCount(0);
    setLessonFeedback(null);
  }

  async function completeLesson() {
    if (!progress) return;
    if (!checkCodeLesson(currentLesson.id, currentLessonCode)) {
      setLessonFeedback("tryAgain");
      return;
    }
    const completed = [...new Set([...progress.completedLessonIds, currentLesson.id])];
    const currentIndex = CODE_LESSONS.findIndex((lesson) => lesson.id === currentLesson.id);
    const nextId = CODE_LESSONS[currentIndex].id;
    const saved = await saveCodeLabProgress({
      ...progress,
      completedLessonIds: completed,
      currentLessonId: nextId,
      lessonCode: { ...lessonCode, [currentLesson.id]: currentLessonCode },
    });
    progressRef.current = saved;
    setProgress(saved);
    setSelectedLessonId(nextId);
    setLessonFeedback("correct");
    setHintCount(0);
  }

  function runCode(code: Pick<CodeProject, "html" | "css" | "javascript">) {
    setPreviewError("");
    setPreviewDocument(buildCodePreviewDocument(code.html, code.css, code.javascript));
  }

  function selectProject(project: CodeProject) {
    setActiveProjectId(project.id);
    setProjectDraft(project);
    setPreviewError("");
    setSaveState("saved");
  }

  async function makeProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const project = await createCodeProject(projectNameInput);
    setProjects((current) => [project, ...current]);
    selectProject(project);
    setProjectNameInput("");
    setCreating(false);
    setPreviewDocument(buildCodePreviewDocument(project.html, project.css, project.javascript));
  }

  async function saveProject() {
    if (!projectDraft) return;
    const saved = await saveCodeProject(projectDraft);
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
    setProjectDraft(saved);
    setSaveState("saved");
  }

  async function copyProject() {
    if (!projectDraft) return;
    const copy = await duplicateCodeProject(projectDraft);
    setProjects((current) => [copy, ...current]);
    selectProject(copy);
  }

  async function deleteProject() {
    if (!projectDraft || !window.confirm(t("codeLab.deleteConfirm"))) return;
    await db.codeProjects.delete(projectDraft.id);
    const remaining = projects.filter((project) => project.id !== projectDraft.id);
    setProjects(remaining);
    setProjectDraft(remaining[0] ?? null);
    setActiveProjectId(remaining[0]?.id ?? "");
    setPreviewDocument("");
    setSaveState("saved");
  }

  async function renameProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectDraft || !projectNameInput.trim()) return;
    const saved = await saveCodeProject({ ...projectDraft, name: projectNameInput });
    setProjects((current) => current.map((project) => project.id === saved.id ? saved : project));
    setProjectDraft(saved);
    setProjectNameInput("");
    setRenaming(false);
  }

  function runSafely(action: () => Promise<unknown>) {
    void action().catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }

  async function continueLesson() {
    if (!progress) return;
    const index = CODE_LESSONS.findIndex((lesson) => lesson.id === selectedLessonId);
    const nextId = CODE_LESSONS[Math.min(index + 1, CODE_LESSONS.length - 1)].id;
    const saved = await saveCodeLabProgress({ ...progress, currentLessonId: nextId });
    progressRef.current = saved;
    setProgress(saved);
    selectLesson(nextId);
  }

  function editProject(field: CodeField, value: string) {
    setProjectDraft((draft) => draft ? { ...draft, [field]: value } : draft);
  }

  const windowLabels = {
    windows: t("codeLab.windowMenu"),
    reset: t("codeLab.resetLayout"),
    balanced: t("codeLab.layoutBalanced"),
    focus: t("codeLab.layoutFocus"),
    reference: t("codeLab.layoutReference"),
    minimize: t("codeLab.windowMinimize"),
    maximize: t("codeLab.windowMaximize"),
    restore: t("codeLab.windowRestore"),
    close: t("codeLab.windowClose"),
    openWindow: t("codeLab.windowOpen"),
    layoutError: t("codeLab.layoutError"),
  };
  const learnWindows = [
    {
      id: "lessons", title: t("codeLab.lessonList"), initial: { x: 0.01, y: 0.02, width: 0.19, height: 0.96 }, minWidth: 190,
      content: <aside className="code-lab__lesson-list">
        <h2>{t("codeLab.lessonList")}</h2>
        {CODE_LESSONS.map((lesson, index) => {
          const isComplete = progress?.completedLessonIds.includes(lesson.id) ?? false;
          return <button aria-current={selectedLessonId === lesson.id ? "step" : undefined} className={selectedLessonId === lesson.id ? "is-active" : ""} key={lesson.id} onClick={() => selectLesson(lesson.id)} type="button">
            <span className="code-lab__lesson-number">{isComplete ? <Check size={12} /> : `0${index + 1}`}</span><span>{t(lesson.titleKey)}</span>
          </button>;
        })}
      </aside>,
    },
    {
      id: "instructions", title: t("codeLab.lessonInstructions"), initial: { x: 0.22, y: 0.02, width: 0.37, height: 0.43 },
      content: <div className="code-lab__lesson-copy">
        <span className="code-lab__section-label">{t("codeLab.lessonLearning")}</span>
        <h1>{t(currentLesson.titleKey)}</h1>
        <p>{t(currentLesson.explanationKey)}</p>
        <div className="code-lab__lesson-why"><b>{t("codeLab.lessonWhy")}</b><p>{t(currentLesson.whyKey)}</p></div>
        <div className="code-lab__lesson-example"><b>{t("codeLab.lessonExample")}</b><pre>{currentLesson.example}</pre><p>{t(currentLesson.resultKey)}</p></div>
        <div className="code-lab__task"><span>{t("codeLab.task")}</span><p>{t(currentLesson.taskKey)}</p></div>
        <div className="code-lab__lesson-mistake"><b>{t("codeLab.lessonCommonMistake")}</b><p>{t(currentLesson.mistakeKey)}</p></div>
      </div>,
    },
    {
      id: "editor", title: t("codeLab.editors"), initial: { x: 0.22, y: 0.48, width: 0.4, height: 0.5 },
      content: <div className="code-lab__editors">
        <CodeEditor field="html" label={t("codeLab.html")} onChange={(value) => updateLessonCode("html", value)} value={currentLessonCode.html} />
        <CodeEditor field="css" label={t("codeLab.css")} onChange={(value) => updateLessonCode("css", value)} value={currentLessonCode.css} />
        {currentLesson.id === "first-interaction" && <CodeEditor field="javascript" label={t("codeLab.javascript")} onChange={(value) => updateLessonCode("javascript", value)} value={currentLessonCode.javascript} />}
        <div className="code-lab__lesson-actions">
          <button className="button button--quiet" onClick={() => setHintCount((count) => Math.min(count + 1, currentLesson.hintKeys.length))} type="button">{t("codeLab.hint")}</button>
          <button className="button button--primary" onClick={() => runSafely(completeLesson)} type="button"><Check size={13} />{t("codeLab.check")}</button>
        </div>
        {revealedHint.length > 0 && <ol className="code-lab__hints">{revealedHint.map((hint) => <li key={hint}>{t(hint)}</li>)}</ol>}
        {lessonFeedback && <p className={`code-lab__feedback code-lab__feedback--${lessonFeedback}`} role="status">{t(`codeLab.${lessonFeedback}`)}
          {lessonFeedback === "correct" && <button type="button" onClick={() => runSafely(continueLesson)}>{t("codeLab.continue")}<ChevronRight size={13} /></button>}
        </p>}
      </div>,
    },
    {
      id: "preview", title: t("codeLab.preview"), initial: { x: 0.64, y: 0.48, width: 0.35, height: 0.5 },
      content: <div className="code-lab__preview">
        <div className="code-lab__preview-header"><span>{t("codeLab.preview")}</span>{lessonPreviewError && <span className="code-lab__preview-error">{t("codeLab.previewError")}: {lessonPreviewError}</span>}{!lessonPreviewError && <ExternalLink size={13} />}</div>
        <iframe key={`${currentLesson.id}:${lessonPreview}`} ref={lessonPreviewRef} aria-label={t("codeLab.preview")} sandbox="allow-scripts" srcDoc={lessonPreview} title={t("codeLab.preview")} />
      </div>,
    },
    {
      id: "reference", title: t("codeLab.reference.title"), initial: { x: 0.62, y: 0.02, width: 0.37, height: 0.43 },
      content: <CodeReference />,
    },
  ];
  const playgroundWindows = [
    {
      id: "explorer", title: t("codeLab.projects"), initial: { x: 0.01, y: 0.02, width: 0.2, height: 0.96 }, minWidth: 190,
      content: <aside className="code-lab__projects">
        <div className="code-lab__projects-head"><h2>{t("codeLab.projects")}</h2><button aria-label={t("codeLab.newProject")} className="code-lab__icon-button" onClick={() => { setProjectNameInput(""); setCreating(true); }} type="button"><Plus size={14} /></button></div>
        {projects.length === 0 && <p className="code-lab__muted">{t("codeLab.noProjects")}</p>}
        {projects.map((project) => <button aria-current={project.id === activeProjectId ? "page" : undefined} className={project.id === activeProjectId ? "is-active" : ""} key={project.id} onClick={() => selectProject(project)} type="button"><Code2 size={13} /><span>{project.name}</span></button>)}
      </aside>,
    },
    {
      id: "editor", title: t("codeLab.editors"), initial: { x: 0.23, y: 0.02, width: 0.43, height: 0.96 },
      content: projectDraft ? <div className="code-lab__playground-main">
        <div className="code-lab__project-toolbar">
          <div className="code-lab__project-name">
            {renaming ? <form onSubmit={(event) => { event.preventDefault(); runSafely(() => renameProject(event)); }}>
              <input aria-label={t("codeLab.projectName")} autoFocus maxLength={100} onChange={(event) => setProjectNameInput(event.target.value)} value={projectNameInput} />
              <button className="code-lab__icon-button" type="submit" aria-label={t("codeLab.rename")}><Check size={13} /></button>
            </form> : <><h1>{projectDraft.name}</h1><button className="code-lab__text-button" onClick={() => { setProjectNameInput(projectDraft.name); setRenaming(true); }} type="button">{t("codeLab.rename")}</button></>}
            <span className={saveState === "dirty" ? "is-dirty" : ""}>{t(saveState === "dirty" ? "codeLab.unsaved" : "codeLab.saved")}</span>
          </div>
          <div className="code-lab__project-actions">
            <button className="button button--quiet" onClick={() => runSafely(copyProject)} type="button"><Copy size={13} />{t("codeLab.duplicate")}</button>
            <button className="button button--quiet" onClick={() => runSafely(deleteProject)} type="button"><Trash2 size={13} />{t("codeLab.delete")}</button>
            <button className="button button--quiet" onClick={() => runSafely(saveProject)} type="button"><Save size={13} />{t("codeLab.save")}</button>
            <button className="button button--primary" onClick={() => runCode(projectDraft)} type="button"><Play size={13} />{t("codeLab.run")}</button>
          </div>
        </div>
        <div className="code-lab__playground-editors">
          <CodeEditor field="html" label={t("codeLab.html")} onChange={(value) => editProject("html", value)} value={projectDraft.html} />
          <CodeEditor field="css" label={t("codeLab.css")} onChange={(value) => editProject("css", value)} value={projectDraft.css} />
          <CodeEditor field="javascript" label={t("codeLab.javascript")} onChange={(value) => editProject("javascript", value)} value={projectDraft.javascript} />
        </div>
      </div> : <div className="code-lab__empty"><Code2 size={20} /><p>{t("codeLab.noProjects")}</p><button className="button button--primary" onClick={() => { setProjectNameInput(""); setCreating(true); }} type="button"><Plus size={13} />{t("codeLab.newProject")}</button></div>,
    },
    {
      id: "preview", title: t("codeLab.preview"), initial: { x: 0.68, y: 0.02, width: 0.31, height: 0.59 },
      content: <div className="code-lab__preview code-lab__preview--playground">
        <div className="code-lab__preview-header"><span>{t("codeLab.preview")}</span>{previewError && <span className="code-lab__preview-error">{t("codeLab.previewError")}: {previewError}</span>}</div>
        <iframe ref={previewRef} aria-label={t("codeLab.preview")} sandbox="allow-scripts" srcDoc={previewDocument} title={t("codeLab.preview")} />
      </div>,
    },
    { id: "reference", title: t("codeLab.reference.title"), initial: { x: 0.68, y: 0.64, width: 0.31, height: 0.34 }, content: <CodeReference /> },
  ];

  if (loading) {
    return <section className="code-lab feature-page" aria-busy="true"><p className="route-loading">{t("app.loading")}</p></section>;
  }

  return (
    <section className="code-lab feature-page">
      <header className="code-lab__heading">
        <div>
          <div className="code-lab__eyebrow"><Code2 size={14} />{t("codeLab.title")}</div>
          <p>{t("codeLab.subtitle")}</p>
        </div>
        {area === "learn" && (
          <div className="code-lab__progress">{t("codeLab.lessonProgress", { done: completedCount, total: CODE_LESSONS.length })}</div>
        )}
      </header>

      <nav className="code-lab__tabs" aria-label={t("codeLab.title")}>
        {(["learn", "playground", "garden"] as const).map((tab) => (
          <button
            aria-current={area === tab ? "page" : undefined}
            className={area === tab ? "is-active" : ""}
            key={tab}
            onClick={() => setArea(tab)}
            type="button"
          >
            {t(`codeLab.${tab}`)}
          </button>
        ))}
      </nav>

      {loadError && <p className="code-lab__error" role="alert">{loadError}</p>}

      {area === "learn" && <CodeWorkspace key="learn" mode="learn" windows={learnWindows} labels={windowLabels} />}
      {area === "playground" && <CodeWorkspace key="playground" mode="playground" windows={playgroundWindows} labels={windowLabels} />}

      {area === "garden" && (
        <Suspense fallback={<p className="route-loading" role="status">{t("app.loading")}</p>}>
          <CodeGardenGame />
        </Suspense>
      )}

      {creating && (
        <div className="code-lab__dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}>
          <form aria-label={t("codeLab.newProject")} className="code-lab__dialog" onSubmit={(event) => { event.preventDefault(); runSafely(() => makeProject(event)); }}>
            <h2>{t("codeLab.newProject")}</h2>
            <label>{t("codeLab.projectName")}<input autoFocus maxLength={100} onChange={(event) => setProjectNameInput(event.target.value)} value={projectNameInput} /></label>
            <div><button className="button button--quiet" onClick={() => setCreating(false)} type="button">{t("codeLab.cancel")}</button><button className="button button--primary" disabled={!projectNameInput.trim()} type="submit">{t("codeLab.createProject")}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}

function CodeEditor({ field, label, value, onChange }: { field: CodeField; label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <label className="code-lab__editor">
      <span><i data-language={field} />{label}</span>
      <CodeInput
        language={field}
        label={`${label} ${t("codeLab.editCode")}`}
        onChange={onChange}
        value={value}
      />
    </label>
  );
}
