import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Disc3,
  FolderOpen,
  Heart,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  PictureInPicture2,
  Pencil,
  Play,
  Plus,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MusicArtwork } from "../components/MusicArtwork";
import {
  chooseMusicFolder,
  forgetMusicFolder,
  getSavedMusicFolder,
  requestMusicFolderPermission,
  scanMusicFolder,
  scanSelectedMusicFiles,
  supportsMusicFolderPicker,
  type MusicFolderStatus,
  type MusicScanResult,
} from "../data/music-library";
import {
  formatMusicDuration,
  createPlaylistCover,
  probeAudioDuration,
  sortMusicTracks,
  type MusicPlaylist,
  type MusicTrack,
  type MusicView,
} from "../data/music";
import {
  useMusicPreferencesStore,
  useMusicStore,
} from "../stores/music-store";

type MusicDialog =
  | { kind: "create"; trackToAdd?: MusicTrack }
  | { kind: "edit"; playlist: MusicPlaylist }
  | { kind: "delete"; playlist: MusicPlaylist }
  | { kind: "add"; track: MusicTrack };

const MUSIC_TABS: MusicView[] = [
  "now-playing",
  "library",
  "playlists",
  "favorites",
];
const PAGE_SIZE = 100;

function useArtworkDescription(track: MusicTrack): string {
  return track.title;
}

function MusicTabs({ activeView, onChange }: {
  activeView: MusicView;
  onChange: (view: MusicView) => void;
}) {
  const { t } = useTranslation();
  const icons = {
    "now-playing": Music2,
    library: Disc3,
    playlists: ListMusic,
    favorites: Heart,
  };
  return (
    <nav className="music-tabs" aria-label={t("music.title")}>
      {MUSIC_TABS.map((view) => {
        const Icon = icons[view];
        return (
          <button
            type="button"
            className={activeView === view ? "is-active" : ""}
            aria-current={activeView === view ? "page" : undefined}
            key={view}
            onClick={() => onChange(view)}
          >
            <Icon size={15} aria-hidden="true" />
            {t(`music.${view === "now-playing" ? "nowPlaying" : view}`)}
          </button>
        );
      })}
    </nav>
  );
}

function TrackRows({
  tracks,
  activeTrackId,
  favorites,
  onPlay,
  onQueue,
  onFavorite,
  onPlaylist,
  onRemovePlaylist,
}: {
  tracks: MusicTrack[];
  activeTrackId: string | null;
  favorites: string[];
  onPlay: (trackId: string, queue: string[]) => void;
  onQueue: (trackId: string) => void;
  onFavorite: (trackId: string) => void;
  onPlaylist: (track: MusicTrack) => void;
  onRemovePlaylist?: (trackId: string) => void;
}) {
  const { t } = useTranslation();
  if (tracks.length === 0) {
    return <p className="music-empty music-empty--compact">{t("music.noSearchResults")}</p>;
  }
  return (
    <div className="music-track-table" role="table" aria-label={t("music.library")}>
      <div role="rowgroup">
        <div className="music-track-table__head" role="row">
          <span role="columnheader">{t("music.track")}</span>
          <span role="columnheader">{t("music.album")}</span>
          <span role="columnheader">{t("music.duration")}</span>
          <span role="columnheader">{t("music.actions")}</span>
        </div>
      </div>
      <div className="music-track-table__body" role="rowgroup">
        {tracks.map((track) => {
          const isFavorite = favorites.includes(track.id);
          const isActive = activeTrackId === track.id;
          return (
            <div
              className={`music-track-row${isActive ? " is-active" : ""}`}
              role="row"
              key={track.id}
            >
              <button
                type="button"
                className="music-track-row__main"
                onClick={() => onPlay(track.id, tracks.map((item) => item.id))}
                aria-label={`${t("music.play")} ${track.title}`}
              >
                <MusicArtwork
                  artwork={track.artwork}
                  alt={useArtworkDescription(track)}
                  className="music-track-row__artwork"
                />
                <span className="music-track-row__copy">
                  <strong>{track.title}</strong>
                  <small>{track.artist || t("music.unknownArtist")}</small>
                </span>
                <Play size={14} aria-hidden="true" />
              </button>
              <span className="music-track-row__album">
                {track.album || t("music.unknownAlbum")}
              </span>
              <time className="music-track-row__duration">
                {formatMusicDuration(track.duration)}
              </time>
              <div className="music-track-row__actions">
                <button
                  type="button"
                  aria-label={isFavorite ? t("music.removeFromFavorites") : t("music.addToFavorites")}
                  aria-pressed={isFavorite}
                  onClick={() => onFavorite(track.id)}
                >
                  <Heart size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("music.addToQueue")}
                  onClick={() => onQueue(track.id)}
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("music.addToPlaylist")}
                  onClick={() => onPlaylist(track)}
                >
                  <ListMusic size={15} aria-hidden="true" />
                </button>
                {onRemovePlaylist && (
                  <button
                    type="button"
                    aria-label={`${t("music.removeFromPlaylist")}: ${track.title}`}
                    onClick={() => onRemovePlaylist(track.id)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NowPlayingView() {
  const { t } = useTranslation();
  const track = useMusicStore((state) =>
    state.tracks.find((item) => item.id === state.currentTrackId),
  );
  const isPlaying = useMusicStore((state) => state.isPlaying);
  const currentTime = useMusicStore((state) => state.currentTime);
  const duration = useMusicStore((state) => state.duration);
  const error = useMusicStore((state) => state.error);
  const togglePlayback = useMusicStore((state) => state.togglePlayback);
  const nextTrack = useMusicStore((state) => state.nextTrack);
  const previousTrack = useMusicStore((state) => state.previousTrack);
  const seek = useMusicStore((state) => state.seek);
  const shuffle = useMusicPreferencesStore((state) => state.shuffle);
  const repeat = useMusicPreferencesStore((state) => state.repeat);
  const volume = useMusicPreferencesStore((state) => state.volume);
  const setShuffle = useMusicPreferencesStore((state) => state.setShuffle);
  const setRepeat = useMusicPreferencesStore((state) => state.setRepeat);
  const setVolume = useMusicPreferencesStore((state) => state.setVolume);
  const preferencesRepeatMode = useMusicPreferencesStore((state) => state.repeat);
  const favorites = useMusicPreferencesStore((state) => state.favorites);
  const toggleFavorite = useMusicPreferencesStore((state) => state.toggleFavorite);
  const playedDuration = duration || track?.duration || 0;
  const progress = playedDuration > 0
    ? Math.min(100, (currentTime / playedDuration) * 100)
    : 0;

  const cycleRepeat = () =>
    setRepeat(repeat === "off" ? "all" : repeat === "all" ? "one" : "off");

  if (!track) {
    return (
      <section className="music-empty music-now-empty">
        <span className="music-empty__icon"><Disc3 size={28} aria-hidden="true" /></span>
        <h2>{t("music.noTracks")}</h2>
        <p>{t("music.noTracksHint")}</p>
        <Link to="/music" onClick={() => useMusicPreferencesStore.getState().setView("library")}>
          {t("music.library")} <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <section className="music-now-playing">
      <div className="music-now-playing__cover-wrap">
        <MusicArtwork artwork={track.artwork} alt={t("music.coverFor", { title: track.title })} className="music-now-playing__cover" />
        <span className="music-now-playing__source">
          <span /> {t("music.playingFrom", { name: track.sourceType === "folder" ? t("music.folderSource") : t("music.selectedFiles") })}
        </span>
      </div>
      <div className="music-now-playing__details">
        <p className="music-kicker"><span className="music-live-dot" />{t("music.nowPlaying")}</p>
        <h2>{track.title}</h2>
        <p className="music-now-playing__artist">{track.artist || t("music.unknownArtist")}</p>
        <p className="music-now-playing__album">{track.album || t("music.unknownAlbum")}</p>

        <div className="music-seek">
          <input
            type="range"
            min={0}
            max={playedDuration || 1}
            step={1}
            value={Math.min(currentTime, playedDuration || 0)}
            aria-label={t("music.seek")}
            style={{ "--music-progress": `${progress}%` } as React.CSSProperties}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            disabled={!playedDuration}
          />
          <div className="music-seek__time">
            <time>{formatMusicDuration(currentTime)}</time>
            <time>{formatMusicDuration(playedDuration || null)}</time>
          </div>
        </div>

        <div className="music-playback-controls">
          <button
            type="button"
            className={shuffle ? "is-active" : ""}
            aria-label={t("music.shuffle")}
            aria-pressed={shuffle}
            onClick={() => setShuffle(!shuffle)}
          >
            <Shuffle size={17} aria-hidden="true" />
          </button>
          <button type="button" aria-label={t("music.previous")} onClick={() => void previousTrack()}>
            <SkipBack size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="music-playback-controls__primary"
            aria-label={isPlaying ? t("music.pause") : t("music.play")}
            onClick={() => void togglePlayback()}
          >
            {isPlaying ? <Pause size={21} fill="currentColor" aria-hidden="true" /> : <Play size={21} fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" aria-label={t("music.next")} onClick={() => void nextTrack()}>
            <SkipForward size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={repeat !== "off" ? "is-active" : ""}
            aria-label={t(`music.repeat${repeat === "one" ? "One" : repeat === "all" ? "All" : "Off"}`)}
            aria-pressed={repeat !== "off"}
            onClick={cycleRepeat}
          >
            {repeat === "one" ? <span className="music-repeat-one">1</span> : <Repeat size={17} aria-hidden="true" />}
          </button>
        </div>

        <label className="music-volume">
          <Volume2 size={16} aria-hidden="true" />
          <span>{t("music.volume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.currentTarget.value))}
            aria-label={t("music.volume")}
          />
        </label>
        {error && <p className="music-error" role="alert">{t(`music.errors.${error}`)}</p>}
      </div>
      <button
        type="button"
        className="music-now-playing__favorite"
        aria-label={t(favorites.includes(track.id) ? "music.removeFromFavorites" : "music.addToFavorites")}
        aria-pressed={favorites.includes(track.id)}
        onClick={() => toggleFavorite(track.id)}
      >
        <Heart size={19} aria-hidden="true" />
      </button>
      <span className="music-now-playing__duration" aria-hidden="true">
        {formatMusicDuration(currentTime)} / {formatMusicDuration(playedDuration || null)}
      </span>
      <span className="sr-only" aria-live="polite">
        {preferencesRepeatMode !== "off" ? t(`music.repeat${preferencesRepeatMode === "one" ? "One" : "All"}`) : ""}
      </span>
    </section>
  );
}

function QueuePanel() {
  const { t } = useTranslation();
  const queue = useMusicStore((state) => state.queue);
  const queueIndex = useMusicStore((state) => state.queueIndex);
  const tracks = useMusicStore((state) => state.tracks);
  const removeFromQueue = useMusicStore((state) => state.removeFromQueue);
  const playQueueIndex = useMusicStore((state) => state.playQueueIndex);
  const clearQueue = useMusicStore((state) => state.clearQueue);
  const queueTracks = queue
    .map((trackId, index) => ({ track: tracks.find((item) => item.id === trackId), index }))
    .filter((item): item is { track: MusicTrack; index: number } => item.track !== undefined);
  return (
    <section className="music-queue" aria-labelledby="music-queue-title">
      <header className="music-section-heading">
        <div>
          <p className="music-kicker">{t("music.queue")}</p>
          <h2 id="music-queue-title">{t("music.queue")}</h2>
        </div>
        <button type="button" onClick={clearQueue} disabled={queue.length === 0} aria-label={t("music.clearQueue")}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      {queueTracks.length === 0 ? (
        <p className="music-empty music-empty--compact">{t("music.queueEmpty")}</p>
      ) : (
        <ol className="music-queue__list">
          {queueTracks.map(({ track, index }) => (
            <li className={index === queueIndex ? "is-current" : ""} key={`${track.id}-${index}`}>
              <button type="button" onClick={() => void playQueueIndex(index)}>
                <span className="music-queue__index">{index === queueIndex ? <Play size={11} /> : String(index + 1).padStart(2, "0")}</span>
                <span className="music-queue__copy">
                  <strong>{track.title}</strong>
                  <small>{track.artist || t("music.unknownArtist")}</small>
                </span>
              </button>
              {index !== queueIndex && (
                <button
                  type="button"
                  aria-label={`${t("music.removeFromQueue")}: ${track.title}`}
                  onClick={() => removeFromQueue(index)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SuggestedTracks({ tracks, currentTrackId, onPlay, onQueue }: {
  tracks: MusicTrack[];
  currentTrackId: string | null;
  onPlay: (trackId: string, queue: string[]) => void;
  onQueue: (trackId: string) => void;
}) {
  const { t } = useTranslation();
  const alternatives = tracks.filter((track) => track.id !== currentTrackId);
  const suggestions = sortMusicTracks(alternatives.length ? alternatives : tracks, "recent").slice(0, 4);
  return (
    <section className="music-suggestions" aria-labelledby="music-suggestions-title">
      <header className="music-section-heading">
        <div>
          <p className="music-kicker">{t("music.library")}</p>
          <h2 id="music-suggestions-title">{t("music.suggested")}</h2>
        </div>
        <button type="button" className="music-button music-button--quiet" onClick={() => useMusicPreferencesStore.getState().setView("library")}>
          {t("music.library")}
        </button>
      </header>
      {suggestions.length === 0 ? (
        <div className="music-suggestions__empty">
          <Music2 size={17} aria-hidden="true" />
          <span>{t("music.suggestedEmpty")}</span>
        </div>
      ) : (
        <div className="music-suggestions__list">
          {suggestions.map((track) => (
            <article className="music-suggestion" key={track.id}>
              <MusicArtwork
                artwork={track.artwork}
                alt={t("music.coverFor", { title: track.title })}
                className="music-suggestion__artwork"
              />
              <button
                type="button"
                className="music-suggestion__track"
                onClick={() => onPlay(track.id, suggestions.map((item) => item.id))}
              >
                <strong>{track.title}</strong>
                <span>{track.artist || t("music.unknownArtist")}</span>
              </button>
              <button
                type="button"
                className="music-suggestion__queue"
                aria-label={`${t("music.addToQueue")}: ${track.title}`}
                onClick={() => onQueue(track.id)}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function MusicPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const probeStartedRef = useRef(new Set<string>());
  const activeView = useMusicPreferencesStore((state) => state.view);
  const setActiveView = useMusicPreferencesStore((state) => state.setView);
  const favorites = useMusicPreferencesStore((state) => state.favorites);
  const playlists = useMusicPreferencesStore((state) => state.playlists);
  const toggleFavorite = useMusicPreferencesStore((state) => state.toggleFavorite);
  const createPlaylist = useMusicPreferencesStore((state) => state.createPlaylist);
  const updatePlaylist = useMusicPreferencesStore((state) => state.updatePlaylist);
  const deletePlaylist = useMusicPreferencesStore((state) => state.deletePlaylist);
  const addTrackToPlaylist = useMusicPreferencesStore((state) => state.addTrackToPlaylist);
  const removeTrackFromPlaylist = useMusicPreferencesStore((state) => state.removeTrackFromPlaylist);
  const tracks = useMusicStore((state) => state.tracks);
  const currentTrackId = useMusicStore((state) => state.currentTrackId);
  const setTracks = useMusicStore((state) => state.setTracks);
  const playTrack = useMusicStore((state) => state.playTrack);
  const addToQueue = useMusicStore((state) => state.addToQueue);
  const floatingPlayerEnabled = useMusicPreferencesStore((state) => state.floatingPlayerEnabled);
  const setFloatingPlayerEnabled = useMusicPreferencesStore((state) => state.setFloatingPlayerEnabled);
  const updateTrackDuration = useMusicStore((state) => state.updateTrackDuration);
  const [folderStatus, setFolderStatus] = useState<MusicFolderStatus>({ kind: "none" });
  const [scanBusy, setScanBusy] = useState(false);
  const [scanReport, setScanReport] = useState<MusicScanResult | null>(null);
  const [folderError, setFolderError] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"title" | "artist" | "album" | "recent">("title");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MusicDialog | null>(null);
  const [dialogName, setDialogName] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [dialogCover, setDialogCover] = useState<string>();
  const [dialogPlaylistId, setDialogPlaylistId] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSavedMusicFolder()
      .then(async (status) => {
        if (!active) return;
        setFolderStatus(status);
        if (status.kind === "ready" && useMusicStore.getState().tracks.length === 0) {
          setScanBusy(true);
          try {
            const result = await scanMusicFolder(status.source);
            if (active) {
              setTracks(result.tracks);
              setScanReport(result);
            }
          } catch (error) {
            console.error("Could not rescan the saved music folder.", error);
            if (active) setFolderError(true);
          } finally {
            if (active) setScanBusy(false);
          }
        }
      })
      .catch((error) => {
        console.error("Could not load the saved music folder.", error);
        if (active) setFolderError(true);
      });
    return () => {
      active = false;
    };
  }, [setTracks]);

  useEffect(() => {
    if (!dialog) return;
    const element = dialogRef.current;
    if (!element) return;
    element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, [dialog]);

  const playlist = playlists.find((item) => item.id === selectedPlaylistId) ?? null;
  useEffect(() => {
    if (!selectedPlaylistId && playlists.length > 0) {
      setSelectedPlaylistId(playlists[0].id);
    }
  }, [playlists, selectedPlaylistId]);
  const baseTracks = useMemo(() => {
    if (activeView === "favorites") {
      return tracks.filter((track) => favorites.includes(track.id));
    }
    if (activeView === "playlists" && playlist) {
      const byId = new Map(tracks.map((track) => [track.id, track]));
      return playlist.trackIds.map((id) => byId.get(id)).filter((track): track is MusicTrack => track !== undefined);
    }
    return tracks;
  }, [activeView, favorites, playlist, tracks]);

  const sortedTracks = useMemo(
    () => sortMusicTracks(baseTracks, sortBy),
    [baseTracks, sortBy],
  );
  const filteredTracks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? sortedTracks.filter((track) =>
          `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`.toLocaleLowerCase().includes(query),
        )
      : sortedTracks;
  }, [search, sortedTracks]);
  const visibleTracks = filteredTracks.slice(0, visibleCount);
  const unresolvedIds = visibleTracks
    .filter((track) => track.duration === null && !probeStartedRef.current.has(track.id))
    .map((track) => track.id)
    .join("|");

  useEffect(() => {
    if (!unresolvedIds) return;
    const ids = unresolvedIds.split("|");
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const track = useMusicStore.getState().tracks.find((item) => item.id === id);
        if (!track || probeStartedRef.current.has(id)) continue;
        probeStartedRef.current.add(id);
        try {
          const duration = await probeAudioDuration(track.file);
          if (duration !== null) updateTrackDuration(id, duration);
        } catch (error) {
          console.error(`Could not read the duration for "${track.fileName}".`, error);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()));
  }, [unresolvedIds, updateTrackDuration]);

  const addScanResult = (result: MusicScanResult, replace = false) => {
    const currentTracks = useMusicStore.getState().tracks;
    const retained = replace
      ? currentTracks.filter((track) => track.sourceType !== "folder")
      : currentTracks;
    const merged = [
      ...retained,
      ...result.tracks.filter((track) => !retained.some((existing) => existing.id === track.id)),
    ];
    setTracks(merged);
    setScanReport(result);
    setVisibleCount(PAGE_SIZE);
  };

  const scanFolder = async (source: Awaited<ReturnType<typeof chooseMusicFolder>>) => {
    if (!source) return;
    setScanBusy(true);
    setFolderError(false);
    try {
      setFolderStatus({ kind: "ready", source });
      const result = await scanMusicFolder(source);
      addScanResult(result, true);
    } catch (error) {
      console.error("Could not read the selected music folder.", error);
      setFolderError(true);
    } finally {
      setScanBusy(false);
    }
  };

  const handleChooseFolder = async () => {
    if (!supportsMusicFolderPicker()) return;
    try {
      await scanFolder(await chooseMusicFolder());
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not choose a music folder.", error);
      setFolderError(true);
    }
  };

  const handleReconnectFolder = async () => {
    if (folderStatus.kind !== "permission-required") return;
    setScanBusy(true);
    setFolderError(false);
    try {
      const granted = await requestMusicFolderPermission(folderStatus.source);
      if (!granted) {
        setFolderError(true);
        return;
      }
      await scanFolder(folderStatus.source);
    } catch (error) {
      console.error("Could not reconnect the music folder.", error);
      setFolderError(true);
    } finally {
      setScanBusy(false);
    }
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files;
    if (!selected?.length) return;
    setScanBusy(true);
    try {
      const result = await scanSelectedMusicFiles(selected);
      addScanResult(result);
    } catch (error) {
      console.error("Could not read the selected audio files.", error);
      setFolderError(true);
    } finally {
      setScanBusy(false);
      input.value = "";
    }
  };

  const handleForgetFolder = async () => {
    const sourceTracks = useMusicStore.getState().tracks;
    const remaining = sourceTracks.filter((track) => track.sourceType !== "folder");
    try {
      await forgetMusicFolder();
      setTracks(remaining);
      setFolderStatus({ kind: supportsMusicFolderPicker() ? "none" : "unsupported" });
      setScanReport(null);
      setFolderError(false);
    } catch (error) {
      console.error("Could not forget the saved music folder.", error);
      setFolderError(true);
    }
  };

  const openDialog = (next: MusicDialog) => {
    setDialogName(next.kind === "edit" ? next.playlist.name : "");
    setDialogDescription(next.kind === "edit" ? next.playlist.description ?? "" : "");
    setDialogCover(next.kind === "edit" ? next.playlist.cover : undefined);
    setDialogPlaylistId(playlists[0]?.id ?? "");
    setDialogError(null);
    setDialog(next);
  };

  const closeDialog = () => {
    dialogRef.current?.close();
    setDialog(null);
    setDialogError(null);
  };

  const handlePlaylistCoverSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      setDialogCover(await createPlaylistCover(file));
      setDialogError(null);
    } catch (error) {
      console.error("Could not process the selected playlist cover.", error);
      setDialogError("invalidCover");
    }
  };

  const submitDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === "create") {
      const created = createPlaylist(dialogName, {
        description: dialogDescription,
        cover: dialogCover,
      });
      if (!created) {
        setDialogError("playlistNameRequired");
        return;
      }
      if (dialog.trackToAdd) addTrackToPlaylist(created.id, dialog.trackToAdd.id);
      setSelectedPlaylistId(created.id);
    } else if (dialog.kind === "edit") {
      if (!updatePlaylist(dialog.playlist.id, {
        name: dialogName,
        description: dialogDescription,
        cover: dialogCover,
      })) {
        setDialogError("playlistNameRequired");
        return;
      }
    } else if (dialog.kind === "add") {
      if (!dialogPlaylistId) {
        setDialogError("noPlaylists");
        return;
      }
      addTrackToPlaylist(dialogPlaylistId, dialog.track.id);
      setSelectedPlaylistId(dialogPlaylistId);
    }
    closeDialog();
  };

  const deleteCurrentPlaylist = (item: MusicPlaylist) => {
    deletePlaylist(item.id);
    setSelectedPlaylistId((current) => current === item.id ? null : current);
    closeDialog();
  };

  const libraryActions = {
    activeTrackId: currentTrackId,
    favorites,
    onPlay: (trackId: string, nextQueue: string[]) => void playTrack(trackId, nextQueue),
    onQueue: addToQueue,
    onFavorite: toggleFavorite,
    onPlaylist: (track: MusicTrack) => openDialog({ kind: "add", track }),
  };

  return (
    <section className="music-page">
      <header className="music-page__header">
        <div>
          <h1>{t("music.title")}</h1>
          <p className="music-page__subtitle">{t("music.subtitle")}</p>
        </div>
        <div className="music-page__actions">
          <button
            type="button"
            className={`music-button ${floatingPlayerEnabled ? "music-button--primary" : "music-button--quiet"}`}
            aria-pressed={floatingPlayerEnabled}
            onClick={() => setFloatingPlayerEnabled(!floatingPlayerEnabled)}
          >
            <PictureInPicture2 size={15} aria-hidden="true" />
            {floatingPlayerEnabled ? t("music.hideMiniPlayer") : t("music.showMiniPlayer")}
          </button>
          <button type="button" className="music-button music-button--quiet" onClick={() => fileInputRef.current?.click()} disabled={scanBusy}>
            <Plus size={16} aria-hidden="true" /> {t("music.addFiles")}
          </button>
          {supportsMusicFolderPicker() && (
            <button type="button" className="music-button music-button--primary" onClick={() => void handleChooseFolder()} disabled={scanBusy}>
              <FolderOpen size={16} aria-hidden="true" /> {t("music.chooseFolder")}
            </button>
          )}
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".aac,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,audio/*"
            multiple
            onChange={(event) => void handleFilesSelected(event)}
            aria-label={t("music.addFiles")}
          />
        </div>
      </header>

      <MusicTabs activeView={activeView} onChange={(view) => setActiveView(view)} />

      <section className="music-source-status" aria-live="polite">
        <p><span className="music-source-status__dot" />{t("music.localOnly")}</p>
        {folderStatus.kind === "ready" && (
          <div>
            <span>{t("music.folderReady", { name: folderStatus.source.name })}</span>
            <button type="button" onClick={() => void handleForgetFolder()} disabled={scanBusy}>{t("music.forgetFolder")}</button>
          </div>
        )}
        {folderStatus.kind === "permission-required" && (
          <div>
            <span>{t("music.folderPermission", { name: folderStatus.source.name })}</span>
            <button type="button" onClick={() => void handleReconnectFolder()} disabled={scanBusy}>{t("music.reconnectFolder")}</button>
          </div>
        )}
        {folderStatus.kind === "unsupported" && <span>{t("music.folderUnsupported")}</span>}
        {!supportsMusicFolderPicker() && <span>{t("music.fileFallback")}</span>}
        {scanBusy && <span className="music-source-status__busy"><LoaderCircle size={13} aria-hidden="true" /> {t("music.scanning")}</span>}
        {folderError && <span className="music-error" role="alert">{t("music.errors.source")}</span>}
        {scanReport && (
          <span>
            {t("music.scanComplete", { count: scanReport.tracks.length })}
            {scanReport.unsupportedCount > 0 && ` ${t("music.unsupportedFiles", { count: scanReport.unsupportedCount })}`}
            {scanReport.inaccessibleCount > 0 && ` ${t("music.inaccessibleFiles", { count: scanReport.inaccessibleCount })}`}
          </span>
        )}
      </section>

      {activeView === "now-playing" && (
        <div className="music-main-layout">
          <div className="music-main-layout__primary">
            <NowPlayingView />
            <SuggestedTracks
              tracks={tracks}
              currentTrackId={currentTrackId}
              onPlay={(trackId, queue) => void playTrack(trackId, queue)}
              onQueue={addToQueue}
            />
          </div>
          <QueuePanel />
        </div>
      )}

      {activeView === "library" && (
        <section className="music-library">
          <div className="music-section-heading music-library__heading">
            <div>
              <p className="music-kicker">{t("music.localOnly")}</p>
              <h2>{t("music.library")} <span>{tracks.length}</span></h2>
            </div>
            <label className="music-search">
              <Search size={16} aria-hidden="true" />
              <input value={search} onChange={(event) => { setSearch(event.currentTarget.value); setVisibleCount(PAGE_SIZE); }} placeholder={t("music.search")} aria-label={t("music.search")} />
              {search && <button type="button" onClick={() => setSearch("")} aria-label={t("music.cancel")}><X size={14} /></button>}
            </label>
            <label className="music-sort">
              <span>{t("music.sortBy")}</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.currentTarget.value as typeof sortBy)}>
                <option value="title">{t("music.sortTitle")}</option>
                <option value="artist">{t("music.sortArtist")}</option>
                <option value="album">{t("music.sortAlbum")}</option>
                <option value="recent">{t("music.sortRecent")}</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>
          {tracks.length === 0 ? (
            <div className="music-empty">
              <span className="music-empty__icon"><FolderOpen size={26} aria-hidden="true" /></span>
              <h2>{t("music.noTracks")}</h2>
              <p>{t("music.noTracksHint")}</p>
            </div>
          ) : filteredTracks.length === 0 ? (
            <p className="music-empty music-empty--compact">{t("music.noSearchResults")}</p>
          ) : (
            <>
              <TrackRows tracks={visibleTracks} {...libraryActions} />
              {visibleCount < filteredTracks.length && (
                <button className="music-show-more" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  {t("music.showMore")} ({filteredTracks.length - visibleCount})
                </button>
              )}
            </>
          )}
        </section>
      )}

      {activeView === "favorites" && (
        <section className="music-library">
          <div className="music-section-heading music-library__heading">
            <div><p className="music-kicker">{t("music.favorites")}</p><h2>{t("music.favorites")} <span>{favorites.length}</span></h2></div>
          </div>
          {favorites.length === 0 ? (
            <div className="music-empty"><span className="music-empty__icon"><Heart size={25} aria-hidden="true" /></span><h2>{t("music.noFavorites")}</h2><p>{t("music.noTracksHint")}</p></div>
          ) : visibleTracks.length === 0 ? (
            <p className="music-empty music-empty--compact">{t("music.fileFallback")}</p>
          ) : (
            <>
              <TrackRows tracks={visibleTracks} {...libraryActions} />
              {visibleCount < filteredTracks.length && <button className="music-show-more" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>{t("music.showMore")}</button>}
            </>
          )}
        </section>
      )}

      {activeView === "playlists" && (
        <section className="music-playlists-page">
          <aside className="music-playlists">
            <header className="music-section-heading">
              <div><p className="music-kicker">{t("music.library")}</p><h2>{t("music.playlists")}</h2></div>
              <button type="button" onClick={() => openDialog({ kind: "create" })} aria-label={t("music.createPlaylist")}><Plus size={16} /></button>
            </header>
            {playlists.length === 0 ? (
              <p className="music-empty music-empty--compact">{t("music.noPlaylists")}</p>
            ) : (
              <ul>
                {playlists.map((item) => (
                  <li className={item.id === playlist?.id ? "is-selected" : ""} key={item.id}>
                    <button className="music-playlists__select" type="button" onClick={() => setSelectedPlaylistId(item.id)}>
                      {item.cover
                        ? <img className="music-playlists__cover" src={item.cover} alt="" />
                        : <span className="music-playlists__cover music-playlists__cover--empty"><ListMusic size={16} aria-hidden="true" /></span>}
                      <span><strong>{item.name}</strong><small>{item.description || t("music.trackCount", { count: item.trackIds.length })}</small></span>
                    </button>
                    <button type="button" aria-label={`${t("music.play")}: ${item.name}`} onClick={() => {
                      const byId = new Map(tracks.map((track) => [track.id, track]));
                      const available = item.trackIds.map((id) => byId.get(id)).filter((track): track is MusicTrack => track !== undefined);
                      if (available.length) void playTrack(available[0].id, available.map((track) => track.id));
                    }}><Play size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label={`${t("music.editPlaylist")}: ${item.name}`} onClick={() => openDialog({ kind: "edit", playlist: item })}><Pencil size={14} aria-hidden="true" /></button>
                    <button type="button" aria-label={`${t("music.deletePlaylist")}: ${item.name}`} onClick={() => openDialog({ kind: "delete", playlist: item })}><Trash2 size={14} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <div className="music-library">
            {playlist ? (
              <>
                <div className="music-section-heading music-library__heading music-playlist-detail__heading">
                  <div className="music-playlist-detail__identity">
                    {playlist.cover
                      ? <img className="music-playlist-detail__cover" src={playlist.cover} alt="" />
                      : <span className="music-playlist-detail__cover music-playlist-detail__cover--empty"><ListMusic size={22} aria-hidden="true" /></span>}
                    <div>
                      <p className="music-kicker">{t("music.playlists")}</p>
                      <h2>{playlist.name} <span>{baseTracks.length}</span></h2>
                      {playlist.description && <p className="music-playlist-detail__description">{playlist.description}</p>}
                    </div>
                  </div>
                  <button className="music-button music-button--quiet" type="button" onClick={() => openDialog({ kind: "edit", playlist })}>
                    <Pencil size={14} aria-hidden="true" /> {t("music.editPlaylist")}
                  </button>
                  {baseTracks.length > 0 && (
                    <button className="music-button music-button--quiet" type="button" onClick={() => void playTrack(baseTracks[0].id, playlist.trackIds.filter((id) => tracks.some((track) => track.id === id)))}>
                      <Play size={14} aria-hidden="true" /> {t("music.play")}
                    </button>
                  )}
                </div>
                {baseTracks.length === 0 ? (
                  <p className="music-empty music-empty--compact">{playlist.trackIds.length ? t("music.fileFallback") : t("music.playlistEmpty")}</p>
                ) : (
                  <TrackRows
                    tracks={baseTracks}
                    {...libraryActions}
                    onRemovePlaylist={(trackId) => removeTrackFromPlaylist(playlist.id, trackId)}
                    onQueue={(trackId) => {
                      addToQueue(trackId);
                    }}
                  />
                )}
              </>
            ) : (
              <div className="music-empty">
                <span className="music-empty__icon"><ListMusic size={26} aria-hidden="true" /></span>
                <h2>{t("music.noPlaylists")}</h2>
                <button className="music-button music-button--quiet" type="button" onClick={() => openDialog({ kind: "create" })}><Plus size={15} aria-hidden="true" />{t("music.createPlaylist")}</button>
              </div>
            )}
          </div>
        </section>
      )}

      {dialog && (
        <dialog
          ref={dialogRef}
          className="music-dialog"
          onCancel={(event) => { event.preventDefault(); closeDialog(); }}
          onClose={() => { if (dialog) setDialog(null); }}
        >
          <form onSubmit={submitDialog}>
            <header>
              <h2>
                {dialog.kind === "create" ? t("music.createPlaylist")
                  : dialog.kind === "edit" ? t("music.editPlaylist")
                    : dialog.kind === "delete" ? t("music.deletePlaylist")
                      : t("music.addToPlaylist")}
              </h2>
              <button type="button" aria-label={t("music.cancel")} onClick={closeDialog}><X size={17} /></button>
            </header>
            {(dialog.kind === "create" || dialog.kind === "edit") && (
              <>
                <label>
                  <span>{t("music.playlistName")}</span>
                  <input autoFocus maxLength={80} required value={dialogName} onChange={(event) => setDialogName(event.currentTarget.value)} />
                </label>
                <label>
                  <span>{t("music.playlistDescription")}</span>
                  <textarea maxLength={500} rows={3} value={dialogDescription} onChange={(event) => setDialogDescription(event.currentTarget.value)} placeholder={t("music.playlistDescriptionHint")} />
                </label>
                <div className="music-playlist-cover-field">
                  <span>{t("music.playlistCover")}</span>
                  <div className="music-playlist-cover-field__controls">
                    {dialogCover
                      ? <img src={dialogCover} alt={t("music.playlistCoverPreview")} />
                      : <span><Music2 size={20} aria-hidden="true" /></span>}
                    <button type="button" className="music-button music-button--quiet" onClick={() => coverInputRef.current?.click()}>
                      {dialogCover ? t("music.changePlaylistCover") : t("music.choosePlaylistCover")}
                    </button>
                    {dialogCover && (
                      <button type="button" className="music-button music-button--quiet" onClick={() => setDialogCover(undefined)}>
                        <X size={14} aria-hidden="true" /> {t("music.removePlaylistCover")}
                      </button>
                    )}
                  </div>
                  <input ref={coverInputRef} className="sr-only" type="file" accept="image/*" aria-label={t("music.choosePlaylistCover")} onChange={(event) => void handlePlaylistCoverSelected(event)} />
                </div>
              </>
            )}
            {dialog.kind === "add" && (
              playlists.length > 0 ? (
                <label>
                  <span>{t("music.selectPlaylist")}</span>
                  <select autoFocus required value={dialogPlaylistId} onChange={(event) => setDialogPlaylistId(event.currentTarget.value)}>
                    <option value="" disabled>{t("music.selectPlaylist")}</option>
                    {playlists.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
              ) : (
                <button type="button" className="music-button music-button--quiet" onClick={() => setDialog({ kind: "create", trackToAdd: dialog.track })}>
                  <Plus size={15} aria-hidden="true" /> {t("music.createPlaylist")}
                </button>
              )
            )}
            {dialog.kind === "delete" && <p>{t("music.confirmDeletePlaylist", { name: dialog.playlist.name })}</p>}
            {dialogError && <p className="music-error" role="alert">{t(`music.errors.${dialogError}`)}</p>}
            <footer>
              <button type="button" className="music-button music-button--quiet" onClick={closeDialog}>{t("music.cancel")}</button>
              {dialog.kind === "delete" ? (
                <button type="button" className="music-button music-button--danger" onClick={() => deleteCurrentPlaylist(dialog.playlist)}>{t("music.confirmRemove")}</button>
              ) : (
                <button type="submit" className="music-button music-button--primary" disabled={dialog.kind === "add" && playlists.length === 0}>
                  <Check size={15} aria-hidden="true" /> {dialog.kind === "add" ? t("music.confirmAdd") : t("music.save")}
                </button>
              )}
            </footer>
          </form>
        </dialog>
      )}
      {activeView !== "now-playing" && currentTrackId && (
        <aside className="music-queue-dock"><QueuePanel /></aside>
      )}
    </section>
  );
}
