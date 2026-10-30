import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUp, Copy, FileText, PanelLeftClose, PanelLeftOpen, Paperclip, MessageSquarePlus, Pencil, Plus, Settings2, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { TurnstileChallenge } from "../components/TurnstileChallenge";
import { createId, db, type AiAttachment, type AiMessage, type AiPreset, type AiConversation } from "../data/db";
import { readBlobAsArrayBuffer } from "../data/blob-utils";
import {
  assistantAttachmentToBase64,
  assistantClient,
  AssistantBackendUnavailableError,
  AssistantServiceError,
  validateAssistantAttachmentContent,
  validateAssistantAttachments,
  type AssistantAttachmentInput,
  type AssistantAttachmentMimeType,
  SUPPORTED_ASSISTANT_MIME_TYPES,
} from "../data/ai-client";

const starters: AiPreset[] = [
  { id: "study-assistant", name: "Study Assistant", assistantName: "Kxno", description: "Homework explanations", style: "Clear and educational", length: "medium", depth: "guided", language: "auto", instructions: "", model: "openrouter/free", isDefault: true },
  { id: "quick-answers", name: "Quick Answers", assistantName: "Quick", description: "Concise answers", style: "Direct", length: "short", depth: "basic", language: "auto", instructions: "", model: "openrouter/free", isDefault: false },
  { id: "tutor", name: "Tutor", assistantName: "Tutor", description: "Step by step understanding", style: "Step by step", length: "detailed", depth: "advanced", language: "auto", instructions: "", model: "openrouter/free", isDefault: false },
  { id: "kxno-school-helper", name: "Kxno's School Helper", assistantName: "Kxno", description: "Short, clear school help", style: "Casual and clear", length: "short", depth: "basic", language: "auto", instructions: "Keep every answer short, direct, and accurate. Reply in the language the user uses. For school questions, explain things in a relaxed, natural way like a classmate around grades 9–11. Use everyday wording, not formal AI-sounding phrases. Skip long introductions, repeated summaries, and unnecessary dash-heavy lists. Give only the useful explanation and answer. Ask one brief question if key information is missing. Never make up facts.", model: "openrouter/free", isDefault: false },
  { id: "kxno-personal-helper", name: "Kxno's Personal Helper", assistantName: "Kxno", description: "Casual everyday help", style: "Warm and informal", length: "short", depth: "basic", language: "auto", instructions: "Keep replies very short, accurate, and natural. Reply in the language the user uses, with relaxed everyday wording and no stiff AI-style introductions or repetitive summaries. Focus on non-school topics like everyday questions, ideas, planning, and hobbies. Be friendly and a little kawaii; use an emoji or :3 occasionally when it fits, but don't force them into every reply. Give only the useful answer and ask briefly if something important is unclear. Never make up facts.", model: "openrouter/free", isDefault: false },
];

type AttachmentView = Pick<AiAttachment, "name" | "mimeType" | "size" | "blob">;

function renderError(cause: unknown, t: (key: string) => string): string {
  if (cause instanceof AssistantBackendUnavailableError) return t("assistant.backendUnavailable");
  if (cause instanceof AssistantServiceError) return t(`assistant.serviceErrors.${cause.code}`);
  if (cause instanceof DOMException && cause.name === "AbortError") return t("assistant.generationStopped");
  return t("assistant.serviceErrors.requestFailed");
}

function AttachmentTile({ attachment, onPreview, onRemove }: {
  attachment: AttachmentView;
  onPreview: (attachment: AttachmentView) => void;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState("");
  const isImage = attachment.mimeType.startsWith("image/");
  useEffect(() => {
    if (!isImage) return;
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob, isImage]);

  return (
    <div className={`assistant-attachment${isImage ? " assistant-attachment--image" : ""}`}>
      {isImage && url ? (
        <button aria-label={`Preview ${attachment.name}`} className="assistant-attachment__thumbnail" onClick={() => onPreview(attachment)} type="button">
          <img alt={attachment.name} src={url} />
        </button>
      ) : (
        <button className="assistant-attachment__document" onClick={() => onPreview(attachment)} type="button">
          <FileText size={15} />
          <span><strong>{attachment.name}</strong></span>
        </button>
      )}
      {onRemove && <button aria-label={`Remove ${attachment.name}`} className="assistant-attachment__remove" onClick={onRemove} type="button"><X size={12} /></button>}
      {isImage && <span className="assistant-attachment__name">{attachment.name}</span>}
    </div>
  );
}

export function AssistantPage() {
  const { t, i18n } = useTranslation();
  const savedPresets = useLiveQuery(() => db.aiPresets.toArray(), []);
  const presets = savedPresets ?? [];
  const conversations = useLiveQuery(() => db.aiConversations.orderBy("updatedAt").reverse().toArray(), [], []);
  const endpoint = useLiveQuery(() => db.settings.get("aiBackendUrl"), [], undefined)?.value.trim() ?? "";
  const cloudSetting = useLiveQuery(() => db.settings.get("aiCloudEnabled"), [], undefined);
  const cloudEnabled = cloudSetting?.value === "true";
  const cloudConsentSetting = useLiveQuery(() => db.settings.get("aiCloudConsentEndpoint"), [], undefined);
  const cloudConsent = Boolean(endpoint && cloudConsentSetting?.value === endpoint);
  const turnstileSiteKey = useLiveQuery(() => db.settings.get("turnstileSiteKey"), [], undefined)?.value.trim() ?? "";
  const [activeConversationId, setActiveConversationId] = useState("");
  const activeConversation = conversations.find((item) => item.id === activeConversationId) ?? conversations[0];
  const messages = useLiveQuery(
    () => activeConversation ? db.aiMessages.where("conversationId").equals(activeConversation.id).sortBy("createdAt") : Promise.resolve([] as AiMessage[]),
    [activeConversation?.id],
    [] as AiMessage[],
  );
  const messageIdsKey = messages.map((message) => message.id).join("|");
  const messageIds = useMemo(() => messageIdsKey ? messageIdsKey.split("|") : [], [messageIdsKey]);
  const savedAttachments = useLiveQuery(
    () => messageIds.length ? db.aiAttachments.where("messageId").anyOf(messageIds).toArray() : Promise.resolve([] as AiAttachment[]),
    [messageIdsKey],
    [] as AiAttachment[],
  ) ?? [];
  const draftFilesInput = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState<Array<{ file: File; mimeType: AssistantAttachmentMimeType }>>([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [presetDraft, setPresetDraft] = useState<AiPreset>();
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentView>();
  const [copyStatus, setCopyStatus] = useState("");
  const [turnstileVersion, setTurnstileVersion] = useState(0);
  const [remainingRequests, setRemainingRequests] = useState<number>();
  const pendingTurnstileToken = useRef<{ resolve: (token: string) => void; reject: (error: Error) => void } | undefined>(undefined);
  const usageRequestId = useRef(0);

  const refreshRemaining = useCallback(async () => {
    const requestId = ++usageRequestId.current;
    if (!endpoint || !cloudEnabled) {
      setRemainingRequests(undefined);
      return;
    }
    try {
      const usage = await assistantClient.getUsage(endpoint);
      if (requestId !== usageRequestId.current) return;
      setRemainingRequests(usage.remaining);
    } catch {
      if (requestId !== usageRequestId.current) return;
      setRemainingRequests(undefined);
    }
  }, [cloudEnabled, endpoint]);

  useEffect(() => {
    void refreshRemaining();
    return () => {
      usageRequestId.current += 1;
    };
  }, [refreshRemaining]);

  useEffect(() => () => {
    const pending = pendingTurnstileToken.current;
    pendingTurnstileToken.current = undefined;
    pending?.reject(new DOMException("Turnstile request cancelled.", "AbortError"));
  }, []);

  useEffect(() => {
    if (savedPresets === undefined) return;
    void db.transaction("rw", db.aiPresets, async () => {
      for (const preset of starters) {
        if (!(await db.aiPresets.get(preset.id))) await db.aiPresets.add(preset);
      }
    }).catch(() => setError("saveError"));
  }, [savedPresets]);

  useEffect(() => {
    if (savedPresets === undefined || !savedPresets.some((preset) => preset.model !== "openrouter/free")) return;
    void db.aiPresets.toCollection().modify({ model: "openrouter/free" }).catch(() => setError("saveError"));
  }, [savedPresets]);

  useEffect(() => {
    if (activeConversationId || !conversations.length) return;
    setActiveConversationId(conversations[0].id);
  }, [activeConversationId, conversations]);

  const activePreset = useMemo(
    () => presets.find((item) => item.id === activeConversation?.presetId) ?? presets.find((item) => item.isDefault) ?? presets[0],
    [activeConversation?.presetId, presets],
  );

  const canSend = Boolean(activePreset && (draft.trim() || draftFiles.length)) && !isSending &&
    !(endpoint && (!cloudEnabled || !cloudConsent || !turnstileSiteKey || remainingRequests === 0));

  function requestTurnstileToken(): Promise<string> {
    if (pendingTurnstileToken.current) return Promise.reject(new Error("A Turnstile request is already in progress."));
    return new Promise((resolve, reject) => {
      pendingTurnstileToken.current = { resolve, reject };
      setTurnstileVersion((version) => version + 1);
    });
  }

  function receiveTurnstileToken(token: string) {
    const pending = pendingTurnstileToken.current;
    if (!pending || !token) return;
    pendingTurnstileToken.current = undefined;
    pending.resolve(token);
  }

  function rejectTurnstileToken() {
    const pending = pendingTurnstileToken.current;
    if (!pending) return;
    pendingTurnstileToken.current = undefined;
    pending.reject(new AssistantServiceError("challengeUnavailable"));
  }

  async function createConversation(presetId = activePreset?.id ?? "study-assistant") {
    const id = createId();
    try {
      await db.aiConversations.add({ id, title: t("assistant.newConversation"), updatedAt: Date.now(), presetId });
      setActiveConversationId(id);
      setError("");
    } catch {
      setError("saveError");
    }
  }

  function addAttachments(files: File[]) {
    if (!files.length) return;
    const added = files.map((file) => {
      const mimeType = SUPPORTED_ASSISTANT_MIME_TYPES.find((supported) => supported === file.type);
      return mimeType ? { file, mimeType } : undefined;
    });
    if (added.some((attachment) => !attachment)) {
      setError("serviceErrors.invalidAttachment");
      return;
    }
    const next = [...draftFiles, ...added.filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== undefined)];
    const issue = validateAssistantAttachments(next.map(({ file }) => file));
    if (issue) {
      setError(`serviceErrors.${issue}`);
      return;
    }
    setDraftFiles(next);
    setError("");
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    addAttachments(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length) {
      event.preventDefault();
      addAttachments(files);
    }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    addAttachments(Array.from(event.dataTransfer.files));
  }

  async function saveAssistantError(conversationId: string, content: string, assistantId = createId()) {
    await db.aiMessages.put({
      id: assistantId,
      conversationId,
      role: "assistant",
      content,
      createdAt: Date.now(),
      error: true,
    });
  }

  async function requestAssistantReply(
    conversation: AiConversation,
    userMessage: AiMessage,
    contextMessages: AiMessage[],
  ) {
    const assistantMessageId = createId();
    if (!endpoint) {
      await saveAssistantError(conversation.id, t("assistant.backendUnavailable"), assistantMessageId);
      return;
    }
    if (!cloudEnabled) {
      await saveAssistantError(conversation.id, t("assistant.cloudDisabled"), assistantMessageId);
      return;
    }
    setIsSending(true);
    setStreamingMessageId(assistantMessageId);
    setStreamingText("");
    setUploadProgress(undefined);
    setError("");
    try {
      await db.aiMessages.add({
        id: assistantMessageId,
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      });
    } catch {
      setError("saveError");
      setIsSending(false);
      setStreamingMessageId("");
      return;
    }
    const controller = new AbortController();
    abortController.current = controller;
    let answer = "";
    let saveTimer = 0;
    try {
      const verificationToken = await requestTurnstileToken();
      const attachments = await db.aiAttachments.where("messageId").equals(userMessage.id).toArray();
      const requestAttachments: AssistantAttachmentInput[] = [];
      setPreparingAttachments(attachments.length > 0);
      for (const attachment of attachments) {
        if (!await validateAssistantAttachmentContent(attachment.blob, attachment.mimeType)) {
          throw new AssistantServiceError("invalidAttachment");
        }
        requestAttachments.push({
          name: attachment.name,
          mimeType: attachment.mimeType,
          size: attachment.size,
          data: await assistantAttachmentToBase64(attachment.blob),
        });
      }
      setPreparingAttachments(false);
      const history = contextMessages
        .filter((message) => message.id !== userMessage.id && !message.error && message.content.trim())
        .slice(-24)
        .map((message) => ({ role: message.role === "assistant" ? "model" as const : "user" as const, content: message.content }));
      await assistantClient.send({
        endpoint,
        turnstileToken: verificationToken,
        message: userMessage.content,
        model: "openrouter/free",
        preset: activePreset ?? starters[0],
        history,
        attachments: requestAttachments,
      }, {
        signal: controller.signal,
        onToken: (token) => {
          answer += token;
          setStreamingText(answer);
          if (!saveTimer) {
            saveTimer = window.setTimeout(() => {
              saveTimer = 0;
              void db.aiMessages.update(assistantMessageId, { content: answer }).catch(() => setError("saveError"));
            }, 250);
          }
        },
        onProgress: setUploadProgress,
      });
      await db.aiMessages.update(assistantMessageId, { content: answer, error: false });
      await db.aiConversations.update(conversation.id, { updatedAt: Date.now() });
    } catch (cause) {
      const cancelled = cause instanceof DOMException && cause.name === "AbortError";
      answer = answer || renderError(cause, t);
      await db.aiMessages.update(assistantMessageId, { content: answer, error: !cancelled });
    } finally {
      if (saveTimer) window.clearTimeout(saveTimer);
      abortController.current = undefined;
      setIsSending(false);
      setUploadProgress(undefined);
      setPreparingAttachments(false);
      setStreamingText("");
      setStreamingMessageId("");
      void refreshRemaining();
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !activePreset) return;
    const content = draft.trim() || t("assistant.attachmentsPrompt");
    if (endpoint && cloudEnabled && !cloudConsent) {
      setError("consentRequired");
      return;
    }
    const conversation = activeConversation ?? {
      id: createId(),
      title: content.slice(0, 48),
      updatedAt: Date.now(),
      presetId: activePreset.id,
    };
    const userMessage: AiMessage = {
      id: createId(),
      conversationId: conversation.id,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    try {
      const records: AiAttachment[] = await Promise.all(draftFiles.map(async ({ file, mimeType }) => ({
          id: createId(),
          messageId: userMessage.id,
          name: file.name,
          mimeType,
          size: file.size,
          blob: new Blob([await readBlobAsArrayBuffer(file)], { type: file.type }),
          createdAt: Date.now(),
        })));
      await db.transaction("rw", [db.aiMessages, db.aiConversations, db.aiAttachments], async () => {
        if (!activeConversation) await db.aiConversations.add(conversation);
        await db.aiMessages.add(userMessage);
        if (records.length) await db.aiAttachments.bulkAdd(records);
        await db.aiConversations.update(conversation.id, {
          title: conversation.title === t("assistant.newConversation") ? content.slice(0, 48) : conversation.title,
          updatedAt: Date.now(),
        });
      });
    } catch {
      setError("saveError");
      return;
    }
    setActiveConversationId(conversation.id);
    setDraft("");
    setDraftFiles([]);
    await requestAssistantReply(conversation, userMessage, [...messages, userMessage]);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function retryMessage(assistantMessage: AiMessage) {
    if (isSending || !endpoint || !cloudEnabled || !cloudConsent || !turnstileSiteKey || remainingRequests === 0) return;
    const priorMessages = await db.aiMessages.where("conversationId").equals(assistantMessage.conversationId).sortBy("createdAt");
    const currentIndex = priorMessages.findIndex((item) => item.id === assistantMessage.id);
    const userMessage = priorMessages.slice(0, currentIndex).reverse().find((item) => item.role === "user");
    const conversation = conversations.find((item) => item.id === assistantMessage.conversationId);
    if (currentIndex < 0 || !userMessage || !conversation) return;
    await requestAssistantReply(conversation, userMessage, priorMessages.slice(0, currentIndex));
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus(""), 1500);
    } catch {
      setCopyStatus("copyFailed");
    }
  }

  async function renameConversation(conversation: AiConversation) {
    const title = window.prompt(t("assistant.renamePrompt"), conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    try {
      await db.aiConversations.update(conversation.id, { title: title.slice(0, 100), updatedAt: Date.now() });
    } catch {
      setError("saveError");
    }
  }

  async function deleteConversation(conversation: AiConversation) {
    if (!window.confirm(t("assistant.confirmDeleteConversation", { title: conversation.title }))) return;
    try {
      await db.transaction("rw", [db.aiConversations, db.aiMessages, db.aiAttachments], async () => {
        const ids = await db.aiMessages.where("conversationId").equals(conversation.id).primaryKeys();
        await db.aiAttachments.where("messageId").anyOf(ids as string[]).delete();
        await db.aiMessages.where("conversationId").equals(conversation.id).delete();
        await db.aiConversations.delete(conversation.id);
      });
      if (activeConversationId === conversation.id) setActiveConversationId("");
    } catch {
      setError("saveError");
    }
  }

  async function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!presetDraft) return;
    try {
      await db.transaction("rw", db.aiPresets, async () => {
        if (presetDraft.isDefault) await db.aiPresets.toCollection().modify({ isDefault: false });
        await db.aiPresets.put({ ...presetDraft, name: presetDraft.name.trim(), assistantName: presetDraft.assistantName.trim(), model: "openrouter/free" });
      });
      setPresetModalOpen(false);
      setPresetDraft(undefined);
    } catch {
      setError("saveError");
    }
  }

  async function duplicatePreset(preset: AiPreset) {
    const duplicate = { ...preset, id: createId(), name: `${preset.name} ${t("timetable.copySuffix")}`, isDefault: false };
    await db.aiPresets.add(duplicate);
    setPresetDraft(duplicate);
    setPresetModalOpen(true);
  }

  async function deletePreset(preset: AiPreset) {
    if (presets.length <= 1) return;
    try {
      await db.transaction("rw", db.aiPresets, db.aiConversations, async () => {
        await db.aiConversations.where("presetId").equals(preset.id).modify({ presetId: presets.find((item) => item.id !== preset.id)?.id ?? "" });
        await db.aiPresets.delete(preset.id);
        if (preset.isDefault) {
          const next = await db.aiPresets.toCollection().first();
          if (next) await db.aiPresets.update(next.id, { isDefault: true });
        }
      });
    } catch {
      setError("saveError");
    }
  }

  async function selectPreset(id: string) {
    try {
      if (activeConversation) await db.aiConversations.update(activeConversation.id, { presetId: id });
      else await createConversation(id);
    } catch {
      setError("saveError");
    }
  }

  return (
    <section className="assistant-page">
      <header className="assistant-heading">
        <div><h1>{t("assistant.title")}</h1><p>{t("assistant.subtitle")}</p></div>
        <button
          aria-controls="assistant-history"
          aria-expanded={!isHistoryCollapsed}
          aria-label={t(isHistoryCollapsed ? "assistant.expandHistory" : "assistant.collapseHistory")}
          className="button button--quiet assistant-history-toggle"
          onClick={() => setIsHistoryCollapsed((collapsed) => !collapsed)}
          title={t(isHistoryCollapsed ? "assistant.expandHistory" : "assistant.collapseHistory")}
          type="button"
        >
          {isHistoryCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          <span>{t(isHistoryCollapsed ? "assistant.expandHistory" : "assistant.collapseHistory")}</span>
        </button>
      </header>
      <div className={`assistant-workspace${isHistoryCollapsed ? " assistant-workspace--history-collapsed" : ""}`}>
        <aside aria-label={t("assistant.history")} className="assistant-history" hidden={isHistoryCollapsed} id="assistant-history">
          <div className="assistant-history__heading">
            <span>{t("assistant.history")}</span>
            <button className="icon-button icon-button--small" aria-label={t("assistant.newConversation")} onClick={() => void createConversation()} type="button"><MessageSquarePlus size={14} /></button>
          </div>
          {conversations.map((conversation) => (
            <div className={`assistant-history__row${activeConversation?.id === conversation.id ? " is-active" : ""}`} key={conversation.id}>
              <button className="assistant-history__item" onClick={() => setActiveConversationId(conversation.id)} type="button">
                <span>{conversation.title}</span>
                <span>{new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(conversation.updatedAt)}</span>
              </button>
              <button aria-label={`${t("assistant.rename")} ${conversation.title}`} className="icon-button icon-button--small assistant-history__action" onClick={() => void renameConversation(conversation)} type="button"><Pencil size={12} /></button>
              <button aria-label={`${t("assistant.delete")} ${conversation.title}`} className="icon-button icon-button--small assistant-history__action" onClick={() => void deleteConversation(conversation)} type="button"><Trash2 size={12} /></button>
            </div>
          ))}
        </aside>
        <div className="assistant-thread">
          <div className="assistant-thread__toolbar">
            <label><span>{t("assistant.preset")}</span>
              <select aria-label={t("assistant.preset")} value={activePreset?.id ?? ""} onChange={(event) => void selectPreset(event.target.value)}>
                {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            <button className="button button--quiet assistant-preset-manage" onClick={() => setPresetModalOpen(true)} type="button"><Settings2 size={13} />{t("assistant.presets")}</button>
          </div>
          {endpoint && cloudEnabled && turnstileSiteKey && (
            <div className="assistant-thread__verification">
              <TurnstileChallenge
                action="chat"
                onError={rejectTurnstileToken}
                onToken={receiveTurnstileToken}
                requestId={turnstileVersion}
                siteKey={turnstileSiteKey}
              />
            </div>
          )}
          {!endpoint && <p className="assistant-cloud-notice">{t("assistant.backendUnavailable")}</p>}
          <div className="assistant-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="assistant-empty">
                <MessageSquarePlus size={19} strokeWidth={1.5} />
                <h2>{t("assistant.emptyTitle")}</h2>
                <p>{t("assistant.emptyDescription")}</p>
              </div>
            )}
            {messages.map((message) => {
              const attachments = savedAttachments.filter((attachment) => attachment.messageId === message.id);
              const content = message.id === streamingMessageId ? streamingText : message.content;
              return (
                <article className={`assistant-message assistant-message--${message.role}${message.error ? " assistant-message--error" : ""}`} key={message.id}>
                  <div className="assistant-message__heading">
                    <span>{message.role === "assistant" ? activePreset?.assistantName ?? "AI" : t("assistant.you")}</span>
                    {message.role === "assistant" && !message.error && content && (
                      <button aria-label={t("assistant.copy")} className="icon-button icon-button--small" onClick={() => void copyMessage(content)} type="button"><Copy size={12} /></button>
                    )}
                    {message.role === "assistant" && message.error && (
                      <button className="button button--quiet assistant-message__retry" disabled={isSending || !endpoint || !cloudEnabled || !cloudConsent || !turnstileSiteKey} onClick={() => void retryMessage(message)} type="button">{t("assistant.retry")}</button>
                    )}
                  </div>
                  {attachments.length > 0 && <div className="assistant-attachment-list">{attachments.map((attachment) => (
                    <AttachmentTile attachment={attachment} key={attachment.id} onPreview={setPreviewAttachment} />
                  ))}</div>}
                  {content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown> : message.id === streamingMessageId ? <span className="assistant-stream-indicator">{t("assistant.working")}</span> : null}
                </article>
              );
            })}
          </div>
          <form
            className="assistant-composer"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            onSubmit={(event) => void submitMessage(event)}
          >
            {draftFiles.length > 0 && <div className="assistant-attachment-list assistant-attachment-list--draft">
              {draftFiles.map(({ file, mimeType }, index) => <AttachmentTile
                attachment={{ name: file.name, mimeType, size: file.size, blob: file }}
                key={`${file.name}-${file.lastModified}-${index}`}
                onPreview={setPreviewAttachment}
                onRemove={() => setDraftFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              />)}
            </div>}
            <textarea
              aria-label={t("assistant.composer")}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={onPaste}
              placeholder={t("assistant.composerPlaceholder")}
              rows={1}
              value={draft}
            />
            <input accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" aria-label={t("assistant.attachFiles")} className="visually-hidden" hidden multiple onChange={onFileChange} ref={draftFilesInput} type="file" />
            <div className="assistant-composer__footer">
              <button aria-label={t("assistant.attachFiles")} className="icon-button assistant-composer__attach" onClick={() => draftFilesInput.current?.click()} type="button"><Paperclip size={17} /></button>
              <span aria-live="polite" className="assistant-composer__status">
                {copyStatus ? t(`assistant.${copyStatus}`) : isSending ? preparingAttachments ? t("assistant.preparingAttachments") : uploadProgress === undefined ? t("assistant.working") : t("assistant.uploading", { progress: uploadProgress }) : ""}
              </span>
              {endpoint && cloudEnabled && (
                <span aria-label={t("assistant.requestsRemaining", { count: remainingRequests ?? "—" })} className="assistant-request-count" title={t("assistant.requestsRemaining", { count: remainingRequests ?? "—" })}>
                  {remainingRequests ?? "—"}
                </span>
              )}
              {isSending
                ? <button aria-label={t("assistant.stop")} className="button button--quiet" onClick={() => abortController.current?.abort()} type="button"><Square size={13} />{t("assistant.stop")}</button>
                : <button aria-label={t("assistant.send")} className="button button--primary assistant-composer__send" disabled={!canSend} type="submit"><ArrowUp size={17} /></button>}
            </div>
          </form>
          {error && <p className="form-error" role="alert">{t(`assistant.${error}`)}</p>}
        </div>
      </div>

      {presetModalOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPresetModalOpen(false)}>
          <section className="preset-dialog" aria-label={t("assistant.managePresets")}>
            <div className="dialog-heading"><h2>{t("assistant.managePresets")}</h2><button className="icon-button" aria-label={t("assistant.close")} onClick={() => setPresetModalOpen(false)} type="button"><X size={15} /></button></div>
            <div className="preset-manager">
              <div className="preset-manager__list">
                <button className="button button--quiet" onClick={() => { setPresetDraft({ id: createId(), name: "", assistantName: "", description: "", style: "", length: "medium", depth: "guided", language: "auto", instructions: "", model: "openrouter/free", isDefault: false }); }} type="button"><Plus size={13} />{t("assistant.createPreset")}</button>
                {presets.map((preset) => <div className="preset-manager__item" key={preset.id}>
                  <button onClick={() => setPresetDraft(preset)} type="button">{preset.name}{preset.isDefault && <small>{t("assistant.defaultPreset")}</small>}</button>
                  <button className="icon-button icon-button--small" aria-label={`${t("timetable.duplicate")} ${preset.name}`} onClick={() => void duplicatePreset(preset)} type="button"><Copy size={13} /></button>
                  <button className="icon-button icon-button--small" aria-label={`${t("timetable.delete")} ${preset.name}`} disabled={presets.length <= 1} onClick={() => void deletePreset(preset)} type="button"><Trash2 size={13} /></button>
                </div>)}
              </div>
              {presetDraft && <form className="preset-form" onSubmit={(event) => void savePreset(event)}>
                <label>{t("assistant.presetName")}<input required maxLength={40} value={presetDraft.name} onChange={(event) => setPresetDraft({ ...presetDraft, name: event.target.value })} /></label>
                <label>{t("assistant.assistantName")}<input required maxLength={40} value={presetDraft.assistantName} onChange={(event) => setPresetDraft({ ...presetDraft, assistantName: event.target.value })} /></label>
                <label>{t("assistant.description")}<input maxLength={90} value={presetDraft.description} onChange={(event) => setPresetDraft({ ...presetDraft, description: event.target.value })} /></label>
                <label>{t("assistant.style")}<input maxLength={60} value={presetDraft.style} onChange={(event) => setPresetDraft({ ...presetDraft, style: event.target.value })} /></label>
                <label>{t("assistant.length")}<select value={presetDraft.length} onChange={(event) => setPresetDraft({ ...presetDraft, length: event.target.value as AiPreset["length"] })}><option value="short">{t("assistant.short")}</option><option value="medium">{t("assistant.medium")}</option><option value="detailed">{t("assistant.detailed")}</option></select></label>
                <label>{t("assistant.depth")}<select value={presetDraft.depth} onChange={(event) => setPresetDraft({ ...presetDraft, depth: event.target.value as AiPreset["depth"] })}><option value="basic">{t("assistant.basic")}</option><option value="guided">{t("assistant.guided")}</option><option value="advanced">{t("assistant.advanced")}</option></select></label>
                <label>{t("assistant.language")}<select value={presetDraft.language} onChange={(event) => setPresetDraft({ ...presetDraft, language: event.target.value as AiPreset["language"] })}><option value="auto">{t("assistant.auto")}</option><option value="en">English</option><option value="de">Deutsch</option></select></label>
                <label className="preset-form__wide">{t("assistant.instructions")}<textarea maxLength={2000} rows={4} value={presetDraft.instructions} onChange={(event) => setPresetDraft({ ...presetDraft, instructions: event.target.value })} /></label>
                <label className="preset-form__wide preset-default"><input checked={presetDraft.isDefault} onChange={(event) => setPresetDraft({ ...presetDraft, isDefault: event.target.checked })} type="checkbox" />{t("assistant.useAsDefault")}</label>
                <button className="button button--primary preset-form__wide" type="submit">{t("timetable.save")}</button>
              </form>}
            </div>
          </section>
        </div>
      )}
      {previewAttachment && (
        <div className="dialog-backdrop assistant-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPreviewAttachment(undefined)}>
          <section aria-label={t("assistant.previewAttachment", { name: previewAttachment.name })} className="assistant-preview-dialog">
            <div className="dialog-heading"><h2>{previewAttachment.name}</h2><button className="icon-button" aria-label={t("assistant.close")} onClick={() => setPreviewAttachment(undefined)} type="button"><X size={15} /></button></div>
            {previewAttachment.mimeType.startsWith("image/")
              ? <PreviewImage attachment={previewAttachment} />
              : <PreviewPdf attachment={previewAttachment} />}
          </section>
        </div>
      )}
    </section>
  );
}

function PreviewImage({ attachment }: { attachment: AttachmentView }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);
  return url ? <img alt={attachment.name} className="assistant-preview-image" src={url} /> : null;
}

function PreviewPdf({ attachment }: { attachment: AttachmentView }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);
  return url ? <iframe className="assistant-preview-pdf" title={attachment.name} src={url} /> : null;
}
