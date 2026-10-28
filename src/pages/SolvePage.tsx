import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Download, FileCheck2, FilePlus2, FileText, LoaderCircle, ScanText } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TurnstileChallenge } from "../components/TurnstileChallenge";
import { assistantAttachmentToBase64, assistantClient, AssistantServiceError, validateAssistantAttachmentContent } from "../data/ai-client";
import { readBlobAsArrayBuffer } from "../data/blob-utils";
import { db } from "../data/db";
import {
  createSolvedPdf,
  getPdfPageCount,
  parseSolveResponse,
  SolveResponseError,
  type SolveAnalysis,
} from "../data/solve";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const ASSISTANT_PRESET = {
  assistantName: "Kxno",
  style: "Clear, concise, and educational",
  length: "medium",
  depth: "guided",
  language: "auto",
  instructions: "For PDF exercise sheets, account for every readable question, including longer responses. Do not invent text or answers; mark genuinely unclear items unanswered with a reason.",
};

function solvePrompt(language: string, pageCount: number): string {
  return [
    "Solve every readable worksheet question, including longer explanatory questions and every individual table row or subquestion.",
    "First create a complete inventory of all detected questions. Keep each original number and table/subquestion label exactly as printed (for example 13, 8a, or b); do not create a second entry for a question number.",
    "Use one stable id per distinct question. Include each inventory id exactly once in either answers or unanswered. Never omit an unclear or unsupported question: record it as unanswered with a short reason. Never guess an answer.",
    "For an answer, include page and placement only if the corresponding blank answer area is clearly visible and its bounding box can be identified with confidence. Otherwise omit placement; the application will put that answer on the answer sheet. Never guess coordinates.",
    "Return only valid JSON with this schema:",
    '{"detectedQuestions":[{"id":"13","label":"13","question":"Original question text","page":1}],"answers":[{"questionId":"13","answer":"Answer text","page":1,"placement":{"x":0.1,"y":0.2,"width":0.2,"height":0.04,"confidence":0.98}}],"unanswered":[{"questionId":"14","reason":"The question is unclear"}]}',
    `Use the response language ${language === "de" ? "German" : "English"}.`,
    `The PDF has ${pageCount} pages. Page numbers are 1-based. Placement x/y/width/height are normalized from the page's top-left corner, each from 0 to 1. Include placement only when confidence is at least 0.92 and the full answer fits the visible blank answer area; otherwise omit placement. Preserve mathematical symbols, chemical subscripts, and complete reasoning where needed. Keep question text under 2,000 characters and each answer under 4,000 characters. Return at most 60 detected questions.`,
  ].join("\n");
}

function getErrorMessage(cause: unknown, t: (key: string) => string): string {
  if (cause instanceof AssistantServiceError) return t(`assistant.serviceErrors.${cause.code}`);
  if (cause instanceof DOMException && cause.name === "AbortError") return t("solve.cancelled");
  if (cause instanceof SolveResponseError) {
    if (cause.code === "incompleteResponse") {
      return t("solve.incompleteResponse").replace(
        "{{questions}}",
        () => cause.references.join(", ") || t("solve.unknownQuestions"),
      );
    }
    return t("solve.invalidResponse");
  }
  return t("solve.failed");
}

export function SolvePage() {
  const { t, i18n } = useTranslation();
  const endpoint = useLiveQuery(() => db.settings.get("aiBackendUrl"), [], undefined)?.value.trim() ?? "";
  const cloudEnabled = useLiveQuery(() => db.settings.get("aiCloudEnabled"), [], undefined)?.value === "true";
  const consentEndpoint = useLiveQuery(() => db.settings.get("aiCloudConsentEndpoint"), [], undefined)?.value;
  const siteKey = useLiveQuery(() => db.settings.get("turnstileSiteKey"), [], undefined)?.value.trim() ?? "";
  const canUseCloud = Boolean(endpoint && cloudEnabled && consentEndpoint === endpoint && siteKey);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingToken = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const [challengeRequestId, setChallengeRequestId] = useState(0);
  const [sourceFile, setSourceFile] = useState<File>();
  const [pageCount, setPageCount] = useState(0);
  const [analysis, setAnalysis] = useState<SolveAnalysis>();
  const [solvedPdf, setSolvedPdf] = useState<Blob>();
  const [sourceUrl, setSourceUrl] = useState("");
  const [solvedUrl, setSolvedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providerRequestCount, setProviderRequestCount] = useState<number>();

  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  useEffect(() => {
    if (!solvedPdf) {
      setSolvedUrl("");
      return;
    }
    const url = URL.createObjectURL(solvedPdf);
    setSolvedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [solvedPdf]);

  useEffect(() => () => {
    controller.current?.abort();
    pendingToken.current?.reject(new DOMException("Request cancelled.", "AbortError"));
    pendingToken.current = undefined;
  }, []);

  function receiveToken(token: string) {
    const pending = pendingToken.current;
    if (!pending || !token) return;
    pendingToken.current = undefined;
    pending.resolve(token);
  }

  function rejectToken(cause: Error) {
    const pending = pendingToken.current;
    if (!pending) return;
    pendingToken.current = undefined;
    pending.reject(cause);
  }

  function requestTurnstileToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (pendingToken.current) {
        reject(new Error("A verification is already in progress."));
        return;
      }
      pendingToken.current = { resolve, reject };
      setChallengeRequestId((current) => current + 1);
    });
  }

  async function selectPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_PDF_SIZE) {
      setError(t(file.size > MAX_PDF_SIZE ? "solve.fileTooLarge" : "solve.invalidPdf"));
      return;
    }
    setBusy(true);
    try {
      if (!await validateAssistantAttachmentContent(file, "application/pdf")) throw new Error("invalidPdf");
      const count = await getPdfPageCount(await readBlobAsArrayBuffer(file));
      if (!count) throw new Error("invalidPdf");
      setSourceFile(file);
      setPageCount(count);
      setAnalysis(undefined);
      setSolvedPdf(undefined);
      setProviderRequestCount(undefined);
      setError("");
    } catch {
      setError(t("solve.invalidPdf"));
    } finally {
      setBusy(false);
    }
  }

  async function analyzePdf() {
    if (!sourceFile || !canUseCloud || busy) return;
    setBusy(true);
    setError("");
    setAnalysis(undefined);
    setSolvedPdf(undefined);
    setProviderRequestCount(0);
    const abortController = new AbortController();
    controller.current = abortController;
    try {
      const turnstileToken = await requestTurnstileToken();
      if (abortController.signal.aborted) return;
      const data = await assistantAttachmentToBase64(sourceFile);
      let response = "";
      await assistantClient.send({
        endpoint,
        turnstileToken,
        message: solvePrompt(i18n.language, pageCount),
        model: "openrouter/free",
        preset: ASSISTANT_PRESET,
        history: [],
        attachments: [{ name: sourceFile.name, mimeType: "application/pdf", size: sourceFile.size, data }],
      }, {
        signal: abortController.signal,
        onToken: (token) => { response += token; },
        onProgress: () => undefined,
        onProviderRequest: () => setProviderRequestCount((count) => (count ?? 0) + 1),
      });
      setAnalysis(parseSolveResponse(response, pageCount));
    } catch (cause) {
      setError(getErrorMessage(cause, t));
    } finally {
      if (controller.current === abortController) controller.current = undefined;
      pendingToken.current = undefined;
      setBusy(false);
    }
  }

  function cancelAnalysis() {
    controller.current?.abort();
    controller.current = undefined;
    pendingToken.current?.reject(new DOMException("Request cancelled.", "AbortError"));
    pendingToken.current = undefined;
    setBusy(false);
  }

  function updateQuestion(id: string, field: "question" | "answer", value: string) {
    setAnalysis((current) => current ? {
      questions: current.questions.map((item) => {
        if (item.id !== id) return item;
        if (field === "question") return { ...item, question: value };
        return { ...item, answer: value.trim() ? value : null, ...(value.trim() ? { reason: undefined } : {}) };
      }),
    } : current);
    setSolvedPdf(undefined);
  }

  async function generatePdf() {
    if (!sourceFile || !analysis?.questions.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(sourceFile));
      const output = await createSolvedPdf(bytes, analysis);
      setSolvedPdf(new Blob([output], { type: "application/pdf" }));
    } catch {
      setError(t("solve.exportFailed"));
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    if (!solvedUrl || !sourceFile) return;
    const baseName = sourceFile.name.replace(/\.pdf$/i, "");
    const anchor = document.createElement("a");
    anchor.href = solvedUrl;
    anchor.download = `${baseName}-solved.pdf`;
    anchor.click();
  }

  const unanswered = analysis?.questions.filter((item) => item.answer === null) ?? [];

  return (
    <section className="feature-page solve-page">
      <header className="page-heading--compact feature-heading solve-heading">
        <div>
          <span className="solve-kicker"><FileCheck2 size={14} />{t("solve.kicker")}</span>
          <h1>{t("nav.solve")}</h1>
          <p>{t("solve.subtitle")}</p>
        </div>
        <span className="status-pill">{t("solve.experimental")}</span>
      </header>

      <div className="solve-disclaimer" role="note">
        <AlertTriangle size={16} />
        <p>{t("solve.disclaimer")}</p>
      </div>

      <section className="solve-workspace" aria-label={t("solve.workspace")}>
        <div className="solve-controls">
          <div className="solve-upload">
            <input ref={fileInput} accept="application/pdf,.pdf" aria-label={t("solve.choosePdf")} hidden onChange={(event) => void selectPdf(event)} type="file" />
            <button className="button button--quiet" disabled={busy} onClick={() => fileInput.current?.click()} type="button">
              <FilePlus2 size={14} />{sourceFile ? t("solve.replacePdf") : t("solve.choosePdf")}
            </button>
            {sourceFile && <span className="solve-file-name"><FileText size={13} />{sourceFile.name} · {t("solve.pageCount", { count: pageCount })}</span>}
          </div>

          {!canUseCloud && (
            <div className="solve-setup-notice">
              <p>{t("solve.setupRequired")}</p>
              <Link className="button button--quiet" to="/settings">{t("solve.openSettings")}</Link>
            </div>
          )}

          {canUseCloud && (
            <div className="solve-verification">
              <TurnstileChallenge action="chat" onError={rejectToken} onToken={receiveToken} requestId={challengeRequestId} siteKey={siteKey} />
            </div>
          )}

          <div className="solve-actions">
            <button className="button button--primary" disabled={!sourceFile || !canUseCloud || busy} onClick={() => void analyzePdf()} type="button">
              {busy && !analysis ? <LoaderCircle className="solve-spinner" size={14} /> : <ScanText size={14} />}
              {busy && !analysis ? t("solve.analyzing") : t("solve.analyze")}
            </button>
            {busy && <button className="button button--quiet" onClick={cancelAnalysis} type="button">{t("solve.cancel")}</button>}
            {!!analysis?.questions.length && <button className="button button--quiet" disabled={busy} onClick={() => void generatePdf()} type="button">
              <FileCheck2 size={14} />{busy ? t("solve.preparingPdf") : t("solve.createPdf")}
            </button>}
            {solvedUrl && <button className="button button--primary" onClick={downloadPdf} type="button"><Download size={14} />{t("solve.download")}</button>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {providerRequestCount !== undefined && (
            <p className="solve-request-count" aria-live="polite">
              {t("solve.providerRequestCount", { count: providerRequestCount })}
            </p>
          )}
          {analysis && (
            <p className={unanswered.length ? "solve-incomplete" : "solve-complete"}>
              {t(unanswered.length ? "solve.unansweredSummary" : "solve.completeSummary", {
                total: analysis.questions.length,
                count: unanswered.length,
              })}
            </p>
          )}
          {unanswered.length > 0 && (
            <ul className="solve-unanswered" aria-label={t("solve.unansweredQuestions")}>
              {unanswered.map((item) => <li key={item.id}><strong>{item.label}</strong>: {item.reason || t("solve.noAnswerProvided")}</li>)}
            </ul>
          )}
        </div>

        <div className="solve-preview-grid">
          <section className="solve-preview" aria-label={t("solve.originalPreview")}>
            <h2>{t("solve.original")}</h2>
            {sourceUrl
              ? <iframe className="solve-pdf-frame" src={sourceUrl} title={t("solve.originalPreview")} />
              : <div className="solve-empty"><FileText size={22} /><p>{t("solve.originalEmpty")}</p></div>}
          </section>
          <section className="solve-preview" aria-label={t("solve.solvedPreview")}>
            <h2>{t("solve.solvedCopy")}</h2>
            {solvedUrl
              ? <iframe className="solve-pdf-frame" src={solvedUrl} title={t("solve.solvedPreview")} />
              : <div className="solve-empty"><FileCheck2 size={22} /><p>{t("solve.solvedEmpty")}</p></div>}
          </section>
        </div>
      </section>

      {analysis && analysis.questions.length > 0 && (
        <section className="solve-answers" aria-labelledby="solve-answers-title">
          <div className="solve-answers__heading">
            <div><h2 id="solve-answers-title">{t("solve.reviewAnswers")}</h2><p>{t("solve.answerHint")}</p></div>
            <span>{t("solve.answerCount", { count: analysis.questions.length })}</span>
          </div>
          <ol>
            {analysis.questions.map((item) => (
              <li key={item.id} className={item.answer === null ? "is-unanswered" : ""}>
                <label><span>{t("solve.exerciseLabel", { question: `${item.label} · ${item.question}` })}</span>
                  <textarea maxLength={2_000} onChange={(event) => updateQuestion(item.id, "question", event.target.value)} value={item.question} />
                </label>
                <label><span>{t("solve.answer")}</span>
                  <textarea maxLength={4_000} onChange={(event) => updateQuestion(item.id, "answer", event.target.value)} value={item.answer ?? ""} />
                </label>
                <span className={`solve-placement${item.answer === null ? " is-unanswered" : ""}`}>
                  {item.answer === null ? `${t("solve.unanswered")}: ${item.reason || t("solve.noAnswerProvided")}` : t("solve.answerSheet")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
