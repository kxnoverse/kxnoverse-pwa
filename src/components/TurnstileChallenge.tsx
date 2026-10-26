import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: "chat" | "test";
      theme: "dark";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": (errorCode?: string) => void;
    },
  ): string;
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
  onToken,
}: {
  siteKey: string;
  action: "chat" | "test";
  onToken: (token: string) => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [status, setStatus] = useState<"loading" | "ready" | "load-error" | "widget-error">("loading");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    onTokenRef.current("");
    setStatus("loading");
    setErrorCode("");
    void loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return;
      widgetId = turnstile.render(container.current, {
        sitekey: siteKey,
        action,
        theme: "dark",
        callback: (token) => {
          setStatus("ready");
          onTokenRef.current(token);
        },
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": (code) => {
          setErrorCode(code ?? "");
          setStatus("widget-error");
          onTokenRef.current("");
        },
      });
    }).catch(() => {
      if (active) setStatus("load-error");
    });
    return () => {
      active = false;
      onTokenRef.current("");
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [action, siteKey]);

  return (
    <div className="turnstile-challenge">
      <div ref={container} />
      {status === "loading" && <span role="status">{t("assistant.turnstileLoading")}</span>}
      {status === "load-error" && <span className="form-error" role="alert">{t("assistant.turnstileLoadError")}</span>}
      {status === "widget-error" && (
        <span className="form-error" role="alert">
          {t("assistant.turnstileWidgetError")}
          {errorCode && ` (${errorCode})`}
        </span>
      )}
    </div>
  );
}
