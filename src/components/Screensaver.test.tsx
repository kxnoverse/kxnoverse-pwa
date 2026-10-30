import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  ScreensaverOverlay,
  ScreensaverProvider,
  useScreensaver,
} from "./Screensaver";
import { createMusicTrack } from "../data/music";
import { useMusicStore } from "../stores/music-store";

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

function renderProvider(path = "/", includeOverlay = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScreensaverProvider>
        {includeOverlay && <ScreensaverOverlay />}
        <ScreensaverProbe />
      </ScreensaverProvider>
    </MemoryRouter>,
  );
}

const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

afterEach(() => {
  cleanup();
  useMusicStore.setState({
    tracks: [],
    queue: [],
    queueIndex: -1,
    currentTrackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    error: null,
  });
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

  it("shows playback controls in the screensaver and keeps their clicks from dismissing it", async () => {
    const track = await createMusicTrack(
      new File(["audio"], "Current song.wav", { type: "audio/wav" }),
    );
    const togglePlayback = vi.fn(async () => undefined);
    useMusicStore.setState({
      tracks: [track],
      currentTrackId: track.id,
      isPlaying: true,
      togglePlayback,
    });
    const { container } = renderProvider("/", true);

    fireEvent.click(screen.getByRole("button", { name: "Activate manually" }));

    const musicPlayer = container.querySelector(".screensaver__music");
    expect(musicPlayer).toBeInTheDocument();
    expect(musicPlayer).toHaveTextContent("Current song");
    const playbackButton = musicPlayer?.querySelector(".screensaver__music-controls button:nth-child(2)");
    expect(playbackButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(playbackButton!);
    });
    expect(togglePlayback).toHaveBeenCalledOnce();
    expect(screen.getByText("active")).toBeInTheDocument();
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
