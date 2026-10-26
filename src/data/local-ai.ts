import type { AiMessage, AiPreset } from "./db";

export const LOCAL_AI_MODELS = [
  {
    key: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    id: "onnx-community/Qwen3-0.6B-ONNX",
    revision: "58ca03a5e7b354b480b1a82b34bde8dc7b854cc0",
    dtype: "q4f16",
    cacheName: "kxno-desk-local-ai-qwen3-v1",
    modelFile: "onnx/model_q4f16.onnx",
    files: [
      { path: "config.json", size: 912 },
      { path: "onnx/model_q4f16.onnx", size: 569_789_750 },
      { path: "generation_config.json", size: 219 },
      { path: "tokenizer.json", size: 9_117_040 },
      { path: "tokenizer_config.json", size: 10_369 },
    ],
  },
  {
    key: "qwen2.5-0.5b",
    name: "Qwen2.5 0.5B",
    id: "onnx-community/Qwen2.5-0.5B-Instruct-ONNX",
    revision: "aaabb83c90b732de9a0b4408002d099d92969cd1",
    dtype: "q4f16",
    cacheName: "kxno-desk-local-ai-qwen25-v1",
    modelFile: "onnx/model_q4f16.onnx",
    files: [
      { path: "config.json", size: 732 },
      { path: "onnx/model_q4f16.onnx", size: 483_003_582 },
      { path: "generation_config.json", size: 265 },
      { path: "added_tokens.json", size: 632 },
      { path: "merges.txt", size: 1_671_853 },
      { path: "special_tokens_map.json", size: 613 },
      { path: "tokenizer.json", size: 7_031_863 },
      { path: "tokenizer_config.json", size: 8_055 },
      { path: "vocab.json", size: 2_776_833 },
    ],
  },
] as const;

export type LocalAiModel = (typeof LOCAL_AI_MODELS)[number];
export const DEFAULT_LOCAL_AI_MODEL = LOCAL_AI_MODELS[0];
export const LOCAL_AI_MODEL = DEFAULT_LOCAL_AI_MODEL;
export const LOCAL_AI_MODEL_FILES = DEFAULT_LOCAL_AI_MODEL.files;
export const LOCAL_AI_WEIGHT_SIZE = LOCAL_AI_MODEL_FILES[1].size;
export const LOCAL_AI_MODEL_SIZE = LOCAL_AI_MODEL_FILES.reduce((total, file) => total + file.size, 0);
export const LOCAL_AI_MODEL_SIZE_LABEL = formatLocalAiModelSize(LOCAL_AI_MODEL_SIZE);
export const LOCAL_AI_MODEL_SETTING_KEY = "localAiModel";

export function getLocalAiModel(key: string): LocalAiModel | undefined {
  return LOCAL_AI_MODELS.find((model) => model.key === key);
}

export function formatLocalAiModelSize(size: number): string {
  return `${Math.ceil(size / 1_000_000 / 10) * 10} MB`;
}

export function localAiModelSize(model: LocalAiModel): number {
  return model.files.reduce((total, file) => total + file.size, 0);
}

export function localAiModelSizeLabel(model: LocalAiModel): string {
  return formatLocalAiModelSize(localAiModelSize(model));
}
export const LOCAL_AI_CHUNK_SIZE = 16 * 1024 * 1024;
export const LOCAL_AI_MAX_CONTEXT_CHARS = 1_800;
export const LOCAL_AI_MAX_OUTPUT_TOKENS = 192;

export type LocalAiDevice = "webgpu" | "wasm";
export type LocalAiPhase = "download" | "load" | "generation";
export type LocalAiErrorCode =
  | "busy"
  | "cacheUnavailable"
  | "downloadStalled"
  | "failed"
  | "interrupted"
  | "invalidResponse"
  | "memory"
  | "modelMissing"
  | "network"
  | "outOfMemory"
  | "quota";

export interface LocalAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LocalAiProgress {
  phase: LocalAiPhase;
  loaded?: number;
  total?: number;
  file?: string;
  tokenCount?: number;
}

export type LocalAiRequest = (
  | { id: string; type: "status" }
  | { id: string; type: "download" }
  | { id: string; type: "load" }
  | { id: string; type: "unload" }
  | { id: string; type: "remove" }
  | { id: string; type: "generate"; messages: LocalAiChatMessage[]; maxNewTokens: number }
  | { id: string; type: "stop" }
  | { id: string; type: "shutdown" }
  ) & { modelKey?: string };

export type LocalAiWorkerResponse =
  | { id: string; type: "progress"; progress: LocalAiProgress; text?: string }
  | { id: string; type: "status"; cached: boolean; loaded: boolean; modelKey?: string; device?: LocalAiDevice; wasmThreads?: number }
  | { id: string; type: "ready"; cached: true; modelKey?: string; device: LocalAiDevice; wasmThreads?: number }
  | { id: string; type: "unloaded"; cached: boolean; modelKey?: string }
  | { id: string; type: "removed"; cached: false; modelKey?: string }
  | { id: string; type: "stopping" }
  | { id: string; type: "shutdown" }
  | {
      id: string;
      type: "complete";
      tokenCount: number;
      timeToFirstTokenMs?: number;
      tokensPerSecond: number;
      interrupted: boolean;
      modelKey?: string;
      device?: LocalAiDevice;
    }
  | { id: string; type: "error"; code: LocalAiErrorCode; detail?: string };

export interface LocalAiGenerationResult {
  tokenCount: number;
  timeToFirstTokenMs?: number;
  tokensPerSecond: number;
  interrupted: boolean;
  device?: LocalAiDevice;
}

export type LocalAiProgressHandler = (progress: LocalAiProgress) => void;
export type LocalAiTokenHandler = (text: string) => void;

export type LocalAiPreset = Pick<
  AiPreset,
  "assistantName" | "style" | "length" | "depth" | "language" | "instructions"
>;

export function maxNewTokensForPreset(length: AiPreset["length"]): number {
  if (length === "short") return 96;
  if (length === "detailed") return LOCAL_AI_MAX_OUTPUT_TOKENS;
  return 128;
}

export function localAiChunkRange(
  index: number,
  model: LocalAiModel = DEFAULT_LOCAL_AI_MODEL,
): { start: number; end: number; size: number } | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined;
  const start = index * LOCAL_AI_CHUNK_SIZE;
  const weightSize = model.files.find((file) => file.path === model.modelFile)?.size;
  if (weightSize === undefined || start >= weightSize) return undefined;
  const size = Math.min(LOCAL_AI_CHUNK_SIZE, weightSize - start);
  return { start, end: start + size - 1, size };
}

export function buildLocalAiMessages(
  history: AiMessage[],
  preset: LocalAiPreset,
): LocalAiChatMessage[] {
  const language = preset.language === "auto"
    ? "Use the language of the user's latest message."
    : preset.language === "de"
      ? "Answer in German."
      : "Answer in English.";
  const length = preset.length === "short"
    ? "Keep the answer concise."
    : preset.length === "detailed"
      ? "Give a thorough but focused explanation."
      : "Give a clear, moderately detailed answer.";
  const depth = preset.depth === "basic"
    ? "Explain from the basics."
    : preset.depth === "advanced"
      ? "Use precise terminology and explain important reasoning."
      : "Teach step by step and check for understanding.";
  const systemContent = [
    `You are ${preset.assistantName.trim() || "Kxno AI"}, a helpful school study assistant.`,
    language,
    length,
    depth,
    preset.style.trim() ? `Response style: ${preset.style.trim().slice(0, 120)}.` : "",
    preset.instructions.trim() ? `Additional user instructions: ${preset.instructions.trim().slice(0, 600)}` : "",
    "Do not claim to have accessed files, notes, or school data unless they appear in this conversation.",
  ].filter(Boolean).join(" ");

  let remaining = LOCAL_AI_MAX_CONTEXT_CHARS;
  const recent: LocalAiChatMessage[] = [];
  for (const message of [...history].reverse()) {
    const content = message.content.trim();
    if (!content || remaining <= 0) continue;
    const clipped = content.slice(-remaining);
    recent.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: clipped,
    });
    remaining -= clipped.length;
  }

  recent.reverse();
  return [{ role: "system", content: systemContent }, ...recent];
}

export function formatLocalAiBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  if (value < 1_000_000) return `${Math.round(value / 1_000)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export function localAiProgressPercent(progress: LocalAiProgress): number | undefined {
  if (!progress.total || progress.total <= 0 || progress.loaded === undefined) return undefined;
  return Math.max(0, Math.min(100, (progress.loaded / progress.total) * 100));
}
