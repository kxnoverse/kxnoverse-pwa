import { describe, expect, it } from "vitest";
import { defaultAudioPreferences, getArcadeSoundVolume, parseAudioPreferences, setArcadeAudioPreferences } from "./arcade-audio";

describe("Arcade audio preferences", () => {
  it("uses defaults without writing a record during initialization", () => {
    expect(parseAudioPreferences(undefined)).toEqual(defaultAudioPreferences);
  });

  it("round-trips mute, volume, and per-game mute preferences", () => {
    const saved = { muted: true, volume: 0.45, mutedGames: ["snake", "word-guess", "tower-defense", "rhythm-tiles", "mini-platformer"] };
    expect(parseAudioPreferences(JSON.stringify(saved))).toEqual(saved);
  });

  it("clamps invalid volume bounds and removes unknown game identifiers", () => {
    expect(parseAudioPreferences(JSON.stringify({ muted: false, volume: 2, mutedGames: ["snake", "made-up"] })))
      .toEqual({ muted: false, volume: 1, mutedGames: ["snake"] });
    expect(parseAudioPreferences(JSON.stringify({ volume: -1, mutedGames: "snake" })))
      .toEqual({ muted: false, volume: 0, mutedGames: [] });
  });

  it("recovers safely from a malformed local preference record", () => {
    expect(parseAudioPreferences("{")).toEqual({ ...defaultAudioPreferences, mutedGames: [] });
  });

  it("applies shared mute and volume preferences to the Phase 5C games", () => {
    setArcadeAudioPreferences({ muted: false, volume: 0.45, mutedGames: ["rhythm-tiles"] });
    expect(getArcadeSoundVolume("rhythm-tiles")).toBe(0);
    expect(getArcadeSoundVolume("tower-defense")).toBe(0.45);
    setArcadeAudioPreferences(defaultAudioPreferences);
  });
});
