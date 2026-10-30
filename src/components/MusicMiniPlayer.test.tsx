import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createMusicTrack } from "../data/music";
import {
  disposeMusicPlayer,
  useMusicPreferencesStore,
  useMusicStore,
} from "../stores/music-store";
import { MusicMiniPlayer } from "./MusicMiniPlayer";
import { ScreensaverProvider } from "./Screensaver";

async function createTrack() {
  return createMusicTrack(
    new File(["audio"], "Mini player test.wav", { type: "audio/wav" }),
  );
}

function renderPlayer() {
  return render(
    <MemoryRouter>
      <ScreensaverProvider>
        <MusicMiniPlayer />
      </ScreensaverProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  });
  localStorage.removeItem("kxnodesk-music");
  useMusicPreferencesStore.setState({
    floatingPlayerEnabled: true,
    floatingPlayerBounds: { right: 20, bottom: 20, width: 320, height: 118 },
  });
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  disposeMusicPlayer();
  localStorage.removeItem("kxnodesk-music");
});

describe("floating music player", () => {
  it("provides transport controls and can be hidden", async () => {
    const track = await createTrack();
    const previousTrack = vi.fn(async () => undefined);
    const togglePlayback = vi.fn(async () => undefined);
    const nextTrack = vi.fn(async () => undefined);
    useMusicStore.setState({
      tracks: [track],
      currentTrackId: track.id,
      isPlaying: true,
      previousTrack,
      togglePlayback,
      nextTrack,
    });
    const { container } = renderPlayer();

    expect(container.querySelector(".music-mini-player__track")).toHaveTextContent(
      "Mini player test",
    );
    const controls = container.querySelectorAll(".music-mini-player__controls button");
    await act(async () => {
      fireEvent.click(controls[0]);
      fireEvent.click(controls[1]);
      fireEvent.click(controls[2]);
    });
    expect(previousTrack).toHaveBeenCalledOnce();
    expect(togglePlayback).toHaveBeenCalledOnce();
    expect(nextTrack).toHaveBeenCalledOnce();

    fireEvent.click(container.querySelector(".music-mini-player__close")!);
    expect(container.querySelector(".music-mini-player")).not.toBeInTheDocument();
    expect(useMusicPreferencesStore.getState().floatingPlayerEnabled).toBe(false);
  });

  it("moves and resizes with keyboard controls and persists the new bounds", async () => {
    const track = await createTrack();
    useMusicStore.setState({
      tracks: [track],
      currentTrackId: track.id,
    });
    const { container } = renderPlayer();
    const moveHandle = container.querySelector(".music-mini-player__move")!;
    const resizeHandle = container.querySelector(".music-mini-player__resize")!;

    expect(useMusicPreferencesStore.getState().floatingPlayerBounds).toMatchObject({
      right: 20,
      bottom: 20,
      width: 320,
      height: 118,
    });
    fireEvent.keyDown(moveHandle, { key: "ArrowLeft" });
    expect(useMusicPreferencesStore.getState().floatingPlayerBounds.right).toBe(36);
    fireEvent.keyDown(resizeHandle, { key: "ArrowDown" });

    expect(useMusicPreferencesStore.getState().floatingPlayerBounds).toMatchObject({
      right: 36,
      bottom: 20,
      width: 320,
      height: 134,
    });
    expect(container.querySelector(".music-mini-player")).toHaveStyle({
      right: "36px",
      height: "134px",
    });
  });

  it("supports pointer dragging and resizing", async () => {
    const track = await createTrack();
    useMusicStore.setState({
      tracks: [track],
      currentTrackId: track.id,
    });
    useMusicPreferencesStore.setState({
      floatingPlayerBounds: { right: 100, bottom: 100, width: 320, height: 118 },
    });
    const { container } = renderPlayer();

    fireEvent.pointerDown(container.querySelector(".music-mini-player__move")!, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 116, clientY: 110 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(useMusicPreferencesStore.getState().floatingPlayerBounds).toMatchObject({
      right: 84,
      bottom: 90,
    });

    fireEvent.pointerDown(container.querySelector(".music-mini-player__resize")!, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 220, clientY: 212 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(useMusicPreferencesStore.getState().floatingPlayerBounds).toMatchObject({
      right: 84,
      bottom: 90,
      width: 340,
      height: 130,
    });
  });
});
