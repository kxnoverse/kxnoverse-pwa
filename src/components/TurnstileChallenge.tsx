import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: "chat" | "test";
      theme: "dark";
      appearance: "interaction-only";
      execution: "execute";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": (errorCode?: string) => void;
      "timeout-callback": () => void;
    },
  ): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScript) return turnstileScript;
  const pending = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile failed to initialize."));
    script.onerror = () => reject(new Error("Turnstile could not be loaded."));
    document.head.append(script);
  });
  const load = pending.catch((cause: unknown) => {
    turnstileScript = undefined;
    throw cause;
  });
  turnstileScript = load;
  return load;
}

export function TurnstileChallenge({
  siteKey,
  action,
  requestId,
  onToken,
  onError,
}: {
  siteKey: string;
  action: "chat" | "test";
  requestId: number;
  onToken: (token: string) => void;
  onError: (error: Error) => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const widgetRef = useRef<{ api: TurnstileApi; id: string } | undefined>(undefined);
  const requestIdRef = useRef(requestId);
  const lastExecutedRequestId = useRef(0);
  const loadErrorRef = useRef<Error | undefined>(undefined);
  const executeRequestRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<"ready" | "load-error" | "widget-error" | "timeout-error">("ready");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onError, onToken]);

  requestIdRef.current = requestId;
  executeRequestRef.current = () => {
    const widget = widgetRef.current;
    const currentRequestId = requestIdRef.current;
    if (currentRequestId <= lastExecutedRequestId.current) return;
    if (!widget) {
      if (loadErrorRef.current) onErrorRef.current(loadErrorRef.current);
      return;
    }
    lastExecutedRequestId.current = currentRequestId;
    try {
      widget.api.reset(widget.id);
      widget.api.execute(widget.id);
    } catch {
      const error = new Error("Turnstile could not start verification.");
      setStatus("widget-error");
      onTokenRef.current("");
      onErrorRef.current(error);
    }
  };

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    loadErrorRef.current = undefined;
    setStatus("ready");
    setErrorCode("");
    void loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return;
      widgetId = turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: "dark",
        appearance: "interaction-only",
        execution: "execute",
        callback: (token) => {
          setStatus("ready");
          setErrorCode("");
          onTokenRef.current(token);
        },
        "expired-callback": () => {
          setStatus("widget-error");
          onTokenRef.current("");
          const error = new Error("Turnstile token expired.");
          onErrorRef.current(error);
        },
        "error-callback": (code) => {
          setErrorCode(code ?? "");
          setStatus("widget-error");
          onTokenRef.current("");
          const error = new Error(code ? `Turnstile failed (${code}).` : "Turnstile failed.");
          onErrorRef.current(error);
        },
        "timeout-callback": () => {
          setStatus("timeout-error");
          const error = new Error("Turnstile verification timed out.");
          onErrorRef.current(error);
        },
      });
      widgetRef.current = { api: turnstile, id: widgetId };
      executeRequestRef.current();
    }).catch(() => {
      if (active) {
        const error = new Error("Turnstile could not be loaded.");
        loadErrorRef.current = error;
        setStatus("load-error");
        onErrorRef.current(error);
      }
    });
    return () => {
      active = false;
      widgetRef.current = undefined;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, siteKey]);

  useEffect(() => {
    executeRequestRef.current();
  }, [requestId]);

  return (
    <div className="turnstile-challenge">
      <div ref={container} />
      {status === "load-error" && <span className="form-error" role="alert">{t("assistant.turnstileLoadError")}</span>}
      {status === "widget-error" && (
        <span className="form-error" role="alert">
          {t("assistant.turnstileWidgetError")}
          {errorCode && ` (${errorCode})`}
        </span>
      )}
      {status === "timeout-error" && <span className="form-error" role="alert">{t("assistant.turnstileTimeout")}</span>}
    </div>
  );
}
