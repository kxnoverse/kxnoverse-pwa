import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectTranslationLanguage,
  parseTranslationHistory,
  TRANSLATION_TIMEOUT_MS,
  translationProvider,
} from "./translation";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("translation helpers", () => {
  it("detects clear German and English text but leaves short ambiguous input undecided", () => {
    expect(detectTranslationLanguage("Guten Morgen, wie geht es dir?")).toBe("de");
    expect(detectTranslationLanguage("Good morning, how are you today?")).toBe("en");
    expect(detectTranslationLanguage("Hallo")).toBeUndefined();
    expect(detectTranslationLanguage("Ja")).toBeUndefined();
  });

  it("loads only the requested browser translation pair and reports model download progress", async () => {
    const listener = vi.fn<(event: Event) => void>();
    const translate = vi.fn(async (text: string) => `English: ${text}`);
    const create = vi.fn(async (options: { monitor: (monitor: { addEventListener: (type: "downloadprogress", callback: (event: Event) => void) => void }) => void }) => {
      options.monitor({ addEventListener: (_type, callback) => listener.mockImplementation(callback) });
      return { translate };
    });
    vi.stubGlobal("Translator", {
      availability: vi.fn(async () => "downloadable"),
      create,
    });
    const onProgress = vi.fn();
    const progressEvent = Object.assign(new Event("downloadprogress"), { loaded: 0.5 });
    const controller = new AbortController();

    await expect(translationProvider.translate("Guten Tag", "de", "en", onProgress, controller.signal)).resolves.toBe("English: Guten Tag");
    listener(progressEvent);

    expect(create).toHaveBeenCalledOnce();
    expect(translate).toHaveBeenCalledWith("Guten Tag");
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it("surfaces unsupported browser APIs and rejects malformed saved history", async () => {
    vi.stubGlobal("Translator", undefined);
    await expect(translationProvider.translate("Hallo", "de", "en", vi.fn(), new AbortController().signal)).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(() => parseTranslationHistory("{broken")).toThrow();
    expect(() => parseTranslationHistory(JSON.stringify([{ id: "invalid" }]))).toThrow();
  });

  it("allows abandoning a stalled model load and rejects it after the timeout", async () => {
    let downloadListener: ((event: Event) => void) | undefined;
    vi.stubGlobal("Translator", {
      availability: vi.fn(async () => "downloadable"),
      create: vi.fn(async (options: { monitor: (monitor: { addEventListener: (type: "downloadprogress", callback: (event: Event) => void) => void }) => void }) => {
        options.monitor({ addEventListener: (_type, callback) => { downloadListener = callback; } });
        return new Promise<never>(() => {});
      }),
    });

    const controller = new AbortController();
    const cancelled = translationProvider.translate("Hallo", "de", "en", vi.fn(), controller.signal);
    await vi.waitFor(() => expect(downloadListener).toBeDefined());
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "cancelled" });

    vi.useFakeTimers();
    const timedOut = translationProvider.translate("Hallo", "de", "en", vi.fn(), new AbortController().signal);
    const timeoutAssertion = expect(timedOut).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT_MS);
    await timeoutAssertion;
    vi.useRealTimers();
  });
});
