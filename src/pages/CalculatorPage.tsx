import { useEffect, useState } from "react";
import { Calculator, Check, Copy, Delete, History, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  evaluateExpression,
  formatCalculatorResult,
  parseCalculatorHistory,
  type AngleUnit,
  type CalculatorHistoryEntry,
} from "../data/calculator";

const HISTORY_KEY = "calculator:history";
const HISTORY_LIMIT = 100;

const standardKeys = [
  ["C", "⌫", "(", ")"],
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["±", "0", ".", "%"],
  ["+", "="],
];

const scientificKeys = [
  ["sin", "cos", "tan", "√"],
  ["log", "ln", "x²", "xʸ"],
  ["π", "e", "n!", "1/x"],
  ["|x|", "(", ")", "%"],
];

function CalculatorPad({ keys, className, onPress, t }: {
  keys: string[][];
  className: string;
  onPress: (key: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className={`calculator-keypad ${className}`}>
      {keys.flatMap((row, rowIndex) => row.map((key, columnIndex) => (
        <button
          aria-label={key === "⌫" ? t("calculator.backspace") : key === "±" ? t("calculator.toggleSign") : key === "√" ? t("calculator.squareRoot") : undefined}
          className={`calculator-key${["÷", "×", "−", "+", "xʸ", "="].includes(key) ? " calculator-key--operator" : ""}${key === "C" ? " calculator-key--quiet" : ""}${key === "+" || key === "=" ? " calculator-key--wide" : ""}`}
          key={`${rowIndex}-${columnIndex}-${key}`}
          onClick={() => onPress(key)}
          type="button"
        >
          {key === "⌫" ? <Delete size={16} /> : key}
        </button>
      )))}
    </div>
  );
}

export function CalculatorPage() {
  const { t } = useTranslation();
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [angleUnit, setAngleUnit] = useState<AngleUnit>("degrees");
  const [scientific, setScientific] = useState(false);
  const [history, setHistory] = useState<CalculatorHistoryEntry[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    let active = true;
    void db.arcadeData.get(HISTORY_KEY).then((record) => {
      if (!active) return;
      if (record) setHistory(parseCalculatorHistory(record.value));
      setHistoryReady(true);
    }).catch(() => {
      if (!active) return;
      setError(t("calculator.historyLoadError"));
      setHistoryReady(true);
    });
    return () => { active = false; };
  }, [t]);

  function append(value: string) {
    setExpression((current) => `${current}${value}`);
    setResult(null);
    setError("");
  }

  function clear() {
    setExpression("");
    setResult(null);
    setError("");
  }

  function backspace() {
    setExpression((current) => current.slice(0, -1));
    setResult(null);
    setError("");
  }

  function toggleSign() {
    setExpression((current) => {
      if (!current) return "-";
      if (/^-?\d+(?:\.\d+)?$/.test(current)) return current.startsWith("-") ? current.slice(1) : `-${current}`;
      return `-(${current})`;
    });
    setResult(null);
    setError("");
  }

  async function calculate() {
    if (!historyReady) return;
    try {
      const calculated = evaluateExpression(expression, angleUnit);
      const entry: CalculatorHistoryEntry = {
        id: crypto.randomUUID(),
        expression,
        result: calculated,
        createdAt: Date.now(),
      };
      await db.transaction("rw", db.arcadeData, async () => {
        const existing = await db.arcadeData.get(HISTORY_KEY);
        const previous = existing ? parseCalculatorHistory(existing.value) : [];
        const next = [entry, ...previous].slice(0, HISTORY_LIMIT);
        await db.arcadeData.put({ id: HISTORY_KEY, value: JSON.stringify(next), updatedAt: entry.createdAt });
        setHistory(next);
      });
      setResult(calculated);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("calculator.calculationError"));
    }
  }

  async function updateHistory(next: CalculatorHistoryEntry[]) {
    try {
      await db.transaction("rw", db.arcadeData, async () => {
        if (next.length) {
          await db.arcadeData.put({ id: HISTORY_KEY, value: JSON.stringify(next), updatedAt: Date.now() });
        } else {
          await db.arcadeData.delete(HISTORY_KEY);
        }
      });
      setHistory(next);
      setError("");
    } catch {
      setError(t("calculator.historySaveError"));
    }
  }

  function pressKey(key: string) {
    if (key === "⌫") return backspace();
    if (key === "±") return toggleSign();
    if (key === "C") return clear();
    if (key === "=") return void calculate();
    const operators: Record<string, string> = { "÷": "/", "×": "*", "−": "-" };
    const functions: Record<string, string> = {
      sin: "sin(", cos: "cos(", tan: "tan(", log: "log(", ln: "ln(",
      "√": "sqrt(", "x²": "^2", "xʸ": "^", "π": "pi", "e": "e",
      "n!": "!", "1/x": "recip(", "|x|": "abs(",
    };
    append(operators[key] ?? functions[key] ?? key);
  }

  function handleKeyboard(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      void calculate();
    } else if (event.key === "Escape") {
      event.preventDefault();
      clear();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
    }
  }

  async function copyResult(value: number, id: string) {
    try {
      await navigator.clipboard.writeText(formatCalculatorResult(value));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 1300);
      setError("");
    } catch {
      setError(t("calculator.copyError"));
    }
  }

  return (
    <section className="feature-page calculator-page">
      <header className="page-heading--compact feature-heading calculator-heading">
        <div>
          <span className="calculator-kicker"><Calculator size={14} />{t("calculator.kicker")}</span>
          <h1>{t("nav.calculator")}</h1>
          <p>{t("calculator.subtitle")}</p>
        </div>
        <div className="calculator-mode" role="group" aria-label={t("calculator.mode")}>
          <button aria-pressed={!scientific} className={!scientific ? "is-active" : ""} onClick={() => setScientific(false)} type="button">{t("calculator.standard")}</button>
          <button aria-pressed={scientific} className={scientific ? "is-active" : ""} onClick={() => setScientific(true)} type="button">{t("calculator.scientific")}</button>
        </div>
      </header>

      <div className="calculator-layout">
        <section className="calculator-panel" aria-label={t("calculator.calculator")}>
          <div className="calculator-display">
            <label className="calculator-expression-label" htmlFor="calculator-expression">{t("calculator.expression")}</label>
            <input
              aria-label={t("calculator.expression")}
              autoComplete="off"
              id="calculator-expression"
              inputMode="decimal"
              onChange={(event) => {
                setExpression(event.target.value);
                setResult(null);
                setError("");
              }}
              onKeyDown={handleKeyboard}
              placeholder="0"
              spellCheck={false}
              value={expression}
            />
            <div className="calculator-result" aria-live="polite" aria-label={t("calculator.result")}>
              {result === null ? <span>{t("calculator.result")}</span> : <strong>{formatCalculatorResult(result)}</strong>}
              {result !== null && <button aria-label={t("calculator.copyResult")} onClick={() => void copyResult(result, "current")} type="button"><Copy size={14} />{t("calculator.copyResult")}</button>}
            </div>
          </div>

          <div className="calculator-controls">
            {scientific && (
              <div className="calculator-angle" role="group" aria-label={t("calculator.angleUnit")}>
                <span>{t("calculator.angleUnit")}</span>
                <button aria-pressed={angleUnit === "degrees"} className={angleUnit === "degrees" ? "is-active" : ""} onClick={() => setAngleUnit("degrees")} type="button">{t("calculator.degrees")}</button>
                <button aria-pressed={angleUnit === "radians"} className={angleUnit === "radians" ? "is-active" : ""} onClick={() => setAngleUnit("radians")} type="button">{t("calculator.radians")}</button>
              </div>
            )}
            <div className={`calculator-keypads${scientific ? " calculator-keypads--scientific" : ""}`}>
              {scientific && <CalculatorPad className="calculator-keypad--science" keys={scientificKeys} onPress={pressKey} t={t} />}
              <CalculatorPad className="calculator-keypad--standard" keys={standardKeys} onPress={pressKey} t={t} />
            </div>
            <p className="calculator-percent-note">{t("calculator.percentNote")}</p>
          </div>
        </section>

        <aside className="calculator-history-panel">
          <div className="calculator-history-heading">
            <h2><History size={15} />{t("calculator.history")}</h2>
            <button disabled={!history.length} onClick={() => {
              if (window.confirm(t("calculator.clearHistoryConfirm"))) void updateHistory([]);
            }} type="button"><Trash2 size={13} />{t("calculator.clearHistory")}</button>
          </div>
          {!history.length ? (
            <p className="calculator-history-empty">{t("calculator.emptyHistory")}</p>
          ) : (
            <ol className="calculator-history-list">
              {history.map((entry) => (
                <li key={entry.id}>
                  <button className="calculator-history-expression" onClick={() => {
                    setExpression(entry.expression);
                    setResult(null);
                    setError("");
                  }} type="button" title={t("calculator.reuseExpression")}>{entry.expression}</button>
                  <div>
                    <strong>{formatCalculatorResult(entry.result)}</strong>
                    <button aria-label={`${t("calculator.copyPreviousResult")} ${formatCalculatorResult(entry.result)}`} onClick={() => void copyResult(entry.result, entry.id)} type="button">{copiedId === entry.id ? <Check size={13} /> : <Copy size={13} />}</button>
                    <button aria-label={`${t("calculator.deleteEntry")} ${entry.expression}`} onClick={() => void updateHistory(history.filter((item) => item.id !== entry.id))} type="button"><Trash2 size={13} /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
      <p className="calculator-error" role={error ? "alert" : undefined}>{error}</p>
    </section>
  );
}
