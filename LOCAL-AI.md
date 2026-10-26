# Local AI

## Current implementation

KxnoDesk runs Local AI in a dedicated module worker. It does not send chat
prompts to a cloud inference provider. The Assistant uses the existing
`aiPresets`, `aiConversations`, `aiMessages`, and `aiAttachments` IndexedDB
tables; existing rows are retained, including legacy provider identifiers and
settings.

Models are never downloaded automatically. The user selects a model in
Settings → AI, then confirms its download in the Assistant. Each model has a
separate browser Cache API cache; model weights are not part of the normal PWA
precache.

The ONNX Runtime WASM factory is part of the PWA precache; the 26 MB WASM
binary is excluded because Chrome rejects direct Cache API writes of its
network response. The service worker buffers that response before saving it to
the separate `kxno-onnx-wasm-runtime-v1` runtime cache. Both assets use the
Vite base path, so this works beneath `/kxnoverse-pwa/` on GitHub Pages.

| Setting | Value |
| --- | --- |
| Default model | `onnx-community/Qwen3-0.6B-ONNX` |
| Qwen3 revision | `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0` |
| Qwen3 quantization | `q4f16` |
| Qwen3 download size | 578,918,290 bytes across five files |
| Optional model | `onnx-community/Qwen2.5-0.5B-Instruct-ONNX` |
| Qwen2.5 revision | `aaabb83c90b732de9a0b4408002d099d92969cd1` |
| Qwen2.5 quantization | `q4f16` |
| Qwen2.5 download size | 494,494,428 bytes across nine files |
| Model selection | Local `settings` row `localAiModel`; Qwen3 remains the default |
| Weight transfer | Resumable 16 MiB HTTP range requests |
| Inference | WebGPU when `shader-f16` is available; otherwise ONNX Runtime Web WASM |
| WASM threads | One by default; at most two in a cross-origin-isolated context |
| Generation | Thinking disabled, deterministic decoding, output capped at 192 tokens |
| Context | Up to 1,800 characters of recent conversation, plus preset instructions |

Model download can be stopped and resumed from completed chunks. Each file and
chunk is size-checked before it is cached. A stalled download is aborted after
60 seconds without progress. Removal only targets this model's cache entries.
Stopping generation terminates the busy worker to guarantee cancellation; the
partial response is preserved and the cached model can be loaded again.

## Source modules

- `src/data/local-ai.ts` holds the pinned configuration, prompt construction,
  separate model caches, context/output bounds, and progress helpers.
- `src/data/local-ai-client.ts` defines the typed worker client and streamed
  lifecycle/generation API.
- `src/workers/local-ai.worker.ts` implements explicit download, Cache API
  integration, local-only model loading, WebGPU/WASM selection, inference,
  interruption, unload, and model removal.
- `src/pages/AssistantPage.tsx` provides model controls, explicit confirmations,
  presets, local streaming chat, and existing conversation/attachment display.
- `src/pages/SettingsPage.tsx` describes local-only processing and links to the
  Assistant and stores the selected local model. Existing cloud-related
  settings are not read or deleted.

## Recovery evidence and implementation assumptions

The surviving production bundles identified the model ID, pinned revision,
`q4f16` dtype, local-only inference setup, optional WebGPU with WASM fallback,
disabled Qwen thinking mode, the existing assistant/preset UI, and a
Cache-Storage-based model download. Those bundles were treated as behavioral
evidence, not as source code.

The resumable chunk manifest, strict range/size checks, typed worker protocol,
and maintainable TypeScript module boundaries are the reconstructed
implementation. These details were not recovered as original source.

## Verification status

Automated tests cover model configuration, chunk-boundary calculation, prompt
limits, progress formatting, worker-client lifecycle/error handling, explicit
download confirmation, local generation routing, and preservation/display of
existing chat and attachment records. The optional Qwen2.5 model is pinned to
its own cache and includes the tokenizer assets needed for local-only loading.
SmolLM2-360M-Instruct was excluded from download consideration because its
upstream model card says it primarily understands and generates English.

On 2026-10-26, Chrome 155 verified PWA worker installation, activation, and
control under the `/kxnoverse-pwa/` base path. With network access disabled, a
full page reload loaded through the service worker, the cached model loaded,
and local inference returned `2 + 2 = 4`; no external requests were observed.
The test reused the existing isolated-profile model cache and did not download
the weights again. This verifies the Windows browser environment, not the
target Chromebook.

Useful local commands:

```sh
npm run typecheck
npm test
npm run build
```
