import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const geminiMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  createPartFromBase64: vi.fn((data: string, mimeType: string) => ({ inlineData: { data, mimeType } })),
  generateContentStream: vi.fn(),
  generateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  createPartFromBase64: geminiMocks.createPartFromBase64,
  GoogleGenAI: class {
    models = {
      generateContentStream: geminiMocks.generateContentStream,
      generateContent: geminiMocks.generateContent,
    };
    constructor(options: unknown) {
      geminiMocks.constructor(options);
    }
  },
}));

import worker, { generateAnswerStream, UserQuota, validRequest } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createQuota() {
  const values = new Map<string, unknown>();
  const storage = {
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async put<T>(key: string, value: T) {
      values.set(key, value);
    },
    async transaction<T>(operation: (transactionStorage: typeof storage) => Promise<T>) {
      return operation(storage);
    },
  };
  return { limiter: new UserQuota({ storage }), values };
}

function consume(limiter: UserQuota, day: string, limit = 33) {
  return limiter.fetch(new Request("https://quota.internal/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, limit }),
  }));
}

describe("AI Worker access controls", () => {
  it("enforces the per-IP daily request limit of 33 and rolls over by UTC day", async () => {
    const { limiter } = createQuota();
    for (let index = 0; index < 33; index += 1) {
      const response = await consume(limiter, "2026-06-01");
      expect(response.status).toBe(200);
      expect((await response.json()).allowed).toBe(true);
    }
    expect((await consume(limiter, "2026-06-01")).status).toBe(200);
    expect((await (await consume(limiter, "2026-06-01")).json()).allowed).toBe(false);
    expect((await (await consume(limiter, "2026-06-02")).json()).allowed).toBe(true);
  });

  it("supports the separate global daily cap", async () => {
    const { limiter } = createQuota();
    for (let index = 0; index < 100; index += 1) {
      expect((await (await consume(limiter, "2026-06-01", 100)).json()).allowed).toBe(true);
    }
    expect((await (await consume(limiter, "2026-06-01", 100)).json()).allowed).toBe(false);
  });

  describe("Gemini multimodal requests", () => {
    const preset = {
      assistantName: "Tutor",
      style: "Clear",
      length: "medium" as const,
      depth: "guided" as const,
      language: "en" as const,
      instructions: "Use examples",
    };
    const request = {
      turnstileToken: "valid-turnstile-token",
      message: "Explain these files",
      model: "gemini-2.5-flash",
      preset,
      history: [{ role: "user" as const, content: "Earlier question" }, { role: "model" as const, content: "Earlier answer" }],
      attachments: [
        { name: "diagram.png", mimeType: "image/png" as const, size: 8, data: "iVBORw0KGgo=" },
        { name: "notes.pdf", mimeType: "application/pdf" as const, size: 8, data: "JVBERi0xLjc=" },
      ],
    };

    it("validates multiple image and PDF payloads and rejects forged signatures or sizes", () => {
      expect(validRequest(request)).toBe(true);
      expect(validRequest({ ...request, attachments: [{ ...request.attachments[0], data: "bm90cG5n" }] })).toBe(false);
      expect(validRequest({ ...request, attachments: [{ ...request.attachments[0], size: 2 }] })).toBe(false);
      expect(validRequest({ ...request, attachments: [{ ...request.attachments[0], mimeType: "image/svg+xml" }] })).toBe(false);
    });

    it("places conversation history, system preset, text, and real inline attachment parts in the Google SDK request", async () => {
      const signal = new AbortController().signal;
      geminiMocks.generateContentStream.mockResolvedValue((async function* () {
        yield { text: "A useful " };
        yield { text: "explanation." };
      })());
      const env = {
        AI_PROVIDER: "gemini" as const,
        AI_MODEL: "gemini-2.5-flash",
        AI_API_KEY: "server-only-test-key",
        ALLOWED_MODELS: "gemini-2.5-flash,gemini-2.5-pro",
      };
      const chunks: string[] = [];
      for await (const chunk of generateAnswerStream(env, "https://app.example.test", request, signal)) chunks.push(chunk);

      expect(chunks.join("")).toBe("A useful explanation.");
      expect(geminiMocks.constructor).toHaveBeenCalledWith(expect.objectContaining({
        apiKey: "server-only-test-key",
        httpOptions: expect.objectContaining({ timeout: 90_000, retryOptions: expect.objectContaining({ attempts: 2 }) }),
      }));
      const [sdkRequest] = geminiMocks.generateContentStream.mock.calls[0];
      expect(sdkRequest.model).toBe("gemini-2.5-flash");
      expect(sdkRequest.contents).toHaveLength(3);
      expect(sdkRequest.contents[0]).toMatchObject({ role: "user", parts: [{ text: "Earlier question" }] });
      expect(sdkRequest.contents[1]).toMatchObject({ role: "model", parts: [{ text: "Earlier answer" }] });
      expect(sdkRequest.contents[2].parts).toEqual([
        { text: "Explain these files" },
        { inlineData: { data: "iVBORw0KGgo=", mimeType: "image/png" } },
        { inlineData: { data: "JVBERi0xLjc=", mimeType: "application/pdf" } },
      ]);
      expect(sdkRequest.config.systemInstruction).toContain("Use examples");
      expect(sdkRequest.config.abortSignal).toBe(signal);
      expect(geminiMocks.createPartFromBase64).toHaveBeenCalledTimes(2);
    });
  });

  it("rejects unapproved origins and requires a verified Turnstile token before quota or provider use", async () => {
    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_PROVIDER: "gemini" as const,
      AI_MODEL: "gemini-2.5-flash",
      AI_API_KEY: "server-only-test-key",
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
      USER_QUOTA: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true })) }),
      },
    };
    const blocked = await worker.fetch(new Request("https://worker.example.test/api/chat", {
      method: "POST",
      headers: { Origin: "https://attacker.example.test", "Content-Type": "application/json" },
      body: "{}",
    }), env);
    expect(blocked.status).toBe(403);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "chat",
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "test",
      }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const invalidChallenge = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ turnstileToken: "invalid-token" }),
    }), env);
    expect(invalidChallenge.status).toBe(403);
    expect(await invalidChallenge.json()).toEqual({ error: "challenge_required" });

    const wrongAction = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ turnstileToken: "wrong-action-token" }),
    }), env);
    expect(wrongAction.status).toBe(403);
    expect(await wrongAction.json()).toEqual({ error: "challenge_required" });

    geminiMocks.generateContent.mockResolvedValue({ text: "OK" });
    const verified = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ ok: true, model: env.AI_MODEL });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("server-only-turnstile-secret");
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("valid-token");
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("192.0.2.5");

    const preflight = await worker.fetch(new Request("https://worker.example.test/api/chat", {
      method: "OPTIONS",
      headers: { Origin: env.APP_ORIGIN, "Access-Control-Request-Method": "POST" },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(env.APP_ORIGIN);
  });
});
