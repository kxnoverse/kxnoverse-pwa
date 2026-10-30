import type { MusicTrack } from "./music";

type MusicAudioEvent = "play" | "pause" | "timeupdate" | "loadedmetadata" | "ended" | "error";

export interface MusicAudioPort {
  currentTime: number;
  duration: number;
  volume: number;
  src: string;
  paused: boolean;
  preload: string;
  error?: MediaError | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute?(name: string): void;
  addEventListener(type: MusicAudioEvent, listener: EventListener): void;
  removeEventListener(type: MusicAudioEvent, listener: EventListener): void;
}

interface MusicPlaybackCallbacks {
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (currentTime: number, duration: number) => void;
  onMetadata: (duration: number) => void;
  onEnded: () => void;
  onError: (errorCode: number | null) => void;
}

export class MusicPlaybackController {
  private objectUrl: string | null = null;
  private trackId: string | null = null;
  private readonly listeners: Array<[MusicAudioEvent, EventListener]>;

  constructor(
    private readonly audio: MusicAudioPort,
    callbacks: MusicPlaybackCallbacks,
    private readonly createObjectUrl = (file: File) => URL.createObjectURL(file),
    private readonly revokeObjectUrl = (url: string) => URL.revokeObjectURL(url),
  ) {
    audio.preload = "metadata";
    this.listeners = [
      ["play", () => callbacks.onPlayingChange(true)],
      ["pause", () => callbacks.onPlayingChange(false)],
      ["timeupdate", () =>
        callbacks.onTimeChange(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0)],
      ["loadedmetadata", () =>
        callbacks.onMetadata(Number.isFinite(audio.duration) ? audio.duration : 0)],
      ["ended", callbacks.onEnded],
      ["error", () => callbacks.onError(audio.error?.code ?? null)],
    ];
    for (const [event, listener] of this.listeners) {
      audio.addEventListener(event, listener);
    }
  }

  get currentTrackId(): string | null {
    return this.trackId;
  }

  load(track: MusicTrack): void {
    this.releaseSource();
    this.objectUrl = this.createObjectUrl(track.file);
    this.trackId = track.id;
    this.audio.currentTime = 0;
    this.audio.src = this.objectUrl;
    this.audio.load();
  }

  play(): Promise<void> {
    return this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): Promise<void> | void {
    if (this.audio.paused) return this.play();
    this.pause();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const upperBound = Number.isFinite(this.audio.duration) ? this.audio.duration : seconds;
    this.audio.currentTime = Math.max(0, Math.min(upperBound, seconds));
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  dispose(): void {
    for (const [event, listener] of this.listeners) {
      this.audio.removeEventListener(event, listener);
    }
    this.audio.pause();
    this.releaseSource();
  }

  clear(): void {
    this.releaseSource();
  }

  private releaseSource(): void {
    this.audio.pause();
    this.audio.removeAttribute?.("src");
    this.audio.src = "";
    this.audio.load();
    if (this.objectUrl) this.revokeObjectUrl(this.objectUrl);
    this.objectUrl = null;
    this.trackId = null;
  }
}
