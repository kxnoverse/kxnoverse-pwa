export type TranslationLanguage = "de" | "en";
export type TranslationSourceLanguage = TranslationLanguage | "auto";
export type TranslationErrorCode = "unsupported" | "offline" | "unavailable" | "failed" | "detection" | "same-language" | "cancelled" | "timeout";
export const TRANSLATION_TIMEOUT_MS = 120_000;

export class TranslationError extends Error {
  constructor(readonly code: TranslationErrorCode) {
    super(code);
    this.name = "TranslationError";
  }
}

export interface TranslationHistoryEntry {
  id: string;
  source: string;
  result: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  createdAt: number;
}

const germanWords = new Set(
  "aber als auch auf aus bei bin bis bist da das dass dein deine dem den der des die dir doch du ein eine einem einen einer er es für habe hast hat hier ich ihr im ist ja kann kein keine mit nach nicht noch nur oder sein seine sie sind so über um und uns unter vom von vor war was weil wenn wer wie wir wo zu zum zur".split(" "),
);
const englishWords = new Set(
  "about after all also am an and are as at be because been before but by can did do does for from had has have he her here him his how i if in into is it its may me more my no not of on or our out over she so some than that the their them then there they this to up was we were what when where which who will with would you your".split(" "),
);

export function detectTranslationLanguage(text: string): TranslationLanguage | undefined {
  const words = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
  let german = 0;
  let english = 0;

  for (const word of words) {
    if (germanWords.has(word)) german += 1;
    if (englishWords.has(word)) english += 1;
  }
  if (/[äöüß]/iu.test(text)) german += 2;

  if (german >= 2 && german - english >= 2) return "de";
  if (english >= 2 && english - german >= 2) return "en";
  return undefined;
}

interface BrowserTranslator {
  translate(text: string): Promise<string>;
}

interface BrowserTranslatorApi {
  availability(options: { sourceLanguage: TranslationLanguage; targetLanguage: TranslationLanguage }): Promise<string>;
  create(options: {
    sourceLanguage: TranslationLanguage;
    targetLanguage: TranslationLanguage;
    monitor: (monitor: { addEventListener: (type: "downloadprogress", callback: (event: Event) => void) => void }) => void;
  }): Promise<BrowserTranslator>;
}

interface TranslationProvider {
  isSupported(): boolean;
  translate(
    text: string,
    sourceLanguage: TranslationLanguage,
    targetLanguage: TranslationLanguage,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
}

function getBrowserTranslatorApi(): BrowserTranslatorApi | undefined {
  return (globalThis as typeof globalThis & { Translator?: BrowserTranslatorApi }).Translator;
}

export const translationProvider: TranslationProvider = {
  isSupported() {
    const api = getBrowserTranslatorApi();
    return typeof api?.availability === "function" && typeof api.create === "function";
  },

  async translate(text, sourceLanguage, targetLanguage, onProgress, signal) {
    const api = getBrowserTranslatorApi();
    if (!api) throw new TranslationError("unsupported");
    if (sourceLanguage === targetLanguage) return text;

    let timeoutId: number | undefined;
    let abortHandler: (() => void) | undefined;
    try {
      if (signal.aborted) throw new TranslationError("cancelled");
      const translation = (async () => {
        const availability = await api.availability({ sourceLanguage, targetLanguage });
        if (availability === "unavailable") throw new TranslationError("unavailable");
        if (availability !== "available" && !navigator.onLine) throw new TranslationError("offline");

        const translator = await api.create({
          sourceLanguage,
          targetLanguage,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => {
              if (!signal.aborted && "loaded" in event && typeof event.loaded === "number") {
                onProgress(Math.max(0, Math.min(100, Math.round(event.loaded * 100))));
              }
            });
          },
        });
        return translator.translate(text);
      })();
      const interruption = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new TranslationError("timeout")), TRANSLATION_TIMEOUT_MS);
        abortHandler = () => reject(new TranslationError("cancelled"));
        signal.addEventListener("abort", abortHandler, { once: true });
      });
      return await Promise.race([translation, interruption]);
    } catch (cause) {
      if (cause instanceof TranslationError) throw cause;
      throw new TranslationError(navigator.onLine ? "failed" : "offline");
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (abortHandler) signal.removeEventListener("abort", abortHandler);
    }
  },
};

export function parseTranslationHistory(value: string): TranslationHistoryEntry[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Translation history has an invalid format.");
  const entries = parsed.filter((entry): entry is TranslationHistoryEntry => (
    typeof entry === "object" &&
    entry !== null &&
    "id" in entry && typeof entry.id === "string" &&
    "source" in entry && typeof entry.source === "string" &&
    "result" in entry && typeof entry.result === "string" &&
    "sourceLanguage" in entry && (entry.sourceLanguage === "de" || entry.sourceLanguage === "en") &&
    "targetLanguage" in entry && (entry.targetLanguage === "de" || entry.targetLanguage === "en") &&
    "createdAt" in entry && typeof entry.createdAt === "number"
  ));
  if (entries.length !== parsed.length) throw new Error("Translation history contains invalid entries.");
  return entries.slice(0, 30);
}
