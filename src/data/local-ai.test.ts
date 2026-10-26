import { describe, expect, it } from "vitest";
import {
  buildLocalAiMessages,
  DEFAULT_LOCAL_AI_MODEL,
  formatLocalAiBytes,
  LOCAL_AI_CHUNK_SIZE,
  LOCAL_AI_MAX_CONTEXT_CHARS,
  LOCAL_AI_MODELS,
  LOCAL_AI_MODEL,
  LOCAL_AI_MODEL_FILES,
  LOCAL_AI_MODEL_SIZE,
  localAiChunkRange,
  localAiModelSize,
  localAiProgressPercent,
  maxNewTokensForPreset,
} from "./local-ai";

describe("local AI model configuration", () => {
  it("pins the intended Qwen3 model, revision, and quantization", () => {
    expect(LOCAL_AI_MODEL).toMatchObject({
      id: "onnx-community/Qwen3-0.6B-ONNX",
      revision: "58ca03a5e7b354b480b1a82b34bde8dc7b854cc0",
      dtype: "q4f16",
    });
    expect(LOCAL_AI_MODEL.revision).toMatch(/^[a-f0-9]{40}$/);
    expect(LOCAL_AI_MODEL_FILES.map((file) => file.path)).toEqual([
      "config.json",
      "onnx/model_q4f16.onnx",
      "generation_config.json",
      "tokenizer.json",
      "tokenizer_config.json",
    ]);
    expect(LOCAL_AI_MODEL_SIZE).toBe(578_918_290);
  });

  it("pins a multilingual Qwen2.5 fallback as a separate, independently cached model", () => {
    const model = LOCAL_AI_MODELS[1];
    expect(model).toMatchObject({
      key: "qwen2.5-0.5b",
      id: "onnx-community/Qwen2.5-0.5B-Instruct-ONNX",
      revision: "aaabb83c90b732de9a0b4408002d099d92969cd1",
      dtype: "q4f16",
      cacheName: "kxno-desk-local-ai-qwen25-v1",
      modelFile: "onnx/model_q4f16.onnx",
    });
    expect(localAiModelSize(model)).toBe(494_494_428);
    expect(model.files.map((file) => file.path)).toContain("merges.txt");
    expect(model.files.map((file) => file.path)).toContain("vocab.json");
    expect(LOCAL_AI_MODELS[0]).toEqual(DEFAULT_LOCAL_AI_MODEL);
    expect(LOCAL_AI_MODELS[0].cacheName).not.toBe(model.cacheName);
  });

  it("calculates bounded 16 MiB ranges, including the final partial chunk", () => {
    const chunkCount = Math.ceil(LOCAL_AI_MODEL_FILES[1].size / LOCAL_AI_CHUNK_SIZE);
    expect(chunkCount).toBe(34);
    expect(localAiChunkRange(0)).toEqual({
      start: 0,
      end: LOCAL_AI_CHUNK_SIZE - 1,
      size: LOCAL_AI_CHUNK_SIZE,
    });
    expect(localAiChunkRange(chunkCount - 1)).toEqual({
      start: 33 * LOCAL_AI_CHUNK_SIZE,
      end: LOCAL_AI_MODEL_FILES[1].size - 1,
      size: LOCAL_AI_MODEL_FILES[1].size - 33 * LOCAL_AI_CHUNK_SIZE,
    });
    expect(localAiChunkRange(-1)).toBeUndefined();
    expect(localAiChunkRange(chunkCount)).toBeUndefined();
  });

  it("uses the selected model weight size when calculating resumable ranges", () => {
    const model = LOCAL_AI_MODELS[1];
    const finalChunk = Math.ceil(model.files[1].size / LOCAL_AI_CHUNK_SIZE) - 1;
    expect(localAiChunkRange(finalChunk, model)).toEqual({
      start: finalChunk * LOCAL_AI_CHUNK_SIZE,
      end: model.files[1].size - 1,
      size: model.files[1].size - finalChunk * LOCAL_AI_CHUNK_SIZE,
    });
    expect(localAiChunkRange(finalChunk + 1, model)).toBeUndefined();
  });

  it("bounds conversation context while preserving the latest message and preset behavior", () => {
    const history = [
      { id: "old", conversationId: "c", role: "user" as const, content: "old ".repeat(800), createdAt: 1 },
      { id: "answer", conversationId: "c", role: "assistant" as const, content: "prior answer", createdAt: 2 },
      { id: "latest", conversationId: "c", role: "user" as const, content: "Explain 2 + 2.", createdAt: 3 },
    ];
    const messages = buildLocalAiMessages(history, {
      assistantName: "Tutor",
      style: "Clear",
      length: "detailed",
      depth: "guided",
      language: "de",
      instructions: "Use examples",
    });

    expect(messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Answer in German."),
    });
    expect(messages[0].content).toContain("Tutor");
    expect(messages[0].content).toContain("Use examples");
    expect(messages.at(-1)).toEqual({ role: "user", content: "Explain 2 + 2." });
    expect(messages.slice(1).reduce((sum, message) => sum + message.content.length, 0))
      .toBeLessThanOrEqual(LOCAL_AI_MAX_CONTEXT_CHARS);
    expect(messages.some((message) => message.role === "assistant")).toBe(true);
    expect(maxNewTokensForPreset("short")).toBe(96);
    expect(maxNewTokensForPreset("medium")).toBe(128);
    expect(maxNewTokensForPreset("detailed")).toBe(192);
  });

  it("formats model and progress values without exceeding progress bounds", () => {
    expect(formatLocalAiBytes(1_500_000)).toBe("1.5 MB");
    expect(formatLocalAiBytes(Number.NaN)).toBe("0 MB");
    expect(localAiProgressPercent({ phase: "download", loaded: 50, total: 200 })).toBe(25);
    expect(localAiProgressPercent({ phase: "load", loaded: 300, total: 200 })).toBe(100);
    expect(localAiProgressPercent({ phase: "generation" })).toBeUndefined();
  });
});
