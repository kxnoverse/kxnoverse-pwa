import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  ScreensaverProvider,
  useScreensaver,
} from "./Screensaver";

function ScreensaverProbe() {
  const { isActive, activate } = useScreensaver();
  return (
    <>
      <button onClick={activate} type="button">Activate manually</button>
      <input aria-label="Schedule editor" />
      <output>{isActive ? "active" : "inactive"}</output>
    </>
  );
}

function renderProvider(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScreensaverProvider>
        <ScreensaverProbe />
      </ScreensaverProvider>
    </MemoryRouter>,
  );
}

const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (hiddenDescriptor) {
    Object.defineProperty(document, "hidden", hiddenDescriptor);
  } else {
    Reflect.deleteProperty(document, "hidden");
  }
});

describe("screensaver inactivity handling", () => {
  it("activates manually", () => {
    vi.useFakeTimers();
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Activate manually" }));
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("activates automatically after five idle minutes", () => {
    vi.useFakeTimers();
    renderProvider();

    act(() => vi.advanceTimersByTime(299_999));
    expect(screen.getByText("inactive")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("resets the timeout after pointer movement", () => {
    vi.useFakeTimers();
    renderProvider();

    act(() => vi.advanceTimersByTime(4 * 60 * 1000));
    fireEvent.pointerMove(window);
    act(() => vi.advanceTimersByTime(299_999));
    expect(screen.getByText("inactive")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("suspends activation while a form control is focused", () => {
    vi.useFakeTimers();
    renderProvider();
    const input = screen.getByRole("textbox", { name: "Schedule editor" });

    fireEvent.focusIn(input);
    act(() => vi.advanceTimersByTime(6 * 60 * 1000));
    expect(screen.getByText("inactive")).toBeInTheDocument();

    fireEvent.focusOut(input);
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("does not activate while a minigame route is open", () => {
    vi.useFakeTimers();
    renderProvider("/minigames/chess");

    act(() => vi.advanceTimersByTime(6 * 60 * 1000));
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("suspends activation while the browser tab is hidden and restarts on return", () => {
    vi.useFakeTimers();
    renderProvider();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(6 * 60 * 1000));
    expect(screen.getByText("inactive")).toBeInTheDocument();

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(5 * 60 * 1000));
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});
