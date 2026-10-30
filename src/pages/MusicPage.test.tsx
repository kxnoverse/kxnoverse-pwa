import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { i18n, i18nReady } from "../i18n";
import { useMusicPreferencesStore, useMusicStore } from "../stores/music-store";
import { MusicPage } from "./MusicPage";

function renderMusicPage() {
  return render(
    <MemoryRouter initialEntries={["/music"]}>
      <MusicPage />
    </MemoryRouter>,
  );
}

describe("Music page playlist editing", () => {
  beforeEach(async () => {
    await i18nReady;
    await i18n.changeLanguage("en");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    localStorage.removeItem("kxnodesk-music");
    useMusicPreferencesStore.setState({
      favorites: [],
      playlists: [],
      floatingPlayerEnabled: true,
      floatingPlayerBounds: { right: 20, bottom: 20, width: 320, height: 118 },
      shuffle: false,
      repeat: "off",
      volume: 0.75,
      view: "now-playing",
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
    localStorage.removeItem("kxnodesk-music");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });

  it("creates and edits a playlist's name and description in the playlist dialog", async () => {
    const { container } = renderMusicPage();
    fireEvent.click(screen.getByRole("button", { name: "Playlists" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Create playlist" })[0]);

    const createDialog = await screen.findByRole("dialog");
    fireEvent.change(within(createDialog).getByLabelText("Playlist name"), {
      target: { value: "Focus mix" },
    });
    fireEvent.change(within(createDialog).getByLabelText("Description"), {
      target: { value: "Quiet tracks for deep work" },
    });
    fireEvent.click(within(createDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useMusicPreferencesStore.getState().playlists).toMatchObject([{
        name: "Focus mix",
        description: "Quiet tracks for deep work",
      }]);
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit playlist: Focus mix" }));

    const editDialog = await screen.findByRole("dialog");
    fireEvent.change(within(editDialog).getByLabelText("Description"), {
      target: { value: "Updated playlist notes" },
    });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useMusicPreferencesStore.getState().playlists[0].description).toBe(
        "Updated playlist notes",
      );
    });
    expect(container.querySelector(".music-playlist-detail__description")).toHaveTextContent(
      "Updated playlist notes",
    );
  });
});
