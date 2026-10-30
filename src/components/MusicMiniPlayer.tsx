import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Grip, Maximize2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { MusicArtwork } from "./MusicArtwork";
import { formatMusicDuration, type MusicFloatingPlayerBounds } from "../data/music";
import { useMusicPreferencesStore, useMusicStore } from "../stores/music-store";
import { useScreensaver } from "./Screensaver";

type Interaction = {
  pointerId: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  bounds: MusicFloatingPlayerBounds;
};

function clampBounds(bounds: MusicFloatingPlayerBounds): MusicFloatingPlayerBounds {
  const maxWidth = Math.max(240, Math.min(520, window.innerWidth - 24));
  const maxHeight = Math.max(108, Math.min(260, window.innerHeight - 24));
  const width = Math.max(Math.min(260, maxWidth), Math.min(maxWidth, bounds.width));
  const height = Math.max(Math.min(108, maxHeight), Math.min(maxHeight, bounds.height));
  return {
    width,
    height,
    right: Math.max(12, Math.min(window.innerWidth - width - 12, bounds.right)),
    bottom: Math.max(12, Math.min(window.innerHeight - height - 12, bounds.bottom)),
  };
}

export function MusicMiniPlayer({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const { isActive: screensaverActive } = useScreensaver();
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
  const enabled = useMusicPreferencesStore((state) => state.floatingPlayerEnabled);
  const storedBounds = useMusicPreferencesStore((state) => state.floatingPlayerBounds);
  const setEnabled = useMusicPreferencesStore((state) => state.setFloatingPlayerEnabled);
  const saveBounds = useMusicPreferencesStore((state) => state.setFloatingPlayerBounds);
  const [draftBounds, setDraftBounds] = useState<MusicFloatingPlayerBounds | null>(null);
  const interaction = useRef<Interaction | null>(null);

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const active = interaction.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const next = active.mode === "move"
        ? { ...active.bounds, right: active.bounds.right - dx, bottom: active.bounds.bottom - dy }
        : { ...active.bounds, width: active.bounds.width + dx, height: active.bounds.height + dy };
      setDraftBounds(clampBounds(next));
    };
    const onPointerEnd = (event: globalThis.PointerEvent) => {
      if (!interaction.current || interaction.current.pointerId !== event.pointerId) return;
      interaction.current = null;
      setDraftBounds((draft) => {
        if (draft) saveBounds(clampBounds(draft));
        return null;
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [saveBounds]);

  if (!track || !enabled || hidden || screensaverActive) return null;

  const bounds = clampBounds(draftBounds ?? storedBounds);
  const startInteraction = (event: PointerEvent<HTMLButtonElement>, mode: Interaction["mode"]) => {
    event.preventDefault();
    interaction.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      bounds,
    };
    setDraftBounds(bounds);
  };
  const adjustWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    mode: Interaction["mode"],
  ) => {
    const directions: Record<string, Partial<MusicFloatingPlayerBounds>> = {
      ArrowLeft: mode === "move" ? { right: 16 } : { width: -16 },
      ArrowRight: mode === "move" ? { right: -16 } : { width: 16 },
      ArrowUp: mode === "move" ? { bottom: -16 } : { height: -16 },
      ArrowDown: mode === "move" ? { bottom: 16 } : { height: 16 },
    };
    const changes = directions[event.key];
    if (!changes) return;
    event.preventDefault();
    const next = clampBounds({
      right: bounds.right + (changes.right ?? 0),
      bottom: bounds.bottom + (changes.bottom ?? 0),
      width: bounds.width + (changes.width ?? 0),
      height: bounds.height + (changes.height ?? 0),
    });
    setDraftBounds(next);
    saveBounds(next);
  };
  const progressDuration = duration || track.duration || 0;
  const progress = progressDuration > 0
    ? Math.min(100, (currentTime / progressDuration) * 100)
    : 0;

  return (
    <aside
      className="music-mini-player"
      aria-label={t("music.miniPlayer")}
      style={{
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      <header className="music-mini-player__header">
        <button
          type="button"
          className="music-mini-player__move"
          aria-label={t("music.moveMiniPlayer")}
          title={t("music.moveMiniPlayer")}
          onPointerDown={(event) => startInteraction(event, "move")}
          onKeyDown={(event) => adjustWithKeyboard(event, "move")}
        >
          <Grip size={14} aria-hidden="true" />
          <span>{t("music.miniPlayer")}</span>
        </button>
        <button
          type="button"
          className="music-mini-player__close"
          aria-label={t("music.hideMiniPlayer")}
          title={t("music.hideMiniPlayer")}
          onClick={() => setEnabled(false)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="music-mini-player__main">
        <MusicArtwork
          artwork={track.artwork}
          alt={t("music.coverFor", { title: track.title })}
          className="music-mini-player__artwork"
        />
        <Link className="music-mini-player__track" to="/music">
          <strong>{track.title}</strong>
          <span>{track.artist || t("music.unknownArtist")}</span>
        </Link>
        <div className="music-mini-player__controls">
          <button type="button" onClick={() => void previousTrack()} aria-label={t("music.previous")}>
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="music-mini-player__play"
            onClick={() => void togglePlayback()}
            aria-label={isPlaying ? t("music.pause") : t("music.play")}
          >
            {isPlaying ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => void nextTrack()} aria-label={t("music.next")}>
            <SkipForward size={15} aria-hidden="true" />
          </button>
        </div>
        <span className="music-mini-player__time" aria-hidden="true">
          {formatMusicDuration(currentTime)} / {formatMusicDuration(progressDuration || null)}
        </span>
      </div>
      <div className="music-mini-player__progress">
        <span
          role="progressbar"
          aria-label={t("music.playbackProgress")}
          aria-valuemin={0}
          aria-valuemax={progressDuration}
          aria-valuenow={currentTime}
          style={{ "--music-progress": `${progress}%` } as React.CSSProperties}
        />
      </div>
      {error && <span className="music-mini-player__error" role="status">{t(`music.errors.${error}`)}</span>}
      <button
        type="button"
        className="music-mini-player__resize"
        aria-label={t("music.resizeMiniPlayer")}
        title={t("music.resizeMiniPlayer")}
        onPointerDown={(event) => startInteraction(event, "resize")}
        onKeyDown={(event) => adjustWithKeyboard(event, "resize")}
      >
        <Maximize2 size={11} aria-hidden="true" />
      </button>
    </aside>
  );
}
