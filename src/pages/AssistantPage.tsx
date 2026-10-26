import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Copy, Cpu, Download, FileText, HardDrive, LoaderCircle, MessageSquarePlus, Pencil, Plus, Send, Settings2, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { createId, db, type AiAttachment, type AiMessage, type AiPreset, type AiConversation } from "../data/db";
import { LocalAiError, localAiClient, type LocalAiStatus } from "../data/local-ai-client";
import {
  buildLocalAiMessages,
  formatLocalAiBytes,
  DEFAULT_LOCAL_AI_MODEL,
  LOCAL_AI_MODEL_SETTING_KEY,
  getLocalAiModel,
  localAiModelSizeLabel,
  localAiProgressPercent,
  maxNewTokensForPreset,
  type LocalAiProgress,
} from "../data/local-ai";

const starters: AiPreset[] = [
  { id: "study-assistant", name: "Study Assistant", assistantName: "Kxno AI", description: "Homework explanations", style: "Clear and educational", length: "medium", depth: "guided", language: "auto", instructions: "", model: "local-qwen3-0.6b-q4f16", isDefault: true },
  { id: "quick-answers", name: "Quick Answers", assistantName: "Quick", description: "Concise answers", style: "Direct", length: "short", depth: "basic", language: "auto", instructions: "", model: "local-qwen3-0.6b-q4f16", isDefault: false },
  { id: "tutor", name: "Tutor", assistantName: "Tutor", description: "Step by step understanding", style: "Step by step", length: "detailed", depth: "advanced", language: "auto", instructions: "", model: "local-qwen3-0.6b-q4f16", isDefault: false },
];

type AttachmentView = Pick<AiAttachment, "name" | "mimeType" | "size" | "blob">;
type ModelOperation = "download" | "load" | "unload" | "remove";

function modelOperationKey(operation: ModelOperation): string {
  return operation === "download" ? "downloadingModel"
    : operation === "load" ? "loadingModel"
      : operation === "unload" ? "unloadingModel"
        : "removingModel";
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
          <span><strong>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></span>
        </button>
      )}
      {onRemove && <button aria-label={`Remove ${attachment.name}`} className="assistant-attachment__remove" onClick={onRemove} type="button"><X size={12} /></button>}
      {isImage && <span className="assistant-attachment__name">{attachment.name} · {formatFileSize(attachment.size)}</span>}
    </div>
  );
}

export function AssistantPage() {
  const { t, i18n } = useTranslation();
  const savedPresets = useLiveQuery(() => db.aiPresets.toArray(), []);
  const presets = savedPresets ?? [];
  const conversations = useLiveQuery(() => db.aiConversations.orderBy("updatedAt").reverse().toArray(), [], []);
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
  const generationActive = useRef(false);
  const [draft, setDraft] = useState("");
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [operation, setOperation] = useState<ModelOperation>();
  const [modelStatus, setModelStatus] = useState<LocalAiStatus>();
  const [progress, setProgress] = useState<LocalAiProgress>();
  const [modelError, setModelError] = useState("");
  const [confirmation, setConfirmation] = useState<"download" | "remove">();
  const [presetDraft, setPresetDraft] = useState<AiPreset>();
  const [error, setError] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentView>();
  const [copyStatus, setCopyStatus] = useState("");
  const [generationStats, setGenerationStats] = useState<{ timeToFirstTokenMs?: number; tokensPerSecond: number }>();
  const selectedModelSetting = useLiveQuery(
    async (): Promise<{ ready: boolean; key: string }> => ({
      ready: true,
      key: (await db.settings.get(LOCAL_AI_MODEL_SETTING_KEY))?.value ?? DEFAULT_LOCAL_AI_MODEL.key,
    }),
    [],
    { ready: false, key: DEFAULT_LOCAL_AI_MODEL.key },
  );
  const selectedModel = getLocalAiModel(selectedModelSetting?.key ?? DEFAULT_LOCAL_AI_MODEL.key) ?? DEFAULT_LOCAL_AI_MODEL;

  useEffect(() => {
    if (savedPresets === undefined || savedPresets.length) return;
    void db.transaction("rw", db.aiPresets, async () => {
      for (const preset of starters) {
        if (!(await db.aiPresets.get(preset.id))) await db.aiPresets.add(preset);
      }
    }).catch(() => setError("saveError"));
  }, [savedPresets]);

  useEffect(() => {
    if (activeConversationId || !conversations.length) return;
    setActiveConversationId(conversations[0].id);
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!selectedModelSetting?.ready || isSending) return;
    let active = true;
    setModelStatus(undefined);
    setModelError("");
    void localAiClient.selectModel(selectedModel.key).then((status) => {
      if (active) setModelStatus(status);
    }).catch((cause: unknown) => {
      if (active) setModelError(cause instanceof LocalAiError ? `errors.${cause.code}` : "errors.failed");
    });
    return () => { active = false; };
  }, [isSending, selectedModel.key, selectedModelSetting?.ready]);

  useEffect(() => () => {
    if (generationActive.current) localAiClient.stop();
  }, []);

  const activePreset = useMemo(
    () => presets.find((item) => item.id === activeConversation?.presetId) ?? presets.find((item) => item.isDefault) ?? presets[0],
    [activeConversation?.presetId, presets],
  );

  const canSend = Boolean(draft.trim()) && !isSending && !operation && modelStatus?.loaded === true;

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

  async function runModelOperation(nextOperation: ModelOperation) {
    setOperation(nextOperation);
    setModelError("");
    setProgress(undefined);
    try {
      if (nextOperation === "download") {
        await localAiClient.download(setProgress);
        setModelStatus({ cached: true, loaded: false });
      } else if (nextOperation === "load") {
        setModelStatus(await localAiClient.load(setProgress));
      } else if (nextOperation === "unload") {
        const cached = await localAiClient.unload();
        setModelStatus({ cached, loaded: false });
      } else {
        await localAiClient.remove();
        setModelStatus({ cached: false, loaded: false });
      }
    } catch (cause) {
      setModelError(cause instanceof LocalAiError ? `errors.${cause.code}` : "errors.failed");
    } finally {
      setOperation(undefined);
      setProgress(undefined);
    }
  }

  async function confirmModelAction() {
    const action = confirmation;
    setConfirmation(undefined);
    if (action) await runModelOperation(action);
  }

  async function refreshModelStatus() {
    setModelError("");
    try {
      setModelStatus(await localAiClient.status());
    } catch (cause) {
      setModelError(cause instanceof LocalAiError ? `errors.${cause.code}` : "errors.failed");
    }
  }

  function stopGeneration() {
    localAiClient.stop();
    void refreshModelStatus();
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !activePreset) return;
    const content = draft.trim();
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
      await db.transaction("rw", [db.aiMessages, db.aiConversations], async () => {
        if (!activeConversation) await db.aiConversations.add(conversation);
        await db.aiMessages.add(userMessage);
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
    await requestLocalReply(conversation, [...messages, userMessage]);
  }

  async function retryMessage(assistantMessage: AiMessage) {
    if (isSending || !modelStatus?.loaded || !activePreset) return;
    const priorMessages = await db.aiMessages.where("conversationId").equals(assistantMessage.conversationId).sortBy("createdAt");
    const currentIndex = priorMessages.findIndex((item) => item.id === assistantMessage.id);
    const conversation = conversations.find((item) => item.id === assistantMessage.conversationId);
    if (currentIndex < 0 || !conversation) return;
    await requestLocalReply(conversation, priorMessages.slice(0, currentIndex), assistantMessage.id);
  }

  async function requestLocalReply(
    conversation: AiConversation,
    contextMessages: AiMessage[],
    assistantMessageId = createId(),
  ) {
    if (!activePreset || !modelStatus?.loaded || isSending) return;
    setIsSending(true);
    generationActive.current = true;
    setStreamingMessageId(assistantMessageId);
    setStreamingText("");
    setProgress(undefined);
    setGenerationStats(undefined);
    setError("");
    let answer = "";
    let saveTimer = 0;
    try {
      await db.aiMessages.put({
        id: assistantMessageId,
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        error: false,
      });
      const promptMessages = buildLocalAiMessages(
        contextMessages.filter((message) => !message.error && message.content.trim()),
        activePreset,
      );
      const result = await localAiClient.generate(
        promptMessages,
        maxNewTokensForPreset(activePreset.length),
        (text) => {
          answer += text;
          setStreamingText(answer);
          if (!saveTimer) {
            saveTimer = window.setTimeout(() => {
              saveTimer = 0;
              void db.aiMessages.update(assistantMessageId, { content: answer }).catch(() => setError("saveError"));
            }, 500);
          }
        },
        setProgress,
      );
      if (!result.interrupted) {
        setGenerationStats({
          timeToFirstTokenMs: result.timeToFirstTokenMs,
          tokensPerSecond: result.tokensPerSecond,
        });
      }
      if (result.interrupted && !answer) answer = t("assistant.generationStopped");
      await db.aiMessages.update(assistantMessageId, { content: answer, error: result.interrupted });
      await db.aiConversations.update(conversation.id, { updatedAt: Date.now() });
    } catch (cause) {
      const errorKey = cause instanceof LocalAiError ? `errors.${cause.code}` : "errors.failed";
      answer = answer || t(`assistant.${errorKey}`);
      setError(errorKey);
      try {
        await db.aiMessages.put({
          id: assistantMessageId,
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
          createdAt: Date.now(),
          error: true,
        });
      } catch {
        setError("saveError");
      }
    } finally {
      if (saveTimer) window.clearTimeout(saveTimer);
      generationActive.current = false;
      setIsSending(false);
      setProgress(undefined);
      setStreamingText("");
      setStreamingMessageId("");
    }
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
        await db.aiPresets.put({ ...presetDraft, name: presetDraft.name.trim(), assistantName: presetDraft.assistantName.trim() });
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
        <button className="button button--quiet" onClick={() => setPresetModalOpen(true)} type="button"><Settings2 size={14} />{t("assistant.presets")}</button>
      </header>
      <div className="assistant-workspace">
        <aside className="assistant-history">
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
            <span className="status-pill"><HardDrive size={12} />{t("assistant.localOnly")}</span>
          </div>
          <section className="local-ai-model" aria-label={t("assistant.model")}>
            <div className="local-ai-model__summary">
              <div className="local-ai-model__identity">
                <Cpu size={16} />
                <div>
                  <strong>{selectedModel.name}</strong>
                  <span>{t("assistant.modelDetails", { size: localAiModelSizeLabel(selectedModel) })}</span>
                </div>
              </div>
              <div className="local-ai-model__status">
                {operation
                  ? <><LoaderCircle className="local-ai-spin" size={13} />{t(`assistant.${modelOperationKey(operation)}`)}</>
                  : modelStatus?.loaded
                    ? <><Check size={13} />{t("assistant.modelLoaded")}</>
                    : modelStatus?.cached
                      ? <><Check size={13} />{t("assistant.modelCached")}</>
                      : modelStatus
                        ? <><Download size={13} />{t("assistant.modelNotDownloaded")}</>
                        : <><LoaderCircle className="local-ai-spin" size={13} />{t("assistant.checkingModel")}</>}
              </div>
              <div className="local-ai-model__actions">
                {modelStatus?.loaded ? (
                  <button className="button button--quiet" disabled={Boolean(operation) || isSending} onClick={() => void runModelOperation("unload")} type="button">{t("assistant.unloadModel")}</button>
                ) : modelStatus?.cached ? (
                  <button className="button button--primary" disabled={Boolean(operation) || isSending} onClick={() => void runModelOperation("load")} type="button">{operation === "load" ? t("assistant.loadingModel") : t("assistant.loadModel")}</button>
                ) : modelStatus ? (
                  <button className="button button--primary" disabled={Boolean(operation)} onClick={() => setConfirmation("download")} type="button">{operation === "download" ? t("assistant.downloading") : t("assistant.downloadModel", { size: localAiModelSizeLabel(selectedModel) })}</button>
                ) : (
                  <button className="button button--quiet" disabled={Boolean(operation)} onClick={() => void refreshModelStatus()} type="button">{t("assistant.checkAgain")}</button>
                )}
                {modelStatus?.cached && !operation && <button className="button button--quiet" disabled={isSending} onClick={() => setConfirmation("remove")} type="button">{t("assistant.removeModel")}</button>}
                {operation === "download" && <button className="button button--quiet" onClick={() => localAiClient.stop()} type="button"><Square size={12} />{t("assistant.stop")}</button>}
              </div>
            </div>
            {progress && (
              <div className="local-ai-progress">
                <div className="local-ai-progress__label">
                  <span>{progress.file ?? t(`assistant.${progress.phase}Progress`)}</span>
                  {progress.loaded !== undefined && progress.total !== undefined && (
                    <span>{formatLocalAiBytes(progress.loaded)} / {formatLocalAiBytes(progress.total)}</span>
                  )}
                </div>
                <progress
                  aria-label={t(`assistant.${progress.phase}Progress`)}
                  max={100}
                  value={localAiProgressPercent(progress) ?? 0}
                />
              </div>
            )}
            <div className="local-ai-model__footnote">
              <span>{t("assistant.offlineModelNotice")}</span>
              {modelStatus?.device && <span>{modelStatus.device === "webgpu" ? "WebGPU" : `WASM · ${modelStatus.wasmThreads ?? 1} ${t("assistant.threads")}`}</span>}
              {generationStats && !isSending && <span>{generationStats.timeToFirstTokenMs === undefined ? "" : `${(generationStats.timeToFirstTokenMs / 1_000).toFixed(1)} s`} · {generationStats.tokensPerSecond} tok/s</span>}
            </div>
            {modelError && <p className="form-error" role="alert">{t(`assistant.${modelError}`)}</p>}
          </section>
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
                      <button className="button button--quiet assistant-message__retry" disabled={isSending || !modelStatus?.loaded} onClick={() => void retryMessage(message)} type="button">{t("assistant.retry")}</button>
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
          <form className="assistant-composer" onSubmit={(event) => void submitMessage(event)}>
            <textarea
              aria-label={t("assistant.composer")}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("assistant.composerPlaceholder")}
              rows={2}
              value={draft}
            />
            <div className="assistant-composer__footer">
              <div className="assistant-composer__status">
                <span>{copyStatus ? t(`assistant.${copyStatus}`) : isSending ? t("assistant.working") : modelStatus?.loaded ? t("assistant.privacyHint") : t("assistant.loadBeforeSending")}</span>
              </div>
              {isSending
                ? <button aria-label={t("assistant.stop")} className="button button--quiet" onClick={stopGeneration} type="button"><Square size={13} />{t("assistant.stop")}</button>
                : <button aria-label={t("assistant.send")} className="button button--primary" disabled={!canSend} type="submit"><Send size={14} />{t("assistant.send")}</button>}
            </div>
          </form>
          {error && <p className="form-error" role="alert">{t(`assistant.${error}`)}</p>}
        </div>
      </div>

      {confirmation && (
        <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setConfirmation(undefined)}>
          <section aria-labelledby="local-ai-confirm-title" aria-modal="true" className="local-ai-confirm-dialog" role="dialog">
            <div className="dialog-heading">
              <h2 id="local-ai-confirm-title">{t(confirmation === "download" ? "assistant.confirmDownloadTitle" : "assistant.confirmRemoveTitle")}</h2>
              <button aria-label={t("assistant.close")} className="icon-button" onClick={() => setConfirmation(undefined)} type="button"><X size={15} /></button>
            </div>
            <p>{t(confirmation === "download" ? "assistant.confirmDownloadDescription" : "assistant.confirmRemoveDescription", { size: localAiModelSizeLabel(selectedModel) })}</p>
            <div className="local-ai-confirm-dialog__actions">
              <button className="button button--quiet" onClick={() => setConfirmation(undefined)} type="button">{t("assistant.cancel")}</button>
              <button className="button button--primary" onClick={() => void confirmModelAction()} type="button">{t(confirmation === "download" ? "assistant.confirmDownload" : "assistant.confirmRemove")}</button>
            </div>
          </section>
        </div>
      )}

      {presetModalOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPresetModalOpen(false)}>
          <section className="preset-dialog" aria-label={t("assistant.managePresets")}>
            <div className="dialog-heading"><h2>{t("assistant.managePresets")}</h2><button className="icon-button" aria-label={t("assistant.close")} onClick={() => setPresetModalOpen(false)} type="button"><X size={15} /></button></div>
            <div className="preset-manager">
              <div className="preset-manager__list">
                <button className="button button--quiet" onClick={() => { setPresetDraft({ id: createId(), name: "", assistantName: "", description: "", style: "", length: "medium", depth: "guided", language: "auto", instructions: "", model: selectedModel.id, isDefault: false }); }} type="button"><Plus size={13} />{t("assistant.createPreset")}</button>
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
