import { readBlobAsArrayBuffer } from "./blob-utils";

export const MAX_ASSISTANT_ATTACHMENTS = 5;
export const MAX_ASSISTANT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_ASSISTANT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type AssistantAttachmentMimeType = (typeof SUPPORTED_ASSISTANT_MIME_TYPES)[number];

export interface AssistantAttachmentInput {
  name: string;
  mimeType: AssistantAttachmentMimeType;
  size: number;
  data: string;
}

export interface AssistantRequest {
  endpoint?: string;
  turnstileToken: string;
  message: string;
  model: string;
  preset: {
    assistantName: string;
    style: string;
    length: string;
    depth: string;
    language: string;
    instructions: string;
  };
  history: Array<{ role: "user" | "model"; content: string }>;
  attachments: AssistantAttachmentInput[];
}

export interface AssistantUsage {
  remaining: number;
  limit: number;
}

export type AssistantServiceErrorCode =
  | "accessRequired"
  | "rateLimited"
  | "serviceUnavailable"
  | "modelNotAllowed"
  | "invalidAttachment"
  | "attachmentTooLarge"
  | "providerUnavailable"
  | "timeout"
  | "networkFailure"
  | "challengeRequired"
  | "challengeUnavailable"
  | "requestFailed";

export class AssistantServiceError extends Error {
  constructor(readonly code: AssistantServiceErrorCode) {
    super(code);
    this.name = "AssistantServiceError";
  }
}

export class AssistantBackendUnavailableError extends Error {
  constructor() {
    super("The secure AI backend has not been configured.");
    this.name = "AssistantBackendUnavailableError";
  }
}

export interface AssistantClient {
  getUsage(endpoint: string | undefined): Promise<AssistantUsage>;
  send(
    request: AssistantRequest,
    options: {
      signal: AbortSignal;
      onToken: (token: string) => void;
      onProgress: (percent: number) => void;
    },
  ): Promise<void>;
  testConnection(endpoint: string | undefined, turnstileToken: string): Promise<void>;
}

export function validateAssistantAttachments(files: File[]): AssistantServiceErrorCode | undefined {
  if (files.length > MAX_ASSISTANT_ATTACHMENTS) return "invalidAttachment";
  let totalSize = 0;
  for (const file of files) {
    if (!(SUPPORTED_ASSISTANT_MIME_TYPES as readonly string[]).includes(file.type)) return "invalidAttachment";
    if (file.size <= 0 || file.size > MAX_ASSISTANT_ATTACHMENT_BYTES) return "attachmentTooLarge";
    totalSize += file.size;
  }
  if (totalSize > MAX_ASSISTANT_TOTAL_ATTACHMENT_BYTES) return "attachmentTooLarge";
  return undefined;
}

export async function validateAssistantAttachmentContent(file: Blob, mimeType: AssistantAttachmentMimeType): Promise<boolean> {
  const header = new Uint8Array(await readBlobAsArrayBuffer(file.slice(0, 12)));
  if (mimeType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  if (mimeType === "image/jpeg") return header[0] === 255 && header[1] === 216 && header[2] === 255;
  if (mimeType === "image/webp") return String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  return String.fromCharCode(...header.slice(0, 5)) === "%PDF-";
}

export async function assistantAttachmentToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await readBlobAsArrayBuffer(blob));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function endpointUrl(value: string | undefined, path: string): URL {
  if (!value) throw new AssistantBackendUnavailableError();
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new AssistantServiceError("requestFailed");
  }
  const isLocalHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if ((endpoint.protocol !== "https:" && !isLocalHttp) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new AssistantServiceError("requestFailed");
  }
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}${path}`;
  return endpoint;
}

function errorFromStatus(status: number, body: string): AssistantServiceError {
  let code = "";
  try {
    code = (JSON.parse(body) as { error?: string }).error ?? "";
  } catch {
    code = "";
  }
  if (code === "challenge_required") return new AssistantServiceError("challengeRequired");
  if (code === "challenge_unavailable" || code === "challenge_not_configured") return new AssistantServiceError("challengeUnavailable");
  if (status === 401 || status === 403) return new AssistantServiceError("accessRequired");
  if (status === 429) return new AssistantServiceError("rateLimited");
  if (status === 413 || code === "request_too_large") return new AssistantServiceError("attachmentTooLarge");
  if (code === "model_not_allowed") return new AssistantServiceError("modelNotAllowed");
  if (code === "unsupported_attachment_provider") return new AssistantServiceError("invalidAttachment");
  if (code === "provider_unavailable" || code === "provider_not_configured") return new AssistantServiceError("providerUnavailable");
  if (status === 503) return new AssistantServiceError("serviceUnavailable");
  return new AssistantServiceError("requestFailed");
}

interface ServerEvent {
  event: string;
  data: string;
}

function dispatchEvent(segment: string, onEvent: (event: ServerEvent) => void) {
  let event = "message";
  const data: string[] = [];
  for (const line of segment.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length) onEvent({ event, data: data.join("\n") });
}

function parseServerEvent(event: ServerEvent, onToken: (token: string) => void): boolean {
  let payload: { text?: unknown; error?: unknown };
  try {
    payload = JSON.parse(event.data) as { text?: unknown; error?: unknown };
  } catch {
    throw new AssistantServiceError("requestFailed");
  }
  if (event.event === "token" && typeof payload.text === "string") onToken(payload.text);
  if (event.event === "error") {
    if (payload.error === "provider_unavailable") throw new AssistantServiceError("providerUnavailable");
    throw new AssistantServiceError("requestFailed");
  }
  return event.event === "done";
}

function requestWithProgress(
  endpoint: URL,
  body: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  onResponseProgress: (text: string) => void,
  onStreamError: (cause: unknown) => void,
  onResponse: (status: number, responseText: string, contentType: string) => void,
): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", endpoint);
  xhr.withCredentials = false;
  xhr.timeout = 90_000;
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "text/event-stream, application/json");
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
  };
  xhr.onprogress = () => {
    try {
      onResponseProgress(xhr.responseText);
    } catch (cause) {
      xhr.abort();
      onStreamError(cause);
    }
  };
  xhr.onload = () => onResponse(xhr.status, xhr.responseText, xhr.getResponseHeader("Content-Type") ?? "");
  xhr.onerror = () => onResponse(0, "", "");
  xhr.ontimeout = () => onResponse(408, "", "");
  xhr.onabort = () => onResponse(499, "", "");
  const abort = () => xhr.abort();
  signal.addEventListener("abort", abort, { once: true });
  xhr.onloadend = () => signal.removeEventListener("abort", abort);
  xhr.send(body);
  return xhr;
}

export const assistantClient: AssistantClient = {
  async getUsage(value) {
    const endpoint = endpointUrl(value, "/api/usage");
    try {
      const response = await fetch(endpoint, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit" });
      const body = await response.text();
      if (!response.ok) throw errorFromStatus(response.status, body);
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new AssistantServiceError("requestFailed");
      }
      if (typeof payload !== "object" || payload === null || !("remaining" in payload) || !("limit" in payload)) {
        throw new AssistantServiceError("requestFailed");
      }
      const { remaining, limit } = payload;
      if (
        typeof remaining !== "number" || !Number.isInteger(remaining) || remaining < 0 ||
        typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || remaining > limit
      ) {
        throw new AssistantServiceError("requestFailed");
      }
      return { remaining, limit };
    } catch (cause) {
      if (cause instanceof AssistantServiceError || cause instanceof AssistantBackendUnavailableError) throw cause;
      throw new AssistantServiceError("networkFailure");
    }
  },
  send(request, options) {
    const endpoint = endpointUrl(request.endpoint, "/api/chat");
    if (options.signal.aborted) return Promise.reject(new DOMException("Request cancelled.", "AbortError"));
    const body = JSON.stringify({
      turnstileToken: request.turnstileToken,
      message: request.message,
      model: request.model,
      preset: {
        assistantName: request.preset.assistantName,
        style: request.preset.style,
        length: request.preset.length,
        depth: request.preset.depth,
        language: request.preset.language,
        instructions: request.preset.instructions,
      },
      history: request.history,
      attachments: request.attachments,
    });
    return new Promise((resolve, reject) => {
      let readPosition = 0;
      let eventBuffer = "";
      let completed = false;
      let settled = false;
      const consume = (event: ServerEvent) => {
        if (parseServerEvent(event, options.onToken)) completed = true;
      };
      const consumeResponse = (text: string) => {
        eventBuffer += text.slice(readPosition);
        readPosition = text.length;
        const segments = eventBuffer.split(/\r?\n\r?\n/);
        eventBuffer = segments.pop() ?? "";
        for (const segment of segments) dispatchEvent(segment, consume);
      };
      try {
        requestWithProgress(endpoint, body, options.signal, options.onProgress, consumeResponse, (cause) => {
          if (settled) return;
          settled = true;
          reject(cause instanceof AssistantServiceError ? cause : new AssistantServiceError("requestFailed"));
        }, (status, responseText, contentType) => {
          if (settled) return;
          if (status === 499) {
            settled = true;
            reject(new DOMException("Request cancelled.", "AbortError"));
            return;
          }
          if (status === 408) {
            settled = true;
            reject(new AssistantServiceError("timeout"));
            return;
          }
          if (status === 0) {
            settled = true;
            reject(new AssistantServiceError("networkFailure"));
            return;
          }
          if (status < 200 || status >= 300) {
            settled = true;
            reject(errorFromStatus(status, responseText));
            return;
          }
          if (!contentType.toLowerCase().includes("text/event-stream")) {
            settled = true;
            reject(errorFromStatus(status, responseText));
            return;
          }
          try {
            consumeResponse(responseText);
            if (eventBuffer.trim()) dispatchEvent(eventBuffer, consume);
            if (completed) {
              settled = true;
              resolve();
            } else {
              settled = true;
              reject(new AssistantServiceError("requestFailed"));
            }
          } catch (cause) {
            settled = true;
            reject(cause instanceof AssistantServiceError ? cause : new AssistantServiceError("requestFailed"));
          }
        });
      } catch (cause) {
        reject(cause);
      }
    });
  },
  testConnection(value, turnstileToken) {
    const endpoint = endpointUrl(value, "/api/test");
    return new Promise((resolve, reject) => {
      try {
        requestWithProgress(endpoint, JSON.stringify({ turnstileToken }), new AbortController().signal, () => undefined, () => undefined, () => undefined, (status, body) => {
          if (status >= 200 && status < 300) {
            resolve();
            return;
          }
          if (status === 0) {
            reject(new AssistantServiceError("networkFailure"));
            return;
          }
          reject(errorFromStatus(status, body));
        });
      } catch (cause) {
        reject(cause);
      }
    });
  },
};
