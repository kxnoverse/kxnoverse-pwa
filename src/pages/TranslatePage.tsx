import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check, Clipboard, Clock3, Languages, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  detectTranslationLanguage,
  parseTranslationHistory,
  TranslationError,
  translationProvider,
  type TranslationHistoryEntry,
  type TranslationLanguage,
  type TranslationSourceLanguage,
} from "../data/translation";

const HISTORY_ID = "translate:history";
const HISTORY_ENABLED_KEY = "translate:history-enabled";
const HISTORY_LIMIT = 30;

function isTranslationLanguage(value: string): value is TranslationLanguage {
  return value === "de" || value === "en";
}

export function TranslatePage() {
  const { t } = useTranslation();
  const [sourceLanguage, setSourceLanguage] = useState<TranslationSourceLanguage>("auto");
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguage>("en");
  const [detectedLanguage, setDetectedLanguage] = useState<TranslationLanguage>();
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState<TranslationHistoryEntry[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [supported, setSupported] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    setSupported(translationProvider.isSupported());
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function invalidateRequest() {
    requestId.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = undefined;
    setLoading(false);
    setProgress(undefined);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      db.settings.get(HISTORY_ENABLED_KEY),
      db.arcadeData.get(HISTORY_ID),
    ]).then(([setting, savedHistory]) => {
      if (!active) return;
      const enabled = setting?.value === "true";
      setHistoryEnabled(enabled);
      if (enabled && savedHistory) setHistory(parseTranslationHistory(savedHistory.value));
      setHistoryReady(true);
    }).catch(() => {
      if (!active) return;
      setError(t("translate.historyLoadError"));
      setHistoryReady(true);
    });
    return () => { active = false; };
  }, [t]);

  function changeSource(value: string) {
    if (value !== "auto" && !isTranslationLanguage(value)) return;
    invalidateRequest();
    setSourceLanguage(value);
    setDetectedLanguage(undefined);
    setResult("");
    setError("");
  }

  function changeTarget(value: string) {
    if (!isTranslationLanguage(value)) return;
    invalidateRequest();
    setTargetLanguage(value);
    setResult("");
    setError("");
  }

  function updateSource(value: string) {
    invalidateRequest();
    setSource(value);
    setResult("");
    setDetectedLanguage(undefined);
    setError("");
  }

  function clearInput() {
    invalidateRequest();
    setSource("");
    setResult("");
    setDetectedLanguage(undefined);
    setError("");
    setProgress(undefined);
  }

  function swapLanguages() {
    invalidateRequest();
    const currentSource = sourceLanguage === "auto" ? detectedLanguage : sourceLanguage;
    const nextSource = targetLanguage;
    const nextTarget = currentSource ?? (targetLanguage === "en" ? "de" : "en");
    setSourceLanguage(nextSource);
    setTargetLanguage(nextTarget);
    setDetectedLanguage(undefined);
    setSource(result || source);
    setResult("");
    setError("");
  }

  async function translate() {
    const text = source.trim();
    if (!text || loading) return;
    if (!historyReady) {
      setError(t("translate.historyLoadError"));
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setProgress(undefined);
    setResult("");
    setError("");

    try {
      let resolvedSource: TranslationLanguage;
      if (sourceLanguage === "auto") {
        const detected = detectTranslationLanguage(text);
        if (!detected) throw new TranslationError("detection");
        resolvedSource = detected;
        setDetectedLanguage(detected);
      } else {
        resolvedSource = sourceLanguage;
        setDetectedLanguage(undefined);
      }

      if (resolvedSource === targetLanguage) {
        throw new TranslationError("same-language");
      }

      const translated = await translationProvider.translate(
        text,
        resolvedSource,
        targetLanguage,
        setProgress,
        controller.signal,
      );
      if (requestId.current !== id) return;
      setResult(translated);
      if (historyEnabled) {
        const entry: TranslationHistoryEntry = {
          id: crypto.randomUUID(),
          source: text,
          result: translated,
          sourceLanguage: resolvedSource,
          targetLanguage,
          createdAt: Date.now(),
        };
        const nextHistory = [entry, ...history].slice(0, HISTORY_LIMIT);
        await db.arcadeData.put({ id: HISTORY_ID, value: JSON.stringify(nextHistory), updatedAt: entry.createdAt });
        if (requestId.current !== id) return;
        setHistory(nextHistory);
      }
    } catch (cause) {
      if (requestId.current !== id) return;
      if (cause instanceof TranslationError && cause.code === "unsupported") setError(t("translate.unsupported"));
      else if (cause instanceof TranslationError && cause.code === "unavailable") setError(t("translate.unavailable"));
      else if (cause instanceof TranslationError && cause.code === "offline") setError(t("translate.offlineModelMissing"));
      else if (cause instanceof TranslationError && cause.code === "detection") setError(t("translate.detectFailed"));
      else if (cause instanceof TranslationError && cause.code === "same-language") setError(t("translate.sameLanguage"));
      else if (cause instanceof TranslationError && cause.code === "timeout") setError(t("translate.timeout"));
      else if (cause instanceof TranslationError && cause.code === "cancelled") setError(t("translate.cancelled"));
      else setError(historyEnabled ? t("translate.translationOrHistoryError") : t("translate.translationError"));
    } finally {
      if (requestId.current === id) {
        controller.abort();
        activeRequest.current = undefined;
        setLoading(false);
        setProgress(undefined);
      }
    }
  }

  function cancelTranslation() {
    if (!activeRequest.current) return;
    invalidateRequest();
    setError(t("translate.cancelled"));
  }

  async function toggleHistory(enabled: boolean) {
    try {
      if (enabled) await db.settings.put({ key: HISTORY_ENABLED_KEY, value: "true" });
      else await db.settings.delete(HISTORY_ENABLED_KEY);
      setHistoryEnabled(enabled);
      if (enabled) {
        const saved = await db.arcadeData.get(HISTORY_ID);
        if (saved) setHistory(parseTranslationHistory(saved.value));
      } else {
        setHistory([]);
      }
      setError("");
    } catch {
      setError(t("translate.historySaveError"));
    }
  }

  async function clearHistory() {
    try {
      await db.arcadeData.delete(HISTORY_ID);
      setHistory([]);
      setError("");
    } catch {
      setError(t("translate.historySaveError"));
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      setError("");
    } catch {
      setError(t("translate.copyError"));
    }
  }

  function restoreEntry(entry: TranslationHistoryEntry) {
    invalidateRequest();
    setSourceLanguage(entry.sourceLanguage);
    setTargetLanguage(entry.targetLanguage);
    setSource(entry.source);
    setResult(entry.result);
    setDetectedLanguage(undefined);
    setError("");
  }

  const effectiveSourceLanguage = sourceLanguage === "auto" ? detectedLanguage : sourceLanguage;
  const detectedLabel = effectiveSourceLanguage ? t(`translate.languages.${effectiveSourceLanguage}`) : "";

  return (
    <section className="feature-page translate-page">
      <header className="page-heading--compact feature-heading translate-heading">
        <div>
          <span className="translate-kicker"><Languages size={14} />{t("translate.kicker")}</span>
          <h1>{t("nav.translate")}</h1>
          <p>{t("translate.subtitle")}</p>
        </div>
        <span className={`translate-availability${online ? "" : " is-offline"}`} role="status">
          <span aria-hidden="true" />
          {online ? (supported ? t("translate.onDeviceReady") : t("translate.unsupported")) : t("translate.offline")}
        </span>
      </header>

      <section className="translate-workspace" aria-label={t("translate.workspace")}>
        <div className="translate-language-bar">
          <label>
            <span>{t("translate.from")}</span>
            <select aria-label={t("translate.from")} onChange={(event) => changeSource(event.target.value)} value={sourceLanguage}>
              <option value="auto">{t("translate.autoDetect")}</option>
              <option value="de">{t("translate.languages.de")}</option>
              <option value="en">{t("translate.languages.en")}</option>
            </select>
          </label>
          <button aria-label={t("translate.swapLanguages")} className="translate-swap" onClick={swapLanguages} title={t("translate.swapLanguages")} type="button">
            <ArrowDownUp size={15} />
          </button>
          <label>
            <span>{t("translate.to")}</span>
            <select aria-label={t("translate.to")} onChange={(event) => changeTarget(event.target.value)} value={targetLanguage}>
              <option value="de">{t("translate.languages.de")}</option>
              <option value="en">{t("translate.languages.en")}</option>
            </select>
          </label>
        </div>

        <div className="translate-columns">
          <div className="translate-pane">
            <label className="translate-pane__label" htmlFor="translate-source">
              {sourceLanguage === "auto"
                ? (detectedLabel ? t("translate.detectedAs", { language: detectedLabel }) : t("translate.sourceText"))
                : t(`translate.languages.${sourceLanguage}`)}
            </label>
            <textarea
              aria-label={t("translate.sourceText")}
              id="translate-source"
              maxLength={10000}
              onChange={(event) => updateSource(event.target.value)}
              placeholder={t("translate.sourcePlaceholder")}
              value={source}
            />
            <span className="translate-pane__footer">
              <span>{t("translate.characterCount", { count: source.length })}</span>
              <button aria-label={t("translate.clearInput")} className="translate-icon-button" disabled={!source && !result} onClick={clearInput} type="button"><X size={14} /></button>
            </span>
          </div>
          <div className="translate-pane translate-pane--result">
            <label className="translate-pane__label" htmlFor="translate-result">{t(`translate.languages.${targetLanguage}`)}</label>
            <textarea aria-label={t("translate.result")} id="translate-result" readOnly value={result} />
            <span className="translate-pane__footer">
              <span>{loading ? t("translate.translating") : result ? t("translate.translationReady") : t("translate.resultPlaceholder")}</span>
              <button aria-label={t("translate.copyResult")} className="translate-icon-button" disabled={!result} onClick={() => void copyResult()} type="button">
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
              </button>
            </span>
          </div>
        </div>

        {loading && (
          <div className={`translate-progress${progress === undefined ? " is-indeterminate" : ""}`} role="status">
            <span>{progress === undefined ? t("translate.modelMayDownload") : t("translate.modelDownloading", { progress })}</span>
            <div aria-hidden="true"><span style={progress === undefined ? undefined : { width: `${progress}%` }} /></div>
            <button className="translate-cancel" onClick={cancelTranslation} type="button">{t("translate.cancel")}</button>
          </div>
        )}

        <div className="translate-actions">
          <p className="translate-privacy">{t("translate.privacyNote")}</p>
          <button className="button button--primary translate-submit" disabled={!source.trim() && !loading} onClick={() => loading ? cancelTranslation() : void translate()} type="button">
            {loading ? <X size={14} /> : <Languages size={14} />}{loading ? t("translate.cancel") : t("translate.translate")}
          </button>
        </div>
        {error && <p className="translate-error" role="alert">{error}</p>}
      </section>

      <section className="translate-history-panel" aria-labelledby="translate-history-title">
        <div className="translate-history-heading">
          <h2 id="translate-history-title"><Clock3 size={14} />{t("translate.history")}</h2>
          <label className="translate-history-toggle">
            <input checked={historyEnabled} disabled={!historyReady} onChange={(event) => void toggleHistory(event.target.checked)} type="checkbox" />
            <span>{t("translate.saveHistory")}</span>
          </label>
          <button className="button button--quiet" disabled={!history.length} onClick={() => void clearHistory()} type="button"><Trash2 size={13} />{t("translate.clearHistory")}</button>
        </div>
        {!historyEnabled || history.length === 0
          ? <p className="translate-history-empty">{t(historyEnabled ? "translate.emptyHistory" : "translate.historyOff")}</p>
          : <ul className="translate-history-list">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button className="translate-history-entry" onClick={() => restoreEntry(entry)} type="button">
                    <span><span>{t(`translate.languages.${entry.sourceLanguage}`)} → {t(`translate.languages.${entry.targetLanguage}`)}</span><strong>{entry.source}</strong></span>
                    <span className="translate-history-entry__result">{entry.result}</span>
                  </button>
                </li>
              ))}
            </ul>}
      </section>

      <p className="translate-footnote">{t("translate.modelNote")}</p>
    </section>
  );
}
