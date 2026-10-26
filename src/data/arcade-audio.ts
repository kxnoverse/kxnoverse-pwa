import type { GameId } from "./arcade";

export type ArcadeSound =
  | "click"
  | "start"
  | "score"
  | "collision"
  | "success"
  | "failure"
  | "win"
  | "lose"
  | "gameOver"
  | "powerUp";

export interface ArcadeAudioPreferences {
  muted: boolean;
  volume: number;
  mutedGames: GameId[];
}

export const audioPreferencesKey = "preference:audio";

export const defaultAudioPreferences: ArcadeAudioPreferences = {
  muted: false,
  volume: 0.2,
  mutedGames: [],
};

export function parseAudioPreferences(value: string | undefined): ArcadeAudioPreferences {
  if (!value) return { ...defaultAudioPreferences, mutedGames: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return { ...defaultAudioPreferences, mutedGames: [] };
    const saved = parsed as Partial<ArcadeAudioPreferences>;
    return {
      muted: typeof saved.muted === "boolean" ? saved.muted : defaultAudioPreferences.muted,
      volume: typeof saved.volume === "number" && Number.isFinite(saved.volume)
        ? Math.max(0, Math.min(1, saved.volume))
        : defaultAudioPreferences.volume,
      mutedGames: Array.isArray(saved.mutedGames)
        ? [...new Set(saved.mutedGames.filter((game): game is GameId => typeof game === "string" && [
          "2048", "snake", "memory", "reaction", "sliding", "word-guess",
          "brick-breaker", "geometry-runner", "air-hockey", "aim-trainer",
          "simon-says", "line-rider", "idle-clicker", "chess",
          "block-stack", "minesweeper", "pong", "sudoku", "flappy-cube", "connect-four", "maze-escape",
          "tower-defense", "rhythm-tiles", "mini-platformer",
        ].includes(game)))]
        : [],
    };
  } catch {
    return { ...defaultAudioPreferences, mutedGames: [] };
  }
}

let preferences = { ...defaultAudioPreferences, muted: true };
let audioContext: AudioContext | undefined;
let compressor: DynamicsCompressorNode | undefined;
let activeVoices = 0;
const lastPlayed = new Map<string, number>();

const notes: Record<ArcadeSound, { frequency: number; duration: number; type: OscillatorType }> = {
  click: { frequency: 520, duration: 0.045, type: "sine" },
  start: { frequency: 440, duration: 0.09, type: "sine" },
  score: { frequency: 680, duration: 0.07, type: "triangle" },
  collision: { frequency: 185, duration: 0.055, type: "triangle" },
  success: { frequency: 740, duration: 0.085, type: "sine" },
  failure: { frequency: 245, duration: 0.09, type: "sine" },
  win: { frequency: 880, duration: 0.15, type: "sine" },
  lose: { frequency: 210, duration: 0.14, type: "triangle" },
  gameOver: { frequency: 265, duration: 0.12, type: "sine" },
  powerUp: { frequency: 790, duration: 0.11, type: "sine" },
};

export function setArcadeAudioPreferences(next: ArcadeAudioPreferences): void {
  preferences = {
    muted: next.muted,
    volume: Number.isFinite(next.volume) ? Math.max(0, Math.min(1, next.volume)) : defaultAudioPreferences.volume,
    mutedGames: [...new Set(next.mutedGames)],
  };
}

export function getArcadeSoundVolume(game: GameId): number {
  return preferences.muted || preferences.mutedGames.includes(game) ? 0 : preferences.volume;
}

export function playArcadeSound(game: GameId, sound: ArcadeSound): void {
  if (preferences.muted || preferences.volume <= 0 || preferences.mutedGames.includes(game)) return;
  const now = typeof performance === "undefined" ? Date.now() : performance.now();
  const key = `${game}:${sound}`;
  const cooldown = sound === "collision" ? 100 : sound === "score" ? 80 : 35;
  if (now - (lastPlayed.get(key) ?? -Infinity) < cooldown || activeVoices >= 4) return;
  lastPlayed.set(key, now);

  let countedVoice = false;
  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    audioContext ??= new AudioContextConstructor();
    if (!compressor) {
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.12;
      compressor.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => undefined);
    if (audioContext.state === "closed") return;

    const spec = notes[sound];
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime;
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.frequency, startAt);
    if (sound === "win" || sound === "start" || sound === "powerUp") {
      oscillator.frequency.exponentialRampToValueAtTime(spec.frequency * 1.22, startAt + spec.duration);
    }
    gain.gain.setValueAtTime(Math.min(0.08, preferences.volume * 0.11), startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.duration);
    oscillator.connect(gain);
    gain.connect(compressor);
    activeVoices += 1;
    countedVoice = true;
    oscillator.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      countedVoice = false;
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(startAt);
    oscillator.stop(startAt + spec.duration + 0.01);
  } catch {
    if (countedVoice) activeVoices = Math.max(0, activeVoices - 1);
  }
}
