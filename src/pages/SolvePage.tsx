import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Download, FileCheck2, FilePlus2, FileText, LoaderCircle, ScanText } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TurnstileChallenge } from "../components/TurnstileChallenge";
import { assistantAttachmentToBase64, assistantClient, AssistantServiceError, validateAssistantAttachmentContent } from "../data/ai-client";
import { readBlobAsArrayBuffer } from "../data/blob-utils";
import { db } from "../data/db";
import { createSolvedPdf, getPdfPageCount, parseSolveResponse, type SolveAnswer } from "../data/solve";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const ASSISTANT_PRESET = {
  assistantName: "Kxno",
  style: "Clear, concise, and educational",
  length: "medium",
  depth: "guided",
  language: "auto",
  instructions: "For PDF exercise sheets, solve only simple, repetitive exercises. Be accurate and concise. Do not invent text or answers where the document is unclear.",
};

function solvePrompt(language: string, pageCount: number): string {
  return [
    "Solve the attached PDF worksheet. Focus only on simple, repetitive exercises.",
    "Do not solve long-form prompts, handwriting, or tasks dependent on complex diagrams. If an exercise is unclear, omit it.",
    "Return only valid JSON with this schema:",
    '{"answers":[{"question":"short exercise label","answer":"concise answer","page":1,"placement":{"x":0.1,"y":0.2,"width":0.2,"height":0.04,"confidence":0.98}}]}',
    `Use the response language ${language === "de" ? "German" : "English"}.`,
    `The PDF has ${pageCount} pages. Page numbers are 1-based. Placement x/y/width/height are normalized from the page's top-left corner, each from 0 to 1. Include placement only when the answer box is clearly identifiable and confidence is at least 0.92; otherwise omit placement. Never guess coordinates. Keep each answer under 500 characters and return at most 30 answers.`,
  ].join("\n");
}

function getErrorMessage(cause: unknown, t: (key: string) => string): string {
  if (cause instanceof AssistantServiceError) return t(`assistant.serviceErrors.${cause.code}`);
  if (cause instanceof DOMException && cause.name === "AbortError") return t("solve.cancelled");
  if (cause instanceof Error && cause.message === "invalidResponse") return t("solve.invalidResponse");
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
  const [answers, setAnswers] = useState<SolveAnswer[]>([]);
  const [solvedPdf, setSolvedPdf] = useState<Blob>();
  const [sourceUrl, setSourceUrl] = useState("");
  const [solvedUrl, setSolvedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      setAnswers([]);
      setSolvedPdf(undefined);
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
    setAnswers([]);
    setSolvedPdf(undefined);
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
      });
      setAnswers(parseSolveResponse(response, pageCount));
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

  function updateAnswer(id: string, field: "question" | "answer", value: string) {
    setAnswers((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
    setSolvedPdf(undefined);
  }

  async function generatePdf() {
    if (!sourceFile || !answers.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(await readBlobAsArrayBuffer(sourceFile));
      const output = await createSolvedPdf(bytes, answers);
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
              {busy && answers.length === 0 ? <LoaderCircle className="solve-spinner" size={14} /> : <ScanText size={14} />}
              {busy && answers.length === 0 ? t("solve.analyzing") : t("solve.analyze")}
            </button>
            {busy && <button className="button button--quiet" onClick={cancelAnalysis} type="button">{t("solve.cancel")}</button>}
            {!!answers.length && <button className="button button--quiet" disabled={busy} onClick={() => void generatePdf()} type="button">
              <FileCheck2 size={14} />{busy ? t("solve.preparingPdf") : t("solve.createPdf")}
            </button>}
            {solvedUrl && <button className="button button--primary" onClick={downloadPdf} type="button"><Download size={14} />{t("solve.download")}</button>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
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

      {answers.length > 0 && (
        <section className="solve-answers" aria-labelledby="solve-answers-title">
          <div className="solve-answers__heading">
            <div><h2 id="solve-answers-title">{t("solve.reviewAnswers")}</h2><p>{t("solve.answerHint")}</p></div>
            <span>{t("solve.answerCount", { count: answers.length })}</span>
          </div>
          <ol>
            {answers.map((answer) => (
              <li key={answer.id}>
                <label><span>{t("solve.exerciseLabel", { question: answer.question })}</span>
                  <textarea maxLength={500} onChange={(event) => updateAnswer(answer.id, "question", event.target.value)} value={answer.question} />
                </label>
                <label><span>{t("solve.answer")}</span>
                  <textarea maxLength={500} onChange={(event) => updateAnswer(answer.id, "answer", event.target.value)} value={answer.answer} />
                </label>
                <span className={`solve-placement${answer.placement ? " is-positioned" : ""}`}>
                  {answer.placement && answer.page
                    ? t("solve.positioned", { page: answer.page })
                    : t("solve.answerSheet")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
