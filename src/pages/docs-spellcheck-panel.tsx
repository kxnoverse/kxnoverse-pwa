import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createSpellReplacement,
  loadSpellChecker,
  scanSpellDocument,
  type SpellIssue,
  type SpellLanguage,
} from "../data/docs-spellcheck";

type SpellScan = {
  issues: SpellIssue[];
  checkedWords: number;
};

function normalizedWord(word: string, language: SpellLanguage) {
  return word.normalize("NFC").toLocaleLowerCase(language === "de" ? "de-DE" : "en-US");
}

export function DocsSpellcheckPanel({ editor, language, onLanguageChange, onClose }: {
  editor: Editor;
  language: SpellLanguage;
  onLanguageChange: (language: SpellLanguage) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [scan, setScan] = useState<SpellScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [ignoredWords, setIgnoredWords] = useState<ReadonlySet<string>>(new Set());
  const scanId = useRef(0);

  const runScan = useCallback(async () => {
    const id = ++scanId.current;
    const doc = editor.state.doc;
    setScan(null);
    setLoading(true);
    setStale(false);
    setError("");
    setActiveIndex(0);
    try {
      const checker = await loadSpellChecker(language);
      const result = await scanSpellDocument(
        doc,
        checker,
        language,
        ignoredWords,
        () => id !== scanId.current || editor.state.doc !== doc,
      );
      if (id !== scanId.current || editor.state.doc !== doc) return;
      setScan(result);
    } catch (reason) {
      if (id !== scanId.current) return;
      console.error("Docs spellcheck failed to load or scan.", reason);
      setError(t("docs.spellcheckError"));
    } finally {
      if (id === scanId.current) setLoading(false);
    }
  }, [editor, ignoredWords, language, t]);

  useEffect(() => {
    void runScan();
    return () => { scanId.current += 1; };
  }, [runScan]);

  useEffect(() => {
    setIgnoredWords(new Set());
  }, [language]);

  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return;
      scanId.current += 1;
      setLoading(false);
      setStale(true);
    };
    editor.on("transaction", onTransaction);
    return () => { editor.off("transaction", onTransaction); };
  }, [editor]);

  const issues = scan?.issues ?? [];
  const activeIssue = issues[activeIndex];
  const canApply = !loading && !stale && !!scan;

  function navigateIssue(index: number) {
    if (!activeIssue && !issues[index]) return;
    const nextIndex = (index + issues.length) % issues.length;
    setActiveIndex(nextIndex);
    const issue = issues[nextIndex];
    editor.commands.setTextSelection({ from: issue.from, to: issue.to });
    editor.commands.scrollIntoView();
    editor.commands.focus();
  }

  function applyIssues(targets: SpellIssue[]) {
    if (!canApply || !targets.length) return;
    const transaction = editor.state.tr;
    let changed = 0;
    let skipped = 0;
    for (const issue of [...targets].reverse()) {
      if (transaction.doc.textBetween(issue.from, issue.to, "", "\uFFFC") !== issue.word) {
        skipped += 1;
        continue;
      }
      const replacement = issue.suggestions[0];
      const fragment = createSpellReplacement(
        transaction.doc,
        editor.state.schema,
        issue.from,
        issue.to,
        issue.word,
        replacement,
      );
      if (!fragment) {
        skipped += 1;
        continue;
      }
      transaction.replaceWith(issue.from, issue.to, fragment);
      changed += 1;
    }

    if (changed) {
      editor.view.dispatch(transaction);
      editor.commands.focus();
      window.setTimeout(() => { void runScan(); }, 0);
    }
    if (skipped) setError(t("docs.spellcheckSkipped", { count: skipped }));
  }

  function ignoreIssue(issue: SpellIssue) {
    const ignored = normalizedWord(issue.word, language);
    setIgnoredWords((current) => new Set(current).add(ignored));
  }

  return (
    <section className="docs-spellcheck-panel" aria-label={t("docs.spellcheckTitle")}>
      <div className="docs-spellcheck-panel__header">
        <div className="docs-spellcheck-panel__identity">
          <strong>{t("docs.spellcheckTitle")}</strong>
          {scan && !loading && !stale && (
            <span className="docs-spellcheck-panel__summary" role="status" aria-live="polite">
              {t("docs.spellcheckSummary", { issues: issues.length, words: scan.checkedWords })}
            </span>
          )}
        </div>
        <label className="docs-spellcheck-panel__language">
          <span>{t("docs.spellcheckLanguage")}</span>
          <select
            value={language}
            aria-label={t("docs.spellcheckLanguage")}
            onChange={(event) => onLanguageChange(event.target.value as SpellLanguage)}
          >
            <option value="de">{t("docs.spellcheckGerman")}</option>
            <option value="en">{t("docs.spellcheckEnglish")}</option>
          </select>
        </label>
        <button className="docs-tool" type="button" aria-label={t("docs.spellcheckRun")} title={t("docs.spellcheckRun")} disabled={loading} onClick={() => void runScan()}>
          <RefreshCw size={14} className={loading ? "docs-spellcheck-spin" : undefined} />
        </button>
        {issues.length > 0 && (
          <div className="docs-spellcheck-panel__navigation">
            <span>{`${activeIndex + 1} / ${issues.length}`}</span>
            <button className="docs-tool" type="button" aria-label={t("docs.spellcheckPrevious")} disabled={!canApply} onClick={() => navigateIssue(activeIndex - 1)}><ChevronLeft size={14} /></button>
            <button className="docs-tool" type="button" aria-label={t("docs.spellcheckNext")} disabled={!canApply} onClick={() => navigateIssue(activeIndex + 1)}><ChevronRight size={14} /></button>
          </div>
        )}
        <button className="docs-tool" type="button" aria-label={t("docs.close")} onClick={onClose}><X size={14} /></button>
      </div>

      {loading && <p className="docs-spellcheck-panel__message" role="status" aria-live="polite">{t("docs.spellcheckLoading")}</p>}
      {stale && <p className="docs-spellcheck-panel__message" role="status">{t("docs.spellcheckStale")}</p>}
      {error && <p className="docs-spellcheck-panel__error" role="alert">{error}</p>}
      {scan && !loading && !stale && (
        <>
          {issues.length === 0 ? (
            <p className="docs-spellcheck-panel__message" role="status">{t("docs.spellcheckClean")}</p>
          ) : (
            <ul className="docs-spellcheck-panel__issues">
              {issues.map((issue, index) => (
                <li className={index === activeIndex ? "is-active" : ""} key={`${issue.from}-${issue.to}-${issue.word}`}>
                  <button className="docs-spellcheck-panel__word" type="button" onClick={() => navigateIssue(index)}>{issue.word}</button>
                  <div className="docs-spellcheck-panel__suggestions">
                    {issue.suggestions.length ? issue.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={!canApply}
                        onClick={() => applyIssues([{ ...issue, suggestions: [suggestion] }])}
                      >
                        {suggestion}
                      </button>
                    )) : <span>{t("docs.spellcheckNoSuggestions")}</span>}
                  </div>
                  <button className="docs-spellcheck-panel__ignore" type="button" disabled={!canApply} onClick={() => ignoreIssue(issue)}>{t("docs.spellcheckIgnore")}</button>
                </li>
              ))}
            </ul>
          )}
          {issues.some((issue) => issue.suggestions.length > 0) && (
            <div className="docs-spellcheck-panel__footer">
              <button type="button" disabled={!canApply} onClick={() => applyIssues(issues.filter((issue) => issue.suggestions.length > 0))}>
                <Check size={14} />{t("docs.spellcheckFixAll", { count: issues.filter((issue) => issue.suggestions.length > 0).length })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
