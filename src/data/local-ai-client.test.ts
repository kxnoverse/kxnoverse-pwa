import { describe, expect, it } from "vitest";
import {
  LocalAiClient,
  LocalAiError,
  type LocalAiWorkerLike,
} from "./local-ai-client";
import type { LocalAiRequest, LocalAiWorkerResponse } from "./local-ai";

class FakeWorker implements LocalAiWorkerLike {
  readonly requests: LocalAiRequest[] = [];
  terminated = false;
  private messageListener?: (event: MessageEvent<LocalAiWorkerResponse>) => void;

  constructor(private readonly deferGeneration = false) {}

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<LocalAiWorkerResponse>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: "message" | "error",
    listener: ((event: MessageEvent<LocalAiWorkerResponse>) => void) | ((event: ErrorEvent) => void),
  ): void {
    if (type === "message") {
      this.messageListener = listener as (event: MessageEvent<LocalAiWorkerResponse>) => void;
    }
  }

  postMessage(request: LocalAiRequest): void {
    this.requests.push(request);
    if (request.type === "status") {
      this.emit({ id: request.id, type: "status", cached: false, loaded: false, modelKey: request.modelKey });
    } else if (request.type === "download") {
      this.emit({
        id: request.id,
        type: "progress",
        progress: { phase: "download", loaded: 12, total: 24 },
      });
      this.emit({ id: request.id, type: "status", cached: true, loaded: false });
    } else if (request.type === "load") {
      this.emit({ id: request.id, type: "ready", cached: true, device: "wasm", wasmThreads: 1 });
    } else if (request.type === "unload") {
      this.emit({ id: request.id, type: "unloaded", cached: true });
    } else if (request.type === "remove") {
      this.emit({ id: request.id, type: "removed", cached: false });
    } else if (request.type === "generate") {
      if (this.deferGeneration) return;
      this.emit({ id: request.id, type: "progress", progress: { phase: "generation" }, text: "Hallo" });
      this.emit({
        id: request.id,
        type: "complete",
        tokenCount: 2,
        timeToFirstTokenMs: 400,
        tokensPerSecond: 2.5,
        interrupted: false,
        device: "wasm",
      });
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  emitResponse(data: LocalAiWorkerResponse): void {
    this.messageListener?.(new MessageEvent("message", { data }));
  }

  private emit(data: LocalAiWorkerResponse): void {
    this.emitResponse(data);
  }
}

describe("LocalAiClient", () => {
  it("routes local model lifecycle, progress, and streamed text through one worker", async () => {
    const worker = new FakeWorker();
    const client = new LocalAiClient(() => worker);
    const progress: number[] = [];
    const tokens: string[] = [];

    expect(await client.status()).toMatchObject({ cached: false, loaded: false });
    await client.download((item) => progress.push(item.loaded ?? 0));
    expect(progress).toEqual([12]);
    expect(await client.load()).toMatchObject({ loaded: true, device: "wasm" });
    const result = await client.generate(
      [{ role: "user", content: "Hallo" }],
      96,
      (text) => tokens.push(text),
    );
    expect(tokens).toEqual(["Hallo"]);
    expect(result).toMatchObject({ tokenCount: 2, timeToFirstTokenMs: 400, device: "wasm" });
    expect(await client.unload()).toBe(true);
    await client.remove();
    expect(worker.requests.map((request) => request.type)).toEqual([
      "status",
      "download",
      "load",
      "generate",
      "unload",
      "remove",
    ]);
    expect(worker.requests.every((request) => request.type !== "generate" || request.messages[0].role === "user")).toBe(true);
  });

  it("surfaces worker failures as typed local errors", async () => {
    const worker = new FakeWorker();
    worker.postMessage = (request) => {
      worker.requests.push(request);
      worker.emitResponse({ id: request.id, type: "error", code: "modelMissing", detail: "Download the model first." });
    };
    const client = new LocalAiClient(() => worker);
    await expect(client.load()).rejects.toMatchObject({ code: "modelMissing" } satisfies Partial<LocalAiError>);
  });

  it("selects a supported model and sends its key to the worker", async () => {
    const worker = new FakeWorker();
    const client = new LocalAiClient(() => worker);

    await expect(client.selectModel("qwen2.5-0.5b")).resolves.toMatchObject({
      cached: false,
      loaded: false,
      modelKey: "qwen2.5-0.5b",
    });
    expect(worker.requests).toEqual([
      expect.objectContaining({ type: "status", modelKey: "qwen2.5-0.5b" }),
    ]);
    await expect(client.selectModel("unknown")).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("stops active generation by terminating its worker and creates a fresh worker on demand", async () => {
    const worker = new FakeWorker(true);
    const replacementWorker = new FakeWorker();
    const workers = [worker, replacementWorker];
    const client = new LocalAiClient(() => workers.shift() ?? replacementWorker);
    const generation = client.generate([{ role: "user", content: "Erkläre Brüche." }], 96);

    client.stop();
    expect(worker.terminated).toBe(true);
    await expect(generation).resolves.toMatchObject({ interrupted: true });
    await expect(client.status()).resolves.toMatchObject({ loaded: false });
    expect(replacementWorker.requests.map((request) => request.type)).toEqual(["status"]);
  });

  it("rejects pending work and terminates the worker on shutdown", async () => {
    const worker = new FakeWorker(true);
    const client = new LocalAiClient(() => worker);
    const generation = client.generate([{ role: "user", content: "Test" }], 96);

    client.shutdown();

    await expect(generation).rejects.toMatchObject({ code: "interrupted" });
    expect(worker.terminated).toBe(true);
  });
});
