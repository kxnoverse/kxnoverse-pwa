import { describe, expect, it } from "vitest";
import {
  canPlaceDefenseTower, chooseDefenseTarget, createDefenseState, createPlatformerState, createRhythmChart,
  defenseMaps, judgeRhythmNote, loadPlatformerLevel, placeDefenseTower, platformLevels,
  pointOnDefensePath, rhythmScore, sellDefenseTower, setDefenseTarget, startDefenseWave,
  stepDefense, stepPlatformer, upgradeDefenseTower,
  type DefenseState, type RhythmDifficulty, type RhythmTrack, type TowerKind,
} from "./phase5c-games";

describe("Tower Defense rules", () => {
  it("keeps the route connected and prevents tower placements from blocking it", () => {
    for (const map of Object.values(defenseMaps)) {
      expect(pointOnDefensePath(map.path, 0)).toEqual(map.path[0]);
      expect(pointOnDefensePath(map.path, Number.MAX_SAFE_INTEGER)).toEqual(map.path.at(-1));
    }
    const state = createDefenseState("meadow");
    expect(canPlaceDefenseTower(state, { x: 164, y: 190 })).toBe(false);
    expect(placeDefenseTower(state, "basic", { x: 164, y: 190 })).toBe(state);
    expect(canPlaceDefenseTower(state, { x: 82, y: 198 })).toBe(true);
  });

  it("charges upgrades, changes tower levels and returns a partial sale refund", () => {
    let state = placeDefenseTower(createDefenseState(), "basic", { x: 120, y: 198 });
    expect(state.currency).toBe(150);
    state = upgradeDefenseTower(state);
    expect(state.towers[0].level).toBe(2);
    expect(state.currency).toBe(105);
    state = upgradeDefenseTower(state);
    expect(state.towers[0].level).toBe(3);
    expect(upgradeDefenseTower(state)).toBe(state);
    state = setDefenseTarget(state, "strongest");
    expect(state.towers[0].target).toBe("strongest");
    state = sellDefenseTower(state);
    expect(state.towers).toHaveLength(0);
    expect(state.currency).toBe(140);
  });

  it.each(["basic", "rapid", "heavy", "frost"] as const)("fires %s towers at active enemies", (kind: TowerKind) => {
    let state = createDefenseState();
    state = placeDefenseTower(state, kind, { x: 120, y: 198 });
    state = startDefenseWave(state);
    const initialCurrency = state.currency;
    for (let step = 0; step < 1200; step += 1) state = stepDefense(state, 1 / 60);
    expect(state.score, JSON.stringify({ kind, currency: state.currency, enemies: state.enemies.length, towers: state.towers, projectiles: state.projectiles.length })).toBeGreaterThan(0);
    expect(state.currency).toBeGreaterThan(initialCurrency);
  });

  it("advances waves, rewards a clear and stops when lives are depleted", () => {
    let state = startDefenseWave(createDefenseState());
    expect(state.wave).toBe(1);
    expect(state.spawnRemaining).toBe(7);
    for (let step = 0; step < 30_000 && state.waveActive; step += 1) state = stepDefense(state, 1 / 60);
    expect(state.waveActive).toBe(false);
    expect(state.currency).toBeGreaterThan(220);
    const losing: DefenseState = {
      ...startDefenseWave(createDefenseState()),
      lives: 1,
      towers: [],
    };
    let lost = losing;
    for (let step = 0; step < 30_000 && lost.status !== "lost"; step += 1) lost = stepDefense(lost, 1 / 60);
    expect(lost.status).toBe("lost");
    expect(lost.lives).toBe(0);
  });

  it("uses stable first, last and strongest targeting policies", () => {
    const state = placeDefenseTower(createDefenseState(), "basic", { x: 120, y: 198 });
    const tower = state.towers[0];
    const enemies = [
      { id: 2, kind: "standard" as const, distance: 240, health: 30, maxHealth: 52, slow: 0 },
      { id: 1, kind: "armored" as const, distance: 220, health: 80, maxHealth: 118, slow: 0 },
    ];
    expect(chooseDefenseTarget(tower, enemies, defenseMaps.meadow.path)?.id).toBe(2);
    expect(chooseDefenseTarget({ ...tower, target: "last" }, enemies, defenseMaps.meadow.path)?.id).toBe(1);
    expect(chooseDefenseTarget({ ...tower, target: "strongest" }, enemies, defenseMaps.meadow.path)?.id).toBe(1);
    const selected = setDefenseTarget({ ...state, selectedTower: tower.id }, "strongest");
    expect(selected.towers[0].target).toBe("strongest");
  });
});

describe("Rhythm Tiles rules", () => {
  it("generates three distinct offline tracks and meaningful difficulty charts", () => {
    const tracks: RhythmTrack[] = ["signal", "cadence", "afterglow"];
    const easy = tracks.map((track) => createRhythmChart(track, "easy"));
    expect(new Set(easy.map((chart) => chart.bpm)).size).toBe(3);
    for (const track of tracks) {
      const counts = (["easy", "normal", "hard"] as RhythmDifficulty[]).map((difficulty) => createRhythmChart(track, difficulty).notes.length);
      expect(counts[0]).toBeLessThan(counts[1]);
      expect(counts[1]).toBeLessThan(counts[2]);
    }
    expect(easy.every((chart) => chart.notes[0].time >= 1.2)).toBe(true);
    expect(easy.every((chart) => chart.notes.every((note) => note.lane >= 0 && note.lane < 4))).toBe(true);
  });

  it("applies deterministic timing windows, scoring and simultaneous lane notes", () => {
    expect(judgeRhythmNote(1, 1)).toBe("perfect");
    expect(judgeRhythmNote(1, 1.08)).toBe("good");
    expect(judgeRhythmNote(1, 1.17)).toBe("miss");
    expect(judgeRhythmNote(1, 1.3)).toBeNull();
    expect(judgeRhythmNote(1, 1.1, 0.1)).toBe("perfect");
    expect(rhythmScore("perfect", 9)).toBe(1090);
    expect(rhythmScore("good", 9)).toBe(545);
    expect(rhythmScore("miss", 9)).toBe(0);
    const chord = createRhythmChart("cadence", "hard").notes.filter((note) => note.time === 1.3);
    expect(chord.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Mini Platformer rules", () => {
  it("keeps all eight handcrafted routes within jump reach and aligns their exits", () => {
    expect(platformLevels).toHaveLength(8);
    for (const level of platformLevels) {
      expect(level.platforms.length).toBeGreaterThanOrEqual(5);
      const tops = level.platforms.map((platform) => platform.y);
      for (let index = 1; index < level.platforms.length; index += 1) {
        const before = level.platforms[index - 1];
        const current = level.platforms[index];
        const gap = current.x - before.x - before.width;
        expect(gap, level.name).toBeLessThanOrEqual(125);
        expect(Math.max(0, tops[index - 1] - tops[index]), level.name).toBeLessThanOrEqual(106);
      }
      expect(level.exit.x).toBeGreaterThan(650);
      const finalPlatform = level.platforms[level.platforms.length - 1];
      expect(level.exit.y).toBe(finalPlatform.y - 40);
    }
  });

  it("uses fixed-step movement, jump buffering, collectible pickup, and respawn", () => {
    const input = { left: false, right: true, jump: false };
    let at30 = createPlatformerState();
    let at60 = createPlatformerState();
    for (let frame = 0; frame < 30; frame += 1) at30 = stepPlatformer(at30, input, 1 / 30);
    for (let frame = 0; frame < 60; frame += 1) at60 = stepPlatformer(at60, input, 1 / 60);
    expect(Math.abs(at30.x - at60.x)).toBeLessThan(2);
    expect(at30.x).toBeGreaterThan(42);
    const launched = stepPlatformer({ ...at60, grounded: true, coyote: 0.1 }, { ...input, jump: true }, 1 / 60);
    expect(launched.vy).toBeLessThan(0);
    const level = platformLevels[0];
    let state = { ...createPlatformerState(), x: 193, y: 420 };
    state = stepPlatformer(state, { left: false, right: false, jump: false }, 1 / 60);
    expect(state.x).toBe(state.checkpoint.x);
    const unlocked = loadPlatformerLevel({ ...state, unlocked: 4 }, 3);
    expect(unlocked.level).toBe(3);
    expect(unlocked.lives).toBe(3);
    expect(level.collectibles).toHaveLength(1);
  });
});
