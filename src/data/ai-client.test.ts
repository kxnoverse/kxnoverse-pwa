import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assistantClient,
  validateAssistantAttachmentContent,
  validateAssistantAttachments,
} from "./ai-client";

afterEach(() => vi.unstubAllGlobals());

describe("assistant attachments and streaming client", () => {
  it("allows the supported image and PDF MIME types and rejects unsupported or excessive files", () => {
    const accepted = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
      .map((type) => new File(["x"], `file.${type}`, { type }));
    expect(validateAssistantAttachments(accepted)).toBeUndefined();
    expect(validateAssistantAttachments([new File(["x"], "page.svg", { type: "image/svg+xml" })])).toBe("invalidAttachment");
    expect(validateAssistantAttachments(Array.from({ length: 6 }, (_, index) => new File(["x"], `${index}.png`, { type: "image/png" })))).toBe("invalidAttachment");
    expect(validateAssistantAttachments([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })])).toBe("attachmentTooLarge");
  });

  it("checks the actual image and PDF signatures rather than trusting filenames", async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]);
    const jpeg = new Blob([new Uint8Array([255, 216, 255, 1])]);
    const webp = new Blob(["RIFF0000WEBP"]);
    const pdf = new Blob(["%PDF-1.7"]);
    expect(await validateAssistantAttachmentContent(png, "image/png")).toBe(true);
    expect(await validateAssistantAttachmentContent(jpeg, "image/jpeg")).toBe(true);
    expect(await validateAssistantAttachmentContent(webp, "image/webp")).toBe(true);
    expect(await validateAssistantAttachmentContent(pdf, "application/pdf")).toBe(true);
    expect(await validateAssistantAttachmentContent(new Blob(["not a pdf"]), "application/pdf")).toBe(false);
  });

  it("streams response tokens, reports real upload progress, and sends image bytes", async () => {
    class FakeXhr {
      upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onloadend: (() => void) | null = null;
      status = 200;
      responseText = "";
      body = "";
      open() {}
      setRequestHeader() {}
      getResponseHeader() { return "text/event-stream; charset=utf-8"; }
      send(body: string) {
        this.body = body;
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        this.responseText = 'event: token\ndata: {"text":"OK"}\n\nevent: done\ndata: {}\n\n';
        this.onprogress?.();
        this.onload?.();
      }
      abort() { this.onabort?.(); }
    }
    let xhr: FakeXhr | undefined;
    class TestXhr extends FakeXhr {
      constructor() {
        super();
        xhr = this;
      }
    }
    vi.stubGlobal("XMLHttpRequest", TestXhr);
    const tokens: string[] = [];
    const progress: number[] = [];

    await assistantClient.send({
      endpoint: "https://worker.example.test",
      turnstileToken: "valid-turnstile-token",
      message: "What is in this picture?",
      model: "openrouter/free",
      preset: { assistantName: "Tutor", style: "Clear", length: "short", depth: "guided", language: "en", instructions: "Use examples" },
      history: [{ role: "user", content: "Earlier question" }, { role: "model", content: "Earlier answer" }],
      attachments: [{ name: "diagram.png", mimeType: "image/png", size: 8, data: "iVBORw0KGgo=" }],
    }, {
      signal: new AbortController().signal,
      onToken: (token) => tokens.push(token),
      onProgress: (value) => progress.push(value),
    });

    expect(tokens).toEqual(["OK"]);
    expect(progress).toEqual([50]);
    expect(JSON.parse(xhr!.body)).toMatchObject({
      turnstileToken: "valid-turnstile-token",
      model: "openrouter/free",
      history: [{ role: "user" }, { role: "model" }],
      attachments: [{ name: "diagram.png", mimeType: "image/png", data: "iVBORw0KGgo=" }],
    });
  });
});
