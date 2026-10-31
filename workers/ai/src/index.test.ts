import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function consume(limiter: UserQuota, day: string, limit = 50) {
  return limiter.fetch(new Request("https://quota.internal/consume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, limit }),
  }));
}

function getUsage(limiter: UserQuota, day: string, limit = 50) {
  return limiter.fetch(new Request(`https://quota.internal/usage?day=${day}&limit=${limit}`));
}

describe("AI Worker access controls", () => {
  it("enforces the per-IP daily request limit of 50 and rolls over by UTC day", async () => {
    const { limiter } = createQuota();
    for (let index = 0; index < 50; index += 1) {
      const response = await consume(limiter, "2026-06-01");
      expect(response.status).toBe(200);
      expect((await response.json()).allowed).toBe(true);
    }
    expect((await consume(limiter, "2026-06-01")).status).toBe(200);
    expect((await (await consume(limiter, "2026-06-01")).json()).allowed).toBe(false);
    expect((await (await consume(limiter, "2026-06-02")).json()).allowed).toBe(true);
  });

  it("enforces the matching global daily cap", async () => {
    const { limiter } = createQuota();
    for (let index = 0; index < 50; index += 1) {
      expect((await (await consume(limiter, "2026-06-01", 50)).json()).allowed).toBe(true);
    }
    expect((await (await consume(limiter, "2026-06-01", 50)).json()).allowed).toBe(false);
  });

  it("reports quota usage without consuming a request", async () => {
    const { limiter } = createQuota();
    expect(await (await getUsage(limiter, "2026-06-01")).json()).toEqual({ count: 0, remaining: 50, limit: 50 });
    await consume(limiter, "2026-06-01");
    expect(await (await getUsage(limiter, "2026-06-01")).json()).toEqual({ count: 1, remaining: 49, limit: 50 });
  });

  describe("OpenRouter chat and attachments", () => {
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
      model: "openrouter/free",
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

    it("uses the dedicated OpenRouter secret for free-model chat requests", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: "OpenRouter answer" } }],
      }), { headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);
      const env = {
        AI_MODEL: "openrouter/free",
        ALLOWED_MODELS: "openrouter/free",
        OPENROUTER_API_KEY: "server-only-openrouter-test-key",
      };
      const chunks: string[] = [];
      let providerRequests = 0;
      for await (const chunk of generateAnswerStream(
        env,
        "https://app.example.test",
        { ...request, model: env.AI_MODEL, attachments: [] },
        new AbortController().signal,
        () => { providerRequests += 1; },
      )) chunks.push(chunk);

      expect(chunks.join("")).toBe("OpenRouter answer");
      expect(providerRequests).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/chat/completions",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer server-only-openrouter-test-key" }),
        }),
      );
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
        model: env.AI_MODEL,
        stream: false,
      });
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).messages[0].content).toContain(
        "You are Tutor, the user's assistant.",
      );
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).messages.slice(1)).toEqual([
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: [{ type: "text", text: "Explain these files" }] },
      ]);
    });

    it("sends OpenRouter image and PDF attachments as multimodal data and uses the free PDF parser", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: "I can read both attachments." } }],
      }), { headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);
      const env = {
        AI_MODEL: "openrouter/free",
        ALLOWED_MODELS: "openrouter/free",
        OPENROUTER_API_KEY: "server-only-openrouter-test-key",
      };
      const chunks: string[] = [];
      for await (const chunk of generateAnswerStream(
        env,
        "https://app.example.test",
        { ...request, model: env.AI_MODEL },
        new AbortController().signal,
      )) chunks.push(chunk);

      expect(chunks.join("")).toBe("I can read both attachments.");
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      const currentMessage = body.messages[body.messages.length - 1];
      expect(currentMessage.content).toEqual([
        { type: "text", text: "Explain these files" },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
        {
          type: "file",
          file: {
            filename: "notes.pdf",
            file_data: "data:application/pdf;base64,JVBERi0xLjc=",
          },
        },
      ]);
      expect(body.plugins).toEqual([{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }]);
    });

    it("does not enable PDF parsing for OpenRouter image-only requests", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: "Image received." } }],
      }), { headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", fetchMock);
      const env = {
        AI_MODEL: "openrouter/free",
        ALLOWED_MODELS: "openrouter/free",
        OPENROUTER_API_KEY: "server-only-openrouter-test-key",
      };
      for await (const _chunk of generateAnswerStream(
        env,
        "https://app.example.test",
        { ...request, model: env.AI_MODEL, attachments: [request.attachments[0]] },
        new AbortController().signal,
      )) { /* consume */ }

      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      const currentMessage = body.messages[body.messages.length - 1];
      expect(currentMessage.content[1].image_url.url).toBe("data:image/png;base64,iVBORw0KGgo=");
      expect(body.plugins).toBeUndefined();
    });
  });

  it("rejects unapproved origins and requires a verified Turnstile token before quota or provider use", async () => {
    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free",
      OPENROUTER_API_KEY: "server-only-openrouter-test-key",
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
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
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

    const verified = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);
    expect(verified.status).toBe(200);
    expect(await verified.json()).toMatchObject({ ok: true, model: env.AI_MODEL });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("server-only-turnstile-secret");
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("valid-token");
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain("192.0.2.5");

    const providerErrorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      hostname: "app.example.test",
      action: "test",
    }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    const unavailable = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.5" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "provider_unavailable" });
    expect(providerErrorLog).toHaveBeenCalledWith("AI provider connection test failed.", {
      provider: "openrouter",
      errorType: "Error",
      failureStage: "http",
      status: 429,
    });

    const preflight = await worker.fetch(new Request("https://worker.example.test/api/chat", {
      method: "OPTIONS",
      headers: { Origin: env.APP_ORIGIN, "Access-Control-Request-Method": "POST" },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(env.APP_ORIGIN);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("returns the effective per-IP/global remaining count without consuming quota", async () => {
    const quotaCalls: Array<{ id: unknown; request: Request }> = [];
    const env = {
      APP_ORIGIN: "https://app.example.test",
      USER_QUOTA: {
        idFromName: (id: string) => id,
        get: (id: unknown) => ({
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            quotaCalls.push({ id, request });
            return new Response(JSON.stringify({ remaining: id === "global" ? 45 : 80 }));
          },
        }),
      },
    };
    const result = await worker.fetch(new Request("https://worker.example.test/api/usage", {
      headers: { Origin: env.APP_ORIGIN, "CF-Connecting-IP": "192.0.2.5" },
    }), env);

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ remaining: 45, limit: 50 });
    expect(quotaCalls).toHaveLength(2);
    expect(quotaCalls.every(({ request }) => request.method === "GET" && new URL(request.url).pathname === "/usage")).toBe(true);
  });

  it("routes an allowlisted text-only model through the Groq secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "Groq answer" } }],
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = {
      turnstileToken: "valid-turnstile-token",
      message: "Explain this topic",
      model: "openai/gpt-oss-120b",
      preset: {
        assistantName: "Tutor",
        style: "Clear",
        length: "medium" as const,
        depth: "guided" as const,
        language: "en" as const,
        instructions: "",
      },
      history: [
        { role: "user" as const, content: "Earlier question" },
        { role: "model" as const, content: "Earlier answer" },
      ],
      attachments: [],
    };
    const env = {
      ALLOWED_MODELS: "openrouter/free,openai/gpt-oss-120b",
      GROQ_API_KEY: "server-only-groq-test-key",
    };
    const chunks: string[] = [];
    for await (const chunk of generateAnswerStream(
      env,
      "https://app.example.test",
      request,
      new AbortController().signal,
    )) chunks.push(chunk);

    expect(chunks.join("")).toBe("Groq answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer server-only-groq-test-key" }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system" },
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: "Explain this topic" },
      ],
      max_tokens: 1_200,
      stream: false,
    });
  });

  it("rejects Groq attachments and excludes models without provider secrets from discovery", async () => {
    const request = {
      turnstileToken: "valid-turnstile-token",
      message: "Read this image",
      model: "openai/gpt-oss-120b",
      preset: {
        assistantName: "Tutor",
        style: "Clear",
        length: "short" as const,
        depth: "basic" as const,
        language: "en" as const,
        instructions: "",
      },
      history: [],
      attachments: [{ name: "image.png", mimeType: "image/png" as const, size: 8, data: "iVBORw0KGgo=" }],
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAnswerStream(
      { ALLOWED_MODELS: "openai/gpt-oss-120b", GROQ_API_KEY: "server-only-groq-test-key" },
      "https://app.example.test",
      request,
      new AbortController().signal,
    ).next()).rejects.toThrow("does not support attachments");
    expect(fetchMock).not.toHaveBeenCalled();

    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free,openai/gpt-oss-120b",
      GROQ_API_KEY: "server-only-groq-test-key",
    };
    const rejectedAttachment = await worker.fetch(new Request("https://worker.example.test/api/chat", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }), env);
    expect(rejectedAttachment.status).toBe(400);
    expect(await rejectedAttachment.json()).toEqual({ error: "unsupported_attachment_provider" });

    const hidden = await worker.fetch(new Request("https://worker.example.test/api/models", {
      headers: { Origin: env.APP_ORIGIN },
    }), { ...env, GROQ_API_KEY: undefined });
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual({ models: [], defaultModel: "openrouter/free" });

    const visible = await worker.fetch(new Request("https://worker.example.test/api/models", {
      headers: { Origin: env.APP_ORIGIN },
    }), { ...env, GROQ_API_KEY: "server-only-groq-test-key" });
    expect(await visible.json()).toEqual({
      models: [{ id: "openai/gpt-oss-120b", provider: "groq", supportsAttachments: false }],
      defaultModel: "openrouter/free",
    });
  });

  it("tests the first configured provider when the default provider secret is absent", async () => {
    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free,openai/gpt-oss-120b",
      GROQ_API_KEY: "server-only-groq-test-key",
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
      USER_QUOTA: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true })) }),
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "test",
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const tested = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.9" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);

    expect(tested.status).toBe(200);
    expect(await tested.json()).toEqual({ ok: true, model: "openai/gpt-oss-120b" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer server-only-groq-test-key",
    });
  });

  it("tests OpenRouter with its dedicated server-side key and restricts it to free routing", async () => {
    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free",
      OPENROUTER_API_KEY: "server-only-openrouter-test-key",
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
      USER_QUOTA: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true })) }),
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "test",
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const tested = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);

    expect(tested.status).toBe(200);
    expect(await tested.json()).toEqual({ ok: true, model: env.AI_MODEL });
    const [providerUrl, providerInit] = fetchMock.mock.calls[1];
    expect(providerUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(providerInit.headers).toMatchObject({
      Authorization: "Bearer server-only-openrouter-test-key",
      "HTTP-Referer": env.APP_ORIGIN,
      "X-Title": "Kxno Desk",
    });
    expect(JSON.parse(String(providerInit.body))).toMatchObject({
      model: env.AI_MODEL,
      max_tokens: 64,
      stream: false,
    });

    const providerErrorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "test",
      }), { headers: { "Content-Type": "application/json" } }))
      .mockRejectedValueOnce(new TypeError("Do not log this sensitive network error."));
    const networkFailure = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), env);
    expect(networkFailure.status).toBe(503);
    expect(providerErrorLog).toHaveBeenCalledWith("AI provider connection test failed.", {
      provider: "openrouter",
      errorType: "Error",
      failureStage: "network",
    });

    const paidModelResponse = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), { ...env, AI_MODEL: "openai/some-model" });
    expect(paidModelResponse.status).toBe(503);
    expect(await paidModelResponse.json()).toEqual({ error: "provider_not_configured" });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        hostname: "app.example.test",
        action: "test",
      }), { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }), { headers: { "Content-Type": "application/json" } }));
    const freeRouter = await worker.fetch(new Request("https://worker.example.test/api/test", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7" },
      body: JSON.stringify({ turnstileToken: "valid-token" }),
    }), {
      ...env,
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free",
    });
    expect(freeRouter.status).toBe(200);
    expect(await freeRouter.json()).toEqual({ ok: true, model: "openrouter/free" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(String(fetchMock.mock.calls[5][1]?.body)).model).toBe("openrouter/free");
  });

  it("rejects a stale client model ID instead of silently switching providers", async () => {
    const env = {
      APP_ORIGIN: "https://app.example.test",
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free",
      OPENROUTER_API_KEY: "server-only-openrouter-test-key",
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
      USER_QUOTA: {
        idFromName: (id: string) => id,
        get: () => ({ fetch: async () => new Response(JSON.stringify({ allowed: true })) }),
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const chat = await worker.fetch(new Request("https://worker.example.test/api/chat", {
      method: "POST",
      headers: { Origin: env.APP_ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.8" },
      body: JSON.stringify({
        turnstileToken: "valid-token",
        message: "Explain this topic",
        model: "legacy/old-model",
        preset: {
          assistantName: "Tutor",
          style: "Clear",
          length: "short",
          depth: "basic",
          language: "en",
          instructions: "",
        },
        history: [],
        attachments: [],
      }),
    }), env);

    expect(chat.status).toBe(503);
    expect(await chat.json()).toEqual({ error: "provider_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts OpenAI-compatible text content blocks from OpenRouter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: [{ type: "text", text: "Free " }, { type: "text", text: "router answer" }] } }],
    }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      AI_MODEL: "openrouter/free",
      ALLOWED_MODELS: "openrouter/free",
      OPENROUTER_API_KEY: "server-only-openrouter-test-key",
    };
    const request = {
      turnstileToken: "valid-turnstile-token",
      message: "Explain this",
      model: "openrouter/free",
      preset: {
        assistantName: "Tutor",
        style: "Clear",
        length: "short" as const,
        depth: "basic" as const,
        language: "en" as const,
        instructions: "",
      },
      history: [],
      attachments: [],
    };
    const chunks: string[] = [];
    for await (const chunk of generateAnswerStream(env, "https://app.example.test", request, new AbortController().signal)) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("Free router answer");
  });
});
