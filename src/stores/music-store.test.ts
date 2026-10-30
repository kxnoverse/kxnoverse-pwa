import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMusicTrack } from "../data/music";
import { disposeMusicPlayer, useMusicPreferencesStore, useMusicStore } from "./music-store";

async function tracksFrom(...names: string[]) {
  return Promise.all(
    names.map((name) => createMusicTrack(new File(["audio"], name, { type: "audio/wav" }))),
  );
}

describe("music stores", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
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
    disposeMusicPlayer();
    vi.restoreAllMocks();
    localStorage.removeItem("kxnodesk-music");
  });

  it("persists favorites, normalized playlists, and bounded preferences across hydration", async () => {
    const id = "track-1";
    useMusicPreferencesStore.getState().toggleFavorite(id);
    const playlist = useMusicPreferencesStore.getState().createPlaylist("  Road   trip ", {
      description: "Focus mix",
      cover: "data:image/jpeg;base64,dGVzdA==",
    });

    expect(playlist?.name).toBe("Road trip");
    useMusicPreferencesStore.getState().addTrackToPlaylist(playlist!.id, id);
    useMusicPreferencesStore.getState().addTrackToPlaylist(playlist!.id, id);
    useMusicPreferencesStore.getState().setVolume(2);
    useMusicPreferencesStore.getState().setRepeat("all");

    const saved = JSON.parse(localStorage.getItem("kxnodesk-music") ?? "{}");
    expect(useMusicPreferencesStore.getState()).toMatchObject({
      favorites: [id],
      playlists: [{
        name: "Road trip",
        trackIds: [id],
        description: "Focus mix",
        cover: "data:image/jpeg;base64,dGVzdA==",
      }],
      volume: 1,
      repeat: "all",
    });
    expect(saved.state).toMatchObject({
      favorites: [id],
      playlists: [{
        name: "Road trip",
        trackIds: [id],
        description: "Focus mix",
        cover: "data:image/jpeg;base64,dGVzdA==",
      }],
      volume: 1,
      repeat: "all",
    });
    useMusicPreferencesStore.getState().setFloatingPlayerEnabled(false);
    useMusicPreferencesStore.getState().setFloatingPlayerBounds({
      right: 65,
      bottom: 32,
      width: 455,
      height: 176,
    });
    const savedWithFloatingPlayer = JSON.parse(localStorage.getItem("kxnodesk-music") ?? "{}");
    expect(savedWithFloatingPlayer.state).toMatchObject({
      floatingPlayerEnabled: false,
      floatingPlayerBounds: { right: 65, bottom: 32, width: 455, height: 176 },
    });
    const savedPreferences = localStorage.getItem("kxnodesk-music");
    if (!savedPreferences) throw new Error("Music preferences were not persisted.");
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
    localStorage.setItem("kxnodesk-music", savedPreferences);
    await useMusicPreferencesStore.persist.rehydrate();
    expect(useMusicPreferencesStore.getState()).toMatchObject({
      favorites: [id],
      playlists: [{
        name: "Road trip",
        trackIds: [id],
        description: "Focus mix",
        cover: "data:image/jpeg;base64,dGVzdA==",
      }],
      floatingPlayerEnabled: false,
      floatingPlayerBounds: { right: 65, bottom: 32, width: 455, height: 176 },
      volume: 1,
      repeat: "all",
    });
  });

  it("hydrates playlists created before descriptions, covers, and player settings existed", async () => {
    localStorage.setItem("kxnodesk-music", JSON.stringify({
      state: {
        favorites: [],
        playlists: [{
          id: "legacy-playlist",
          name: "Old playlist",
          trackIds: ["track-1"],
          createdAt: 1,
          updatedAt: 2,
        }],
        volume: 0.5,
      },
      version: 1,
    }));

    await useMusicPreferencesStore.persist.rehydrate();

    expect(useMusicPreferencesStore.getState()).toMatchObject({
      playlists: [{
        id: "legacy-playlist",
        name: "Old playlist",
        trackIds: ["track-1"],
        description: "",
      }],
      floatingPlayerEnabled: true,
      floatingPlayerBounds: { right: 20, bottom: 20, width: 320, height: 118 },
      volume: 0.5,
    });
  });

  it("validates and applies playlist and favorite actions", () => {
    const preferences = useMusicPreferencesStore.getState();
    expect(preferences.createPlaylist("   ")).toBeNull();
    const playlist = preferences.createPlaylist("Study", {
      description: "  quiet focus  ",
      cover: "data:image/jpeg;base64,dGVzdA==",
    });
    if (!playlist) throw new Error("A valid playlist name was rejected.");

    expect(playlist).toMatchObject({
      name: "Study",
      description: "quiet focus",
      cover: "data:image/jpeg;base64,dGVzdA==",
    });
    useMusicPreferencesStore.getState().addTrackToPlaylist(playlist.id, "track-1");
    useMusicPreferencesStore.getState().addTrackToPlaylist(playlist.id, "track-1");
    expect(useMusicPreferencesStore.getState().playlists[0].trackIds).toEqual(["track-1"]);
    expect(useMusicPreferencesStore.getState().renamePlaylist(playlist.id, "  ")).toBe(false);
    expect(useMusicPreferencesStore.getState().renamePlaylist(playlist.id, "Focused work")).toBe(true);
    expect(useMusicPreferencesStore.getState().updatePlaylist(playlist.id, {
      name: "  ",
      description: "Updated",
    })).toBe(false);
    expect(useMusicPreferencesStore.getState().updatePlaylist(playlist.id, {
      name: "Focused work",
      description: "  New description  ",
    })).toBe(true);
    expect(useMusicPreferencesStore.getState().playlists[0]).toMatchObject({
      name: "Focused work",
      description: "New description",
      cover: undefined,
    });
    useMusicPreferencesStore.getState().removeTrackFromPlaylist(playlist.id, "track-1");
    useMusicPreferencesStore.getState().toggleFavorite("track-1");

    expect(useMusicPreferencesStore.getState()).toMatchObject({
      favorites: ["track-1"],
      playlists: [{ name: "Focused work", trackIds: [] }],
    });
    useMusicPreferencesStore.getState().toggleFavorite("track-1");
    useMusicPreferencesStore.getState().deletePlaylist(playlist.id);
    expect(useMusicPreferencesStore.getState()).toMatchObject({
      favorites: [],
      playlists: [],
    });
  });

  it("advances playback through a stable queue and protects the active item", async () => {
    const [first, second, third] = await tracksFrom("First.wav", "Second.wav", "Third.wav");
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:music-test");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const setAudioVolume = vi.spyOn(HTMLMediaElement.prototype, "volume", "set");

    useMusicStore.getState().setTracks([first, second, third]);
    await useMusicStore.getState().playTrack(first.id, [first.id, second.id, third.id]);
    useMusicPreferencesStore.getState().setVolume(0.42);
    await useMusicStore.getState().nextTrack();

    expect(useMusicStore.getState()).toMatchObject({
      queue: [first.id, second.id, third.id],
      queueIndex: 1,
      currentTrackId: second.id,
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(createUrl).toHaveBeenCalledTimes(2);
    expect(setAudioVolume).toHaveBeenLastCalledWith(0.42);

    useMusicStore.getState().removeFromQueue(0);
    expect(useMusicStore.getState()).toMatchObject({
      queue: [second.id, third.id],
      queueIndex: 0,
      currentTrackId: second.id,
    });
    useMusicStore.getState().removeFromQueue(0);
    expect(useMusicStore.getState().queue).toEqual([second.id, third.id]);
  });

  it("stops and reports unavailable when a currently playing file is removed", async () => {
    const [track] = await tracksFrom("Unavailable.wav");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:music-test");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    useMusicStore.getState().setTracks([track]);
    await useMusicStore.getState().playTrack(track.id);
    useMusicStore.getState().setTracks([]);

    expect(useMusicStore.getState()).toMatchObject({
      tracks: [],
      queue: [],
      currentTrackId: null,
      isPlaying: false,
      error: "unavailable",
    });
  });
});
