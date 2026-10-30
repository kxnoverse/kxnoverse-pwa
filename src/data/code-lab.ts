import { createId, db, type CodeLabProgress, type CodeProject } from "./db";

export interface CodeLessonCode {
  html: string;
  css: string;
  javascript: string;
}

export interface CodeLesson {
  id: string;
  titleKey: string;
  explanationKey: string;
  whyKey: string;
  example: string;
  resultKey: string;
  mistakeKey: string;
  taskKey: string;
  hintKeys: string[];
  starter: CodeLessonCode;
}

export const CODE_LESSONS: CodeLesson[] = [
  {
    id: "first-page",
    titleKey: "codeLab.lessons.firstPage.title",
    explanationKey: "codeLab.lessons.firstPage.explanation",
    whyKey: "codeLab.lessons.firstPage.why",
    example: "<!doctype html>\n<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>",
    resultKey: "codeLab.lessons.firstPage.result",
    mistakeKey: "codeLab.lessons.firstPage.mistake",
    taskKey: "codeLab.lessons.firstPage.task",
    hintKeys: ["codeLab.hints.firstPage.0", "codeLab.hints.firstPage.1"],
    starter: {
      html: "<!doctype html>\n<html>\n  <head>\n    <title>My first page</title>\n  </head>\n  <body>\n    \n  </body>\n</html>",
      css: "",
      javascript: "",
    },
  },
  {
    id: "headings-and-paragraphs",
    titleKey: "codeLab.lessons.headings.title",
    explanationKey: "codeLab.lessons.headings.explanation",
    whyKey: "codeLab.lessons.headings.why",
    example: "<h1>Page title</h1>\n<p>A supporting idea.</p>",
    resultKey: "codeLab.lessons.headings.result",
    mistakeKey: "codeLab.lessons.headings.mistake",
    taskKey: "codeLab.lessons.headings.task",
    hintKeys: ["codeLab.hints.headings.0", "codeLab.hints.headings.1"],
    starter: { html: "<h1>My page</h1>\n", css: "", javascript: "" },
  },
  {
    id: "css-colors-and-type",
    titleKey: "codeLab.lessons.colors.title",
    explanationKey: "codeLab.lessons.colors.explanation",
    whyKey: "codeLab.lessons.colors.why",
    example: "body {\n  color: #233;\n  font-family: Arial, sans-serif;\n}",
    resultKey: "codeLab.lessons.colors.result",
    mistakeKey: "codeLab.lessons.colors.mistake",
    taskKey: "codeLab.lessons.colors.task",
    hintKeys: ["codeLab.hints.colors.0", "codeLab.hints.colors.1"],
    starter: { html: "<h1>My page</h1>\n<p>I am learning to style a page.</p>", css: "body {\n  \n}", javascript: "" },
  },
  {
    id: "buttons-and-containers",
    titleKey: "codeLab.lessons.buttons.title",
    explanationKey: "codeLab.lessons.buttons.explanation",
    whyKey: "codeLab.lessons.buttons.why",
    example: ".card {\n  padding: 16px;\n  background: white;\n}\nbutton { padding: 8px; }",
    resultKey: "codeLab.lessons.buttons.result",
    mistakeKey: "codeLab.lessons.buttons.mistake",
    taskKey: "codeLab.lessons.buttons.task",
    hintKeys: ["codeLab.hints.buttons.0", "codeLab.hints.buttons.1"],
    starter: { html: '<div class="card">\n  <h1>A small card</h1>\n  <button>Press me</button>\n</div>', css: "", javascript: "" },
  },
  {
    id: "first-interaction",
    titleKey: "codeLab.lessons.interaction.title",
    explanationKey: "codeLab.lessons.interaction.explanation",
    whyKey: "codeLab.lessons.interaction.why",
    example: "button.addEventListener(\"click\", () => {\n  message.textContent = \"Clicked!\";\n});",
    resultKey: "codeLab.lessons.interaction.result",
    mistakeKey: "codeLab.lessons.interaction.mistake",
    taskKey: "codeLab.lessons.interaction.task",
    hintKeys: ["codeLab.hints.interaction.0", "codeLab.hints.interaction.1"],
    starter: {
      html: '<p id="message">Waiting for a click.</p>\n<button id="change-message">Say hello</button>',
      css: "",
      javascript: "",
    },
  },
];

export const STARTER_CODE_PROJECT: Omit<CodeProject, "id" | "createdAt" | "updatedAt"> = {
  name: "My first page",
  html: "<main class=\"card\">\n  <h1>Hello, web!</h1>\n  <p>Change this page and press Run.</p>\n  <button id=\"hello-button\">Click me</button>\n  <p id=\"message\"></p>\n</main>",
  css: "body {\n  margin: 24px;\n  font-family: Arial, sans-serif;\n  color: #202832;\n  background: #f3f6f8;\n}\n\n.card {\n  max-width: 520px;\n  padding: 24px;\n  background: white;\n  border: 1px solid #dce3e8;\n}\n\nbutton {\n  padding: 8px 12px;\n  cursor: pointer;\n}",
  javascript: "document.querySelector('#hello-button').addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'It works!';\n});",
};

export function isCodeProject(value: unknown): value is CodeProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<CodeProject>;
  return typeof project.id === "string" && project.id.length > 0 &&
    typeof project.name === "string" && project.name.trim().length > 0 &&
    typeof project.html === "string" && project.html.length <= 1_000_000 &&
    typeof project.css === "string" && project.css.length <= 1_000_000 &&
    typeof project.javascript === "string" && project.javascript.length <= 1_000_000 &&
    typeof project.createdAt === "number" && Number.isFinite(project.createdAt) &&
    typeof project.updatedAt === "number" && Number.isFinite(project.updatedAt);
}

export function isCodeLabProgress(value: unknown): value is CodeLabProgress {
  if (!value || typeof value !== "object") return false;
  const progress = value as Partial<CodeLabProgress>;
  if (progress.id !== "default" || typeof progress.currentLessonId !== "string" ||
    !Array.isArray(progress.completedLessonIds) || !progress.completedLessonIds.every((id) => typeof id === "string") ||
    typeof progress.updatedAt !== "number" || !Number.isFinite(progress.updatedAt) ||
    !progress.lessonCode || typeof progress.lessonCode !== "object" || Array.isArray(progress.lessonCode)) return false;
  return Object.values(progress.lessonCode).every((code) =>
    Boolean(code && typeof code.html === "string" && typeof code.css === "string" && typeof code.javascript === "string")
  );
}

export async function initializeCodeLab(): Promise<{ projects: CodeProject[]; progress: CodeLabProgress }> {
  await db.transaction("rw", db.codeProjects, db.codeLabProgress, async () => {
    const savedProgress = await db.codeLabProgress.get("default");
    if (!savedProgress && await db.codeProjects.count() === 0) {
      const now = Date.now();
      await db.codeProjects.add({ ...STARTER_CODE_PROJECT, id: createId(), createdAt: now, updatedAt: now });
    }
    if (!savedProgress) {
      await db.codeLabProgress.add({
        id: "default",
        currentLessonId: CODE_LESSONS[0].id,
        completedLessonIds: [],
        lessonCode: {},
        updatedAt: Date.now(),
      });
    }
  });
  const [projects, progress] = await Promise.all([
    db.codeProjects.orderBy("updatedAt").reverse().toArray(),
    db.codeLabProgress.get("default"),
  ]);
  if (!progress) throw new Error("Code Lab progress could not be initialized.");
  return { projects, progress };
}

export async function saveCodeProject(project: CodeProject): Promise<CodeProject> {
  const name = project.name.trim().slice(0, 100);
  if (!name) throw new Error("project-name-required");
  if (!isCodeProject({ ...project, name })) throw new Error("project-invalid");
  const existing = await db.codeProjects.get(project.id);
  const now = Date.now();
  const saved = { ...project, name, createdAt: existing?.createdAt ?? project.createdAt, updatedAt: now };
  await db.codeProjects.put(saved);
  return saved;
}

export async function createCodeProject(name: string): Promise<CodeProject> {
  const normalized = name.trim().slice(0, 100);
  if (!normalized) throw new Error("project-name-required");
  const now = Date.now();
  const project: CodeProject = {
    ...STARTER_CODE_PROJECT,
    name: normalized,
    html: "<main>\n  \n</main>",
    css: "",
    javascript: "",
    id: createId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.codeProjects.add(project);
  return project;
}

export async function duplicateCodeProject(project: CodeProject): Promise<CodeProject> {
  const now = Date.now();
  const copy = { ...project, id: createId(), name: `${project.name} copy`.slice(0, 100), createdAt: now, updatedAt: now };
  await db.codeProjects.add(copy);
  return copy;
}

export async function saveCodeLabProgress(progress: CodeLabProgress): Promise<CodeLabProgress> {
  if (!isCodeLabProgress(progress)) throw new Error("Code Lab progress is invalid.");
  const saved = { ...progress, updatedAt: Date.now() };
  await db.codeLabProgress.put(saved);
  return saved;
}

export function checkCodeLesson(lessonId: string, code: CodeLessonCode): boolean {
  const html = code.html;
  switch (lessonId) {
    case "first-page":
      return /<!doctype\s+html/i.test(html) && /<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html);
    case "headings-and-paragraphs":
      return /<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html) &&
        /<p\b[^>]*>[\s\S]*?\S[\s\S]*?<\/p>/i.test(html);
    case "css-colors-and-type":
      return /(?:^|[;{])\s*color\s*:/im.test(code.css) &&
        /(?:^|[;{])\s*font-family\s*:/im.test(code.css);
    case "buttons-and-containers":
      return /<button\b/i.test(html) && /class\s*=\s*["'][^"']*\bcard\b/i.test(html) &&
        /button\s*\{[^}]*\b(?:background|background-color|color|border|padding)\s*:/is.test(code.css) &&
        /\.card\s*\{[^}]*\b(?:background|background-color|border|padding|box-shadow)\s*:/is.test(code.css);
    case "first-interaction":
      return /<button\b/i.test(html) && /addEventListener\s*\(\s*["']click["']/i.test(code.javascript) &&
        /\.textContent\s*=/i.test(code.javascript);
    default:
      return false;
  }
}

function escapeScriptEndTags(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

export function buildCodePreviewDocument(html: string, css: string, javascript: string): string {
  const reporter = `window.addEventListener("error", event => parent.postMessage({type:"kxno-code-error", message:String(event.message || "JavaScript error").slice(0, 500)}, "*"));window.addEventListener("unhandledrejection", event => parent.postMessage({type:"kxno-code-error", message:String(event.reason || "Unhandled promise rejection").slice(0, 500)}, "*"));`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><script>${reporter}</script></head><body>${html}<script>${escapeScriptEndTags(javascript)}</script></body></html>`;
}
