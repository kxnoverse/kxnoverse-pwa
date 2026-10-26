import {
  env,
  InterruptableStoppingCriteria,
  pipeline,
  TextStreamer,
} from "@huggingface/transformers";
import type {
  LocalAiDevice,
  LocalAiErrorCode,
  LocalAiProgress,
  LocalAiRequest,
  LocalAiWorkerResponse,
} from "../data/local-ai";
import {
  DEFAULT_LOCAL_AI_MODEL,
  LOCAL_AI_CHUNK_SIZE,
  getLocalAiModel,
  localAiChunkRange,
  localAiModelSize,
  type LocalAiModel,
} from "../data/local-ai";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import ortWasmMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";

const CHUNK_QUERY_KEY = "__kxno_local_ai_chunk";
const CHUNK_SIZE_HEADER = "x-kxno-chunk-size";
const FILE_SIZE_HEADER = "x-kxno-file-size";
const DOWNLOAD_STALL_TIMEOUT_MS = 60_000;

interface ChunkManifest {
  version: 1;
  size: number;
  chunkSize: number;
  chunks: number;
  completed: number[];
}

interface WorkerScope {
  document?: unknown;
  postMessage?: (message: LocalAiWorkerResponse) => void;
  addEventListener?: (type: "message", listener: (event: MessageEvent<LocalAiRequest>) => void) => void;
  close?: () => void;
}

interface CacheAdapter {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
}

const workerScope = globalThis as typeof globalThis & WorkerScope;
const scope = workerScope;
let activeModel: LocalAiModel = DEFAULT_LOCAL_AI_MODEL;
const getModelFile = (): LocalAiModel["files"][number] | undefined =>
  activeModel.files.find((file) => file.path === activeModel.modelFile);
const modelFileUrl = (path: string): string => {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${activeModel.id}/resolve/${activeModel.revision}/${encoded}`;
};
const chunkUrl = (index: number | "manifest"): string => {
  const modelFile = getModelFile();
  if (!modelFile) throw new Error("The configured model file is missing.");
  const url = new URL(modelFileUrl(modelFile.path));
  url.searchParams.set(CHUNK_QUERY_KEY, String(index));
  return url.href;
};

let generator: Awaited<ReturnType<typeof createGenerator>> | undefined;
let activeDevice: LocalAiDevice | undefined;
let stoppingCriteria: InterruptableStoppingCriteria | undefined;
let downloadController: AbortController | undefined;
let busy = false;
let shutdownRequested = false;
let wasmThreads = 1;

function post(message: LocalAiWorkerResponse): void {
  scope.postMessage?.(message);
}

function sendProgress(id: string, progress: LocalAiProgress, text?: string): void {
  post({ id, type: "progress", progress, ...(text ? { text } : {}) });
}

function getErrorCode(error: unknown, stalled = false): LocalAiErrorCode {
  if (stalled) return "downloadStalled";
  if (error instanceof DOMException && error.name === "AbortError") return "interrupted";
  if (error instanceof DOMException && error.name === "QuotaExceededError") return "quota";
  const message = error instanceof Error ? error.message : String(error);
  if (/quota|storage.*full/i.test(message)) return "quota";
  if (/memory|allocation|out of memory|wasm memory/i.test(message)) return "outOfMemory";
  if (/local_files_only|not found|cached|fully downloaded/i.test(message)) return "modelMissing";
  if (/range response|size mismatch|http [45]\d\d|failed \(\d+\)/i.test(message)) return "invalidResponse";
  if (/fetch|network|internet|failed to load/i.test(message)) return "network";
  return "failed";
}

function safeErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/\S+/gi, "[remote URL]")
    .replace(/\b(signature|token|authorization|key)=[^&\s]+/gi, "$1=[redacted]")
    .slice(0, 180);
}

function getCacheApi(): CacheStorage {
  if (typeof caches === "undefined") throw new Error("Browser model storage is unavailable.");
  return caches;
}

function modelPathForUrl(value: string): string | undefined {
  try {
    const url = new URL(value, globalThis.location.href);
    const remotePrefix = `/${activeModel.id}/resolve/${activeModel.revision}/`;
    const localPrefix = `/models/${activeModel.id}/`;
    const prefix = url.origin === "https://huggingface.co" && url.pathname.startsWith(remotePrefix)
      ? remotePrefix
      : url.pathname.startsWith(localPrefix)
        ? localPrefix
        : undefined;
    if (!prefix) return undefined;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return activeModel.files.find((file) => file.path === path)?.path;
  } catch {
    return undefined;
  }
}

function chunkSizeAt(index: number): number {
  return localAiChunkRange(index, activeModel)?.size ?? 0;
}

function isValidManifest(value: unknown): value is ChunkManifest {
  const modelFile = getModelFile();
  if (!modelFile || typeof value !== "object" || value === null) return false;
  const manifest = value as Partial<ChunkManifest>;
  const chunkCount = Math.ceil(modelFile.size / LOCAL_AI_CHUNK_SIZE);
  return manifest.version === 1 &&
    manifest.size === modelFile.size &&
    manifest.chunkSize === LOCAL_AI_CHUNK_SIZE &&
    manifest.chunks === chunkCount &&
    Array.isArray(manifest.completed) &&
    manifest.completed.every((index) => Number.isInteger(index) && index >= 0 && index < chunkCount);
}

async function getManifest(cache: Cache): Promise<ChunkManifest | undefined> {
  if (!getModelFile()) throw new Error("The configured model file is missing.");
  const response = await cache.match(chunkUrl("manifest"));
  if (!response) return undefined;
  const value: unknown = await response.json();
  if (!isValidManifest(value)) {
    throw new Error("The cached model manifest is invalid. Remove the model and download it again.");
  }
  return value;
}

async function writeManifest(cache: Cache, manifest: ChunkManifest): Promise<void> {
  await cache.put(chunkUrl("manifest"), new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/json" },
  }));
}

async function isModelCached(cache: Cache): Promise<boolean> {
  const modelFile = getModelFile();
  if (!modelFile) return false;
  const direct = await cache.match(modelFileUrl(modelFile.path));
  if (direct) {
    const size = direct.headers.get(CHUNK_SIZE_HEADER) ??
      direct.headers.get(FILE_SIZE_HEADER) ??
      direct.headers.get("content-length");
    if (size === null || size === String(modelFile.size)) return true;
  }
  const manifest = await getManifest(cache);
  if (!manifest || manifest.completed.length !== manifest.chunks) return false;
  for (let index = 0; index < manifest.chunks; index += 1) {
    if (!manifest.completed.includes(index)) return false;
    const chunk = await cache.match(chunkUrl(index));
    if (chunk?.headers.get(CHUNK_SIZE_HEADER) !== String(chunkSizeAt(index))) return false;
  }
  return true;
}

async function isModelFileAvailable(cache: Cache, file: LocalAiModel["files"][number]): Promise<boolean> {
  if (file.path === activeModel.modelFile) return isModelCached(cache);
  const response = await cache.match(modelFileUrl(file.path));
  if (!response) return false;
  const size = response.headers.get(FILE_SIZE_HEADER) ?? response.headers.get("content-length");
  return size === null
    ? (await response.clone().arrayBuffer()).byteLength === file.size
    : size === String(file.size);
}

async function checkCache(): Promise<boolean[]> {
  const cache = await getCacheApi().open(activeModel.cacheName);
  return Promise.all(activeModel.files.map((file) => isModelFileAvailable(cache, file)));
}

async function readManifestChunkStream(cache: Cache, manifest: ChunkManifest): Promise<Response> {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= manifest.chunks) {
        controller.close();
        return;
      }
      const chunk = await cache.match(chunkUrl(index));
      const expectedSize = chunkSizeAt(index);
      if (!chunk || chunk.headers.get(CHUNK_SIZE_HEADER) !== String(expectedSize)) {
        controller.error(new Error(`Cached model chunk ${index} is missing or incomplete.`));
        return;
      }
      controller.enqueue(new Uint8Array(await chunk.arrayBuffer()));
      index += 1;
    },
  });
  return new Response(body, {
    headers: {
      "content-length": String(manifest.size),
      "content-type": "application/octet-stream",
    },
  });
}

function createCacheAdapter(cache: Cache): CacheAdapter {
  return {
    async match(request) {
      const modelPath = modelPathForUrl(request);
      const modelFile = getModelFile();
      if (modelFile && modelPath === modelFile.path) {
        const direct = await cache.match(modelFileUrl(modelFile.path));
        if (direct) return direct;
        const manifest = await getManifest(cache);
        if (manifest && await isModelCached(cache)) return readManifestChunkStream(cache, manifest);
      }
      const mappedUrl = modelPath ? modelFileUrl(modelPath) : request;
      return cache.match(mappedUrl);
    },
    async put(request, response) {
      const modelPath = modelPathForUrl(request);
      if (getModelFile() && modelPath === activeModel.modelFile) {
        throw new Error("The model file must be stored with the resumable chunk downloader.");
      }
      const mappedUrl = modelPath ? modelFileUrl(modelPath) : request;
      await cache.put(mappedUrl, response.clone());
    },
    async delete(request) {
      return cache.delete(request);
    },
  };
}

function startStallTimer(controller: AbortController, onStall: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    onStall();
    controller.abort();
  }, DOWNLOAD_STALL_TIMEOUT_MS);
}

async function readResponseBytes(
  response: Response,
  file: LocalAiModel["files"][number],
  id: string,
  loadedBeforeFile: number,
  total: number,
  controller: AbortController,
): Promise<Uint8Array> {
  if (!response.body) throw new Error(`Model file has no response body: ${file.path}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let stalled = false;
  let timer = startStallTimer(controller, () => { stalled = true; });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      timer = startStallTimer(controller, () => { stalled = true; });
      received += value.byteLength;
      chunks.push(value);
      sendProgress(id, {
        phase: "download",
        loaded: loadedBeforeFile + received,
        total,
        file: file.path,
      });
    }
  } catch (error) {
    if (stalled) throw new Error(`Model download stalled while fetching ${file.path}.`);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (received !== file.size) {
    throw new Error(`Model file size mismatch for ${file.path}: received ${received}, expected ${file.size}.`);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadModelFile(
  id: string,
  cache: Cache,
  file: LocalAiModel["files"][number],
  loadedBeforeFile: number,
): Promise<void> {
  const controller = downloadController;
  if (!controller) throw new Error("The model download was interrupted.");
  const total = localAiModelSize(activeModel);
  if (file.path === activeModel.modelFile) {
    await downloadLargeModelFile(id, cache, file, loadedBeforeFile, total, controller);
    return;
  }

  let stalled = false;
  let timer = startStallTimer(controller, () => { stalled = true; });
  let response: Response;
  try {
    response = await fetch(modelFileUrl(file.path), {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    clearTimeout(timer);
    if (stalled) throw new Error(`Model download stalled while fetching ${file.path}.`);
    throw error;
  }
  clearTimeout(timer);
  if (!response.ok) throw new Error(`Model file download failed (${response.status}) for ${file.path}.`);

  const bytes = await readResponseBytes(response, file, id, loadedBeforeFile, total, controller);
  await cache.put(modelFileUrl(file.path), new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      [FILE_SIZE_HEADER]: String(file.size),
    },
  }));
}

async function downloadLargeModelFile(
  id: string,
  cache: Cache,
  file: LocalAiModel["files"][number],
  loadedBeforeFile: number,
  total: number,
  controller: AbortController,
): Promise<void> {
  const modelFile = getModelFile();
  if (!modelFile || modelFile.path !== file.path) throw new Error("The configured model file is missing.");
  const chunkCount = Math.ceil(file.size / LOCAL_AI_CHUNK_SIZE);
  const manifest = await getManifest(cache) ?? {
    version: 1 as const,
    size: file.size,
    chunkSize: LOCAL_AI_CHUNK_SIZE,
    chunks: chunkCount,
    completed: [],
  };
  const completed = new Set<number>();
  let downloaded = 0;
  for (const index of manifest.completed) {
    const cached = await cache.match(chunkUrl(index));
    if (cached?.headers.get(CHUNK_SIZE_HEADER) === String(chunkSizeAt(index))) {
      completed.add(index);
      downloaded += chunkSizeAt(index);
    } else {
      await cache.delete(chunkUrl(index));
    }
  }
  manifest.completed = [...completed].sort((left, right) => left - right);
  await writeManifest(cache, manifest);
  sendProgress(id, {
    phase: "download",
    loaded: loadedBeforeFile + downloaded,
    total,
    file: file.path,
  });

  for (let index = 0; index < chunkCount; index += 1) {
    if (completed.has(index)) continue;
    const range = localAiChunkRange(index, activeModel);
    if (!range) throw new Error(`Invalid model chunk index ${index}.`);
    const { start, end } = range;
    let stalled = false;
    let timer = startStallTimer(controller, () => { stalled = true; });
    let response: Response;
    try {
      response = await fetch(modelFileUrl(file.path), {
        signal: controller.signal,
        cache: "no-store",
        redirect: "follow",
        headers: { Range: `bytes=${start}-${end}` },
      });
    } catch (error) {
      clearTimeout(timer);
      if (stalled) throw new Error(`Model download stalled while fetching chunk ${index}.`);
      throw error;
    }
    if (response.status !== 206) {
      clearTimeout(timer);
      await response.body?.cancel();
      throw new Error(`Model range request failed (${response.status}) for chunk ${index}.`);
    }
    const contentRange = response.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
    if (!contentRange ||
      Number(contentRange[1]) !== start ||
      Number(contentRange[2]) !== end ||
      Number(contentRange[3]) !== file.size) {
      clearTimeout(timer);
      await response.body?.cancel();
      throw new Error(`Model range response was invalid for chunk ${index}.`);
    }
    if (!response.body) {
      clearTimeout(timer);
      throw new Error(`Model range response has no body for chunk ${index}.`);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = startStallTimer(controller, () => { stalled = true; });
        received += value.byteLength;
        chunks.push(value);
        sendProgress(id, {
          phase: "download",
          loaded: loadedBeforeFile + downloaded + received,
          total,
          file: `${file.path} · ${index + 1}/${chunkCount}`,
        });
      }
    } catch (error) {
      if (stalled) throw new Error(`Model download stalled while fetching chunk ${index}.`);
      throw error;
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
    if (received !== chunkSizeAt(index)) {
      throw new Error(`Model chunk ${index} size mismatch: received ${received}, expected ${chunkSizeAt(index)}.`);
    }
    const chunkBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      chunkBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    await cache.put(chunkUrl(index), new Response(chunkBytes, {
      headers: {
        "content-type": "application/octet-stream",
        [CHUNK_SIZE_HEADER]: String(chunkBytes.byteLength),
      },
    }));
    completed.add(index);
    manifest.completed = [...completed].sort((left, right) => left - right);
    await writeManifest(cache, manifest);
    downloaded += chunkBytes.byteLength;
    sendProgress(id, {
      phase: "download",
      loaded: loadedBeforeFile + downloaded,
      total,
      file: `${file.path} · ${index + 1}/${chunkCount}`,
    });
  }
}

async function downloadModel(id: string): Promise<void> {
  const cache = await getCacheApi().open(activeModel.cacheName);
  const cached = await checkCache();
  let loaded = 0;
  const total = localAiModelSize(activeModel);
  for (let index = 0; index < activeModel.files.length; index += 1) {
    const file = activeModel.files[index];
    if (cached[index]) {
      loaded += file.size;
      sendProgress(id, { phase: "download", loaded, total, file: file.path });
      continue;
    }
    await downloadModelFile(id, cache, file, loaded);
    loaded += file.size;
    sendProgress(id, { phase: "download", loaded, total, file: file.path });
  }
  if (!(await checkCache()).every(Boolean)) throw new Error("The downloaded model files are incomplete.");
}

function configureRuntime(): void {
  const isolated = globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
  wasmThreads = isolated
    ? Math.min(2, Math.max(1, Math.floor(globalThis.navigator.hardwareConcurrency) || 1))
    : 1;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.numThreads = wasmThreads;
    wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortWasmMjsUrl };
  }
  env.cacheKey = activeModel.cacheName;
  env.useBrowserCache = true;
  env.useWasmCache = true;
}

async function createGenerator(
  device: LocalAiDevice,
  id: string,
): Promise<Awaited<ReturnType<typeof pipeline<"text-generation">>>> {
  return pipeline("text-generation", activeModel.id, {
    dtype: activeModel.dtype,
    revision: activeModel.revision,
    local_files_only: true,
    device,
    progress_callback: (progress) => {
      if (progress.status === "progress_total") {
        sendProgress(id, {
          phase: "load",
          loaded: progress.loaded,
          total: progress.total,
        });
      }
    },
  });
}

async function loadModel(id: string): Promise<void> {
  if (!(await checkCache()).every(Boolean)) throw new Error("The complete model is not in the local cache.");
  configureRuntime();
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.useCustomCache = true;
  env.customCache = createCacheAdapter(await getCacheApi().open(activeModel.cacheName));

  let webGpuSupported = false;
  const navigatorWithGpu = globalThis.navigator as Navigator & {
    gpu?: { requestAdapter: () => Promise<{ features: { has(feature: string): boolean } } | null> };
  };
  try {
    const adapter = await navigatorWithGpu.gpu?.requestAdapter();
    webGpuSupported = adapter?.features.has("shader-f16") === true;
  } catch {
    webGpuSupported = false;
  }

  if (webGpuSupported) {
    try {
      generator = await createGenerator("webgpu", id);
      activeDevice = "webgpu";
      post({ id, type: "ready", cached: true, modelKey: activeModel.key, device: activeDevice, wasmThreads });
      return;
    } catch (error) {
      generator = undefined;
      activeDevice = undefined;
      console.warn("Local AI WebGPU initialization failed; retrying with WASM.", safeErrorDetail(error));
    }
  }
  generator = await createGenerator("wasm", id);
  activeDevice = "wasm";
  post({ id, type: "ready", cached: true, modelKey: activeModel.key, device: activeDevice, wasmThreads });
}

async function unloadModel(): Promise<void> {
  stoppingCriteria?.interrupt();
  stoppingCriteria = undefined;
  if (generator) {
    await generator.dispose();
    generator = undefined;
  }
  activeDevice = undefined;
}

async function generate(id: string, messages: LocalAiRequest & { type: "generate" }): Promise<void> {
  if (!generator) throw new Error("Load the local model before generating a response.");
  const criteria = new InterruptableStoppingCriteria();
  stoppingCriteria = criteria;
  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  let tokenCount = 0;
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    token_callback_function(tokens) {
      tokenCount += tokens.length;
      firstTokenAt ??= performance.now();
      if (tokenCount % 4 === 0) {
        sendProgress(id, { phase: "generation", tokenCount });
      }
    },
    callback_function(text) {
      if (text) sendProgress(id, { phase: "generation" }, text);
    },
  });

  await generator(messages.messages, {
    max_new_tokens: Math.min(192, Math.max(16, Math.floor(messages.maxNewTokens) || 96)),
    do_sample: false,
    tokenizer_encode_kwargs: { enable_thinking: false },
    streamer,
    stopping_criteria: criteria,
  });
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  post({
    id,
    type: "complete",
    tokenCount,
    timeToFirstTokenMs: firstTokenAt === undefined ? undefined : Math.round(firstTokenAt - startedAt),
    tokensPerSecond: elapsedSeconds > 0 ? Math.round((tokenCount / elapsedSeconds) * 10) / 10 : 0,
    interrupted: criteria.interrupted,
    modelKey: activeModel.key,
    device: activeDevice,
  });
  if (stoppingCriteria === criteria) stoppingCriteria = undefined;
}

async function removeModel(): Promise<void> {
  await unloadModel();
  const cache = await getCacheApi().open(activeModel.cacheName);
  const directKeys = activeModel.files.map((file) => modelFileUrl(file.path));
  const modelFile = getModelFile();
  const chunkKeys = modelFile
    ? (await cache.keys()).filter((request) => {
        const url = new URL(request.url);
        const modelUrl = new URL(modelFileUrl(modelFile.path));
        return url.origin === modelUrl.origin &&
          url.pathname === modelUrl.pathname &&
          url.searchParams.has(CHUNK_QUERY_KEY);
      }).map((request) => request.url)
    : [];
  await Promise.all([...directKeys, ...chunkKeys].map((key) => cache.delete(key)));
  if ((await checkCache()).some(Boolean)) throw new Error("Some model files could not be removed.");
}

async function handleRequest(request: LocalAiRequest): Promise<void> {
  if (request.type === "stop") {
    stoppingCriteria?.interrupt();
    downloadController?.abort();
    post({ id: request.id, type: "stopping" });
    return;
  }
  if (request.type === "shutdown") {
    shutdownRequested = true;
    stoppingCriteria?.interrupt();
    downloadController?.abort();
    if (!busy) {
      await unloadModel();
      post({ id: request.id, type: "shutdown" });
      scope.close?.();
    }
    return;
  }
  if (busy) {
    post({ id: request.id, type: "error", code: "busy" });
    return;
  }

  busy = true;
  try {
    const requestedModel = request.modelKey ? getLocalAiModel(request.modelKey) : activeModel;
    if (!requestedModel) throw new Error("The selected local model is not supported.");
    if (requestedModel.key !== activeModel.key) {
      await unloadModel();
      activeModel = requestedModel;
    }

    if (request.type === "status") {
      const cached = (await checkCache()).every(Boolean);
      post({
        id: request.id,
        type: "status",
        cached,
        loaded: Boolean(generator),
        modelKey: activeModel.key,
        device: activeDevice,
        wasmThreads,
      });
    } else if (request.type === "download") {
      downloadController = new AbortController();
      await downloadModel(request.id);
      post({
        id: request.id,
        type: "status",
        cached: true,
        loaded: Boolean(generator),
        modelKey: activeModel.key,
        device: activeDevice,
        wasmThreads,
      });
    } else if (request.type === "load") {
      sendProgress(request.id, { phase: "load" });
      await loadModel(request.id);
    } else if (request.type === "unload") {
      await unloadModel();
      post({ id: request.id, type: "unloaded", cached: (await checkCache()).every(Boolean), modelKey: activeModel.key });
    } else if (request.type === "remove") {
      await removeModel();
      post({ id: request.id, type: "removed", cached: false, modelKey: activeModel.key });
    } else {
      await generate(request.id, request);
    }
  } catch (error) {
    const code = getErrorCode(error, error instanceof Error && error.message.includes("stalled"));
    console.error(`Local AI worker ${request.type} failed (${code}): ${safeErrorDetail(error)}`);
    post({ id: request.id, type: "error", code, detail: safeErrorDetail(error) });
  } finally {
    busy = false;
    downloadController = undefined;
    if (shutdownRequested) {
      await unloadModel();
      post({ id: request.id, type: "shutdown" });
      scope.close?.();
    }
  }
}

if (typeof workerScope.document === "undefined" && typeof scope.addEventListener === "function") {
  scope.addEventListener("message", (event) => {
    void handleRequest(event.data);
  });
}
