import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getNextTrackIndex,
  getPreviousTrackIndex,
  type MusicFloatingPlayerBounds,
  type MusicPlaylist,
  type MusicRepeatMode,
  type MusicTrack,
  type MusicView,
} from "../data/music";
import { MusicPlaybackController } from "../data/music-playback";

type MusicPlaybackError =
  | "aborted"
  | "decode"
  | "network"
  | "play-blocked"
  | "unsupported"
  | "unavailable"
  | "unknown";

interface MusicPreferencesState {
  favorites: string[];
  playlists: MusicPlaylist[];
  floatingPlayerEnabled: boolean;
  floatingPlayerBounds: MusicFloatingPlayerBounds;
  shuffle: boolean;
  repeat: MusicRepeatMode;
  volume: number;
  view: MusicView;
  toggleFavorite: (trackId: string) => void;
  createPlaylist: (name: string, details?: Pick<MusicPlaylist, "description" | "cover">) => MusicPlaylist | null;
  renamePlaylist: (playlistId: string, name: string) => boolean;
  updatePlaylist: (
    playlistId: string,
    details: { name: string; description: string; cover?: string },
  ) => boolean;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: MusicRepeatMode) => void;
  setVolume: (volume: number) => void;
  setView: (view: MusicView) => void;
  setFloatingPlayerEnabled: (enabled: boolean) => void;
  setFloatingPlayerBounds: (bounds: MusicFloatingPlayerBounds) => void;
}

interface MusicPlayerState {
  tracks: MusicTrack[];
  queue: string[];
  queueIndex: number;
  currentTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  error: MusicPlaybackError | null;
  setTracks: (tracks: MusicTrack[]) => void;
  updateTrackDuration: (trackId: string, duration: number) => void;
  playTrack: (trackId: string, queue?: string[]) => Promise<void>;
  playQueueIndex: (index: number) => Promise<void>;
  togglePlayback: () => Promise<void>;
  nextTrack: (automatic?: boolean) => Promise<void>;
  previousTrack: () => Promise<void>;
  addToQueue: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  seek: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setTime: (time: number, duration: number) => void;
  setError: (error: MusicPlaybackError | null) => void;
}

const initialPreferences: Pick<
  MusicPreferencesState,
  | "favorites"
  | "playlists"
  | "floatingPlayerEnabled"
  | "floatingPlayerBounds"
  | "shuffle"
  | "repeat"
  | "volume"
  | "view"
> = {
  favorites: [],
  playlists: [],
  floatingPlayerEnabled: true,
  floatingPlayerBounds: { right: 20, bottom: 20, width: 320, height: 118 },
  shuffle: false,
  repeat: "off",
  volume: 0.75,
  view: "now-playing",
};

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

let controller: MusicPlaybackController | null = null;

export const useMusicPreferencesStore = create<MusicPreferencesState>()(
  persist(
    (set, get) => ({
      ...initialPreferences,
      toggleFavorite: (trackId) =>
        set((state) => ({
          favorites: state.favorites.includes(trackId)
            ? state.favorites.filter((id) => id !== trackId)
            : [...state.favorites, trackId],
        })),
      createPlaylist: (name, details = {}) => {
        const normalized = normalizedName(name);
        if (!normalized) return null;
        const now = Date.now();
        const playlist: MusicPlaylist = {
          id: crypto.randomUUID(),
          name: normalized,
          trackIds: [],
          description: details.description?.trim().slice(0, 500) ?? "",
          ...(details.cover ? { cover: details.cover } : {}),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ playlists: [...state.playlists, playlist] }));
        return playlist;
      },
      renamePlaylist: (playlistId, name) => {
        const normalized = normalizedName(name);
        if (!normalized) return false;
        const playlist = get().playlists.find((item) => item.id === playlistId);
        if (!playlist) return false;
        set((state) => ({
          playlists: state.playlists.map((item) =>
            item.id === playlistId
              ? { ...item, name: normalized, updatedAt: Date.now() }
              : item,
          ),
        }));
        return true;
      },
      updatePlaylist: (playlistId, details) => {
        const normalized = normalizedName(details.name);
        if (!normalized) return false;
        const description = details.description.trim().slice(0, 500);
        const playlist = get().playlists.find((item) => item.id === playlistId);
        if (!playlist) return false;
        set((state) => ({
          playlists: state.playlists.map((item) =>
            item.id === playlistId
              ? {
                  ...item,
                  name: normalized,
                  description,
                  ...(details.cover ? { cover: details.cover } : { cover: undefined }),
                  updatedAt: Date.now(),
                }
              : item,
          ),
        }));
        return true;
      },
      deletePlaylist: (playlistId) =>
        set((state) => ({
          playlists: state.playlists.filter((playlist) => playlist.id !== playlistId),
        })),
      addTrackToPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId && !playlist.trackIds.includes(trackId)
              ? {
                  ...playlist,
                  trackIds: [...playlist.trackIds, trackId],
                  updatedAt: Date.now(),
                }
              : playlist,
          ),
        })),
      removeTrackFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  trackIds: playlist.trackIds.filter((id) => id !== trackId),
                  updatedAt: Date.now(),
                }
              : playlist,
          ),
        })),
      setShuffle: (shuffle) => set({ shuffle }),
      setRepeat: (repeat) => set({ repeat }),
      setVolume: (volume) => {
        const nextVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.75));
        set({ volume: nextVolume });
        controller?.setVolume(nextVolume);
      },
      setView: (view) => set({ view }),
      setFloatingPlayerEnabled: (enabled) => set({ floatingPlayerEnabled: enabled }),
      setFloatingPlayerBounds: (bounds) =>
        set({
          floatingPlayerBounds: {
            right: Math.max(0, Math.min(2000, Math.round(bounds.right))),
            bottom: Math.max(0, Math.min(2000, Math.round(bounds.bottom))),
            width: Math.max(240, Math.min(520, Math.round(bounds.width))),
            height: Math.max(108, Math.min(260, Math.round(bounds.height))),
          },
        }),
    }),
    {
      name: "kxnodesk-music",
      version: 1,
      partialize: (state) => ({
        favorites: state.favorites,
        playlists: state.playlists,
        floatingPlayerEnabled: state.floatingPlayerEnabled,
        floatingPlayerBounds: state.floatingPlayerBounds,
        shuffle: state.shuffle,
        repeat: state.repeat,
        volume: state.volume,
        view: state.view,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<typeof initialPreferences>;
        return {
          ...current,
          favorites: Array.isArray(saved.favorites)
            ? saved.favorites.filter((id): id is string => typeof id === "string")
            : current.favorites,
          playlists: Array.isArray(saved.playlists)
            ? saved.playlists.flatMap((playlist) => {
                if (
                  typeof playlist?.id !== "string" ||
                  typeof playlist.name !== "string" ||
                  !Array.isArray(playlist.trackIds) ||
                  typeof playlist.createdAt !== "number" ||
                  typeof playlist.updatedAt !== "number"
                ) return [];
                return [{
                  ...playlist,
                  trackIds: playlist.trackIds.filter((id): id is string => typeof id === "string"),
                  description: typeof playlist.description === "string"
                    ? playlist.description.slice(0, 500)
                    : "",
                  ...(typeof playlist.cover === "string" &&
                    playlist.cover.startsWith("data:image/") &&
                    playlist.cover.length <= 1_000_000
                    ? { cover: playlist.cover }
                    : { cover: undefined }),
                }];
              })
            : current.playlists,
          floatingPlayerEnabled: typeof saved.floatingPlayerEnabled === "boolean"
            ? saved.floatingPlayerEnabled
            : current.floatingPlayerEnabled,
          floatingPlayerBounds: saved.floatingPlayerBounds &&
            typeof saved.floatingPlayerBounds === "object"
            ? {
                right: typeof saved.floatingPlayerBounds.right === "number"
                  ? Math.max(0, Math.min(2000, saved.floatingPlayerBounds.right))
                  : current.floatingPlayerBounds.right,
                bottom: typeof saved.floatingPlayerBounds.bottom === "number"
                  ? Math.max(0, Math.min(2000, saved.floatingPlayerBounds.bottom))
                  : current.floatingPlayerBounds.bottom,
                width: typeof saved.floatingPlayerBounds.width === "number"
                  ? Math.max(240, Math.min(520, saved.floatingPlayerBounds.width))
                  : current.floatingPlayerBounds.width,
                height: typeof saved.floatingPlayerBounds.height === "number"
                  ? Math.max(108, Math.min(260, saved.floatingPlayerBounds.height))
                  : current.floatingPlayerBounds.height,
              }
            : current.floatingPlayerBounds,
          shuffle: typeof saved.shuffle === "boolean" ? saved.shuffle : current.shuffle,
          repeat: saved.repeat === "all" || saved.repeat === "one" || saved.repeat === "off"
            ? saved.repeat
            : current.repeat,
          volume: typeof saved.volume === "number" && Number.isFinite(saved.volume)
            ? Math.max(0, Math.min(1, saved.volume))
            : current.volume,
          view: saved.view === "library" || saved.view === "playlists" || saved.view === "favorites" || saved.view === "now-playing"
            ? saved.view
            : current.view,
        };
      },
    },
  ),
);

export function disposeMusicPlayer(): void {
  controller?.dispose();
  controller = null;
}

function getController(): MusicPlaybackController {
  if (!controller) {
    const audio = document.createElement("audio");
    controller = new MusicPlaybackController(audio, {
      onPlayingChange: (isPlaying) => useMusicStore.getState().setPlaying(isPlaying),
      onTimeChange: (currentTime, duration) =>
        useMusicStore.getState().setTime(currentTime, duration),
      onMetadata: (duration) => {
        const { currentTrackId, updateTrackDuration } = useMusicStore.getState();
        if (currentTrackId && duration > 0) updateTrackDuration(currentTrackId, duration);
      },
      onEnded: () => {
        void useMusicStore.getState().nextTrack(true);
      },
      onError: (code) =>
        useMusicStore.getState().setError(
          code === 1
            ? "aborted"
            : code === 2
              ? "network"
              : code === 3
                ? "decode"
                : code === 4
                  ? "unsupported"
                  : "unknown",
        ),
    });
  }
  return controller;
}

export const useMusicStore = create<MusicPlayerState>((set, get) => ({
  tracks: [],
  queue: [],
  queueIndex: -1,
  currentTrackId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  error: null,
  setTracks: (tracks) => {
    const { currentTrackId: currentId, queue, queueIndex } = get();
    if (currentId && !tracks.some((track) => track.id === currentId)) {
      controller?.dispose();
      controller = null;
      set({
        tracks,
        queue: [],
        queueIndex: -1,
        currentTrackId: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        error: "unavailable",
      });
      return;
    }
    const availableIds = new Set(tracks.map((track) => track.id));
    const nextQueue = queue.filter((id) => availableIds.has(id));
    set({
      tracks,
      queue: nextQueue,
      queueIndex: currentId
        ? nextQueue.indexOf(currentId)
        : queueIndex < 0
          ? -1
          : Math.min(queueIndex, nextQueue.length - 1),
    });
  },
  updateTrackDuration: (trackId, duration) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, duration } : track,
      ),
      ...(state.currentTrackId === trackId ? { duration } : {}),
    })),
  playTrack: async (trackId, requestedQueue) => {
    const state = get();
    const track = state.tracks.find((item) => item.id === trackId);
    if (!track) {
      set({ error: "unavailable", isPlaying: false });
      return;
    }
    const queue = requestedQueue?.length
      ? requestedQueue.filter((id) => state.tracks.some((item) => item.id === id))
      : state.queue.length
        ? [...state.queue]
        : [trackId];
    let queueIndex = queue.indexOf(trackId);
    if (queueIndex < 0) {
      queue.unshift(trackId);
      queueIndex = 0;
    }
    set({
      queue,
      queueIndex,
      currentTrackId: trackId,
      currentTime: 0,
      duration: track.duration ?? 0,
      isPlaying: false,
      error: null,
    });
    const audio = getController();
    audio.setVolume(useMusicPreferencesStore.getState().volume);
    try {
      audio.load(track);
      await audio.play();
    } catch (error) {
      set({
        isPlaying: false,
        error: error instanceof DOMException && error.name === "NotAllowedError"
          ? "play-blocked"
          : "unknown",
      });
    }
  },
  playQueueIndex: async (index) => {
    const { queue } = get();
    const trackId = queue[index];
    if (!trackId) return;
    await get().playTrack(trackId, queue);
  },
  togglePlayback: async () => {
    const state = get();
    if (!state.currentTrackId) return;
    const audio = getController();
    if (audio.currentTrackId !== state.currentTrackId) {
      await state.playTrack(state.currentTrackId, state.queue);
      return;
    }
    try {
      await audio.toggle();
      set({ error: null });
    } catch (error) {
      set({
        isPlaying: false,
        error: error instanceof DOMException && error.name === "NotAllowedError"
          ? "play-blocked"
          : "unknown",
      });
    }
  },
  nextTrack: async (automatic = false) => {
    const state = get();
    if (automatic && useMusicPreferencesStore.getState().repeat === "one") {
      const audio = getController();
      audio.seek(0);
      try {
        await audio.play();
        set({ currentTime: 0, error: null });
      } catch {
        set({ isPlaying: false, error: "unknown" });
      }
      return;
    }
    const repeat = useMusicPreferencesStore.getState().repeat;
    const index = getNextTrackIndex(
      state.queue,
      state.queueIndex,
      repeat,
      useMusicPreferencesStore.getState().shuffle,
    );
    if (index < 0) {
      if (automatic) set({ isPlaying: false, currentTime: 0 });
      else set({ error: null });
      if (controller) controller.pause();
      else if (get().currentTrackId) {
        const currentTrack = get().tracks.find((track) => track.id === get().currentTrackId);
        if (currentTrack) {
          controller = getController();
          controller.clear();
        }
      }
      return;
    }
    await get().playQueueIndex(index);
  },
  previousTrack: async () => {
    const state = get();
    const audio = getController();
    if (state.currentTime > 3) {
      audio.seek(0);
      set({ currentTime: 0 });
      return;
    }
    const index = getPreviousTrackIndex(
      state.queue,
      state.queueIndex,
      useMusicPreferencesStore.getState().repeat,
    );
    if (index >= 0) await get().playQueueIndex(index);
    else {
      audio.seek(0);
      set({ currentTime: 0 });
    }
  },
  addToQueue: (trackId) => {
    if (!get().tracks.some((track) => track.id === trackId)) return;
    set((state) => ({ queue: [...state.queue, trackId] }));
  },
  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    if (index < 0 || index >= queue.length || index === queueIndex) return;
    set({
      queue: queue.filter((_, itemIndex) => itemIndex !== index),
      queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex,
    });
  },
  clearQueue: () => {
    const { currentTrackId } = get();
    set({ queue: currentTrackId ? [currentTrackId] : [], queueIndex: currentTrackId ? 0 : -1 });
  },
  seek: (time) => {
    if (!Number.isFinite(time)) return;
    getController().seek(time);
    set({ currentTime: time });
  },
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTime: (currentTime, duration) =>
    set({
      currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    }),
  setError: (error) => set({ error, ...(error ? { isPlaying: false } : {}) }),
}));
