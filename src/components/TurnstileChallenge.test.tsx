import { act, cleanup, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { TurnstileChallenge } from "./TurnstileChallenge";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "turnstile");
});

describe("TurnstileChallenge", () => {
  it("requests a fresh interaction-only token only when a request starts", async () => {
    let callbacks: {
      appearance: string;
      execution: string;
      callback: (token: string) => void;
    } | undefined;
    const renderWidget = vi.fn((_container: HTMLElement, options: typeof callbacks) => {
      callbacks = options;
      return "widget-id";
    });
    const resetWidget = vi.fn();
    const executeWidget = vi.fn();
    const removeWidget = vi.fn();
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: renderWidget, reset: resetWidget, execute: executeWidget, remove: removeWidget },
    });
    const onToken = vi.fn();
    const onError = vi.fn();
    const component = (requestId: number) => (
      <I18nextProvider i18n={i18n}>
        <TurnstileChallenge action="chat" onError={onError} onToken={onToken} requestId={requestId} siteKey="public-site-key" />
      </I18nextProvider>
    );
    const view = render(component(0));

    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce());
    expect(callbacks).toMatchObject({ appearance: "interaction-only", execution: "execute" });
    expect(executeWidget).not.toHaveBeenCalled();

    view.rerender(component(1));
    await waitFor(() => expect(executeWidget).toHaveBeenCalledWith("widget-id"));
    expect(resetWidget).toHaveBeenCalledWith("widget-id");
    act(() => callbacks?.callback("fresh-turnstile-token"));
    expect(onToken).toHaveBeenCalledWith("fresh-turnstile-token");
    expect(view.container.querySelector(".turnstile-challenge")).toHaveClass("turnstile-challenge--verified");

    view.rerender(component(2));
    await waitFor(() => expect(executeWidget).toHaveBeenCalledTimes(2));
    expect(view.container.querySelector(".turnstile-challenge")).not.toHaveClass("turnstile-challenge--verified");
    expect(removeWidget).not.toHaveBeenCalled();
  });
});
