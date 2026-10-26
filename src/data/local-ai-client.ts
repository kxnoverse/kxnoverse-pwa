import type {
  LocalAiChatMessage,
  LocalAiDevice,
  LocalAiErrorCode,
  LocalAiGenerationResult,
  LocalAiProgressHandler,
  LocalAiRequest,
  LocalAiTokenHandler,
  LocalAiWorkerResponse,
} from "./local-ai";
import { DEFAULT_LOCAL_AI_MODEL, getLocalAiModel } from "./local-ai";

interface PendingRequest {
  resolve: (response: LocalAiWorkerResponse) => void;
  reject: (error: LocalAiError) => void;
  onProgress?: LocalAiProgressHandler;
  onToken?: LocalAiTokenHandler;
}

export class LocalAiError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = "LocalAiError";
  }
}

export interface LocalAiStatus {
  cached: boolean;
  loaded: boolean;
  modelKey?: string;
  device?: LocalAiDevice;
  wasmThreads?: number;
}

export interface LocalAiWorkerLike {
  addEventListener(type: "message", listener: (event: MessageEvent<LocalAiWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  postMessage(message: LocalAiRequest): void;
  terminate(): void;
}

type WorkerFactory = () => LocalAiWorkerLike;
type LocalAiCommand = Exclude<LocalAiRequest, { type: "stop" | "shutdown" }>;
type LocalAiCommandWithoutId = LocalAiCommand extends infer Command
  ? Command extends { id: string }
    ? Omit<Command, "id"> & { id?: string }
    : never
  : never;
type LocalAiResponseType = "status" | "ready" | "unloaded" | "removed";
type LocalAiResponse<Type extends LocalAiResponseType> = Extract<LocalAiWorkerResponse, { type: Type }>;

function createWorker(): LocalAiWorkerLike {
  return new Worker(new URL("../workers/local-ai.worker.ts", import.meta.url), { type: "module" });
}

export class LocalAiClient {
  private worker?: LocalAiWorkerLike;
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private activeGenerationId?: string;
  private selectedModelKey: string = DEFAULT_LOCAL_AI_MODEL.key;

  constructor(private readonly workerFactory: WorkerFactory = createWorker) {}

  async status(): Promise<LocalAiStatus> {
    const response = await this.send({ type: "status" });
    if (response.type !== "status") throw new LocalAiError("failed", "Unexpected status response.");
    return {
      cached: response.cached,
      loaded: response.loaded,
      modelKey: response.modelKey,
      device: response.device,
      wasmThreads: response.wasmThreads,
    };
  }

  async selectModel(modelKey: string): Promise<LocalAiStatus> {
    if (!getLocalAiModel(modelKey)) throw new LocalAiError("invalidResponse", "The selected local model is not supported.");
    const previousModelKey = this.selectedModelKey;
    this.selectedModelKey = modelKey;
    try {
      return await this.status();
    } catch (error) {
      this.selectedModelKey = previousModelKey;
      throw error;
    }
  }

  async download(onProgress?: LocalAiProgressHandler): Promise<void> {
    await this.expect(this.send({ type: "download" }, { onProgress }), "status");
  }

  async load(onProgress?: LocalAiProgressHandler): Promise<LocalAiStatus> {
    const response = await this.expect(this.send({ type: "load" }, { onProgress }), "ready");
    return {
      cached: response.cached,
      loaded: true,
      modelKey: response.modelKey,
      device: response.device,
      wasmThreads: response.wasmThreads,
    };
  }

  async unload(): Promise<boolean> {
    const response = await this.expect(this.send({ type: "unload" }), "unloaded");
    return response.cached;
  }

  async remove(): Promise<void> {
    await this.expect(this.send({ type: "remove" }), "removed");
  }

  async generate(
    messages: LocalAiChatMessage[],
    maxNewTokens: number,
    onToken?: LocalAiTokenHandler,
    onProgress?: LocalAiProgressHandler,
  ): Promise<LocalAiGenerationResult> {
    const id = this.createId();
    this.activeGenerationId = id;
    try {
      const response = await this.send(
        { id, type: "generate", messages, maxNewTokens },
        { onProgress, onToken },
      );
      if (response.type !== "complete") throw new LocalAiError("failed", "Unexpected generation response.");
      return {
        tokenCount: response.tokenCount,
        timeToFirstTokenMs: response.timeToFirstTokenMs,
        tokensPerSecond: response.tokensPerSecond,
        interrupted: response.interrupted,
        device: response.device,
      };
    } finally {
      if (this.activeGenerationId === id) this.activeGenerationId = undefined;
    }
  }

  stop(): void {
    if (!this.activeGenerationId || !this.worker) return;
    const id = this.activeGenerationId;
    const worker = this.worker;
    const request = this.pending.get(id);

    this.pending.delete(id);
    this.activeGenerationId = undefined;
    this.worker = undefined;
    worker.terminate();
    request?.resolve({
      id,
      type: "complete",
      tokenCount: 0,
      tokensPerSecond: 0,
      interrupted: true,
    });
  }

  shutdown(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.activeGenerationId = undefined;
    for (const request of this.pending.values()) request.reject(new LocalAiError("interrupted"));
    this.pending.clear();
  }

  private async expect<Type extends LocalAiResponseType>(
    responsePromise: Promise<LocalAiWorkerResponse>,
    expected: Type,
  ): Promise<LocalAiResponse<Type>> {
    const response = await responsePromise;
    if (response.type !== expected) throw new LocalAiError("failed", `Unexpected ${response.type} response.`);
    return response as LocalAiResponse<Type>;
  }

  private send(
    request: LocalAiCommandWithoutId,
    handlers: Pick<PendingRequest, "onProgress" | "onToken"> = {},
  ): Promise<LocalAiWorkerResponse> {
    let worker: LocalAiWorkerLike;
    try {
      worker = this.getWorker();
    } catch (cause) {
      return Promise.reject(new LocalAiError(
        "failed",
        cause instanceof Error ? cause.message : "The local AI worker could not be started.",
      ));
    }

    const id = request.id ?? this.createId();
    const message = { ...request, id, modelKey: this.selectedModelKey } as LocalAiRequest;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, ...handlers });
      try {
        worker.postMessage(message);
      } catch (cause) {
        this.pending.delete(id);
        reject(new LocalAiError("failed", cause instanceof Error ? cause.message : undefined));
      }
    });
  }

  private getWorker(): LocalAiWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener("message", (event) => this.handleMessage(event.data));
    worker.addEventListener("error", (event) => this.handleWorkerError(event));
    this.worker = worker;
    return worker;
  }

  private handleMessage(response: LocalAiWorkerResponse): void {
    const request = this.pending.get(response.id);
    if (!request) return;
    if (response.type === "progress") {
      request.onProgress?.(response.progress);
      if (response.text) request.onToken?.(response.text);
      return;
    }
    if (response.type === "stopping") return;
    this.pending.delete(response.id);
    if (response.type === "error") {
      request.reject(new LocalAiError(response.code, response.detail));
      return;
    }
    request.resolve(response);
  }

  private handleWorkerError(event: ErrorEvent): void {
    const error = new LocalAiError("failed", event.message || "The local AI worker stopped unexpectedly.");
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.activeGenerationId = undefined;
    this.worker?.terminate();
    this.worker = undefined;
  }

  private createId(): string {
    this.nextId += 1;
    return `local-ai-${Date.now()}-${this.nextId}`;
  }
}

export const localAiClient = new LocalAiClient();
