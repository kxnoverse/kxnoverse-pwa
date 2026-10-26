import { describe, expect, it } from "vitest";
import {
  applyClickerOfflineProgress, clickerCollect, clickerInitialState, clickerProduction, clickerUpgrade,
  clickerUpgradePrice, nextSimonSequence, normalizeClickerSave, simonPlaybackDelay, stepRider,
} from "./phase3-games";

describe("Phase 3 game rules", () => {
  it("grows Simon Says sequences by one reproducible pad", () => {
    expect(nextSimonSequence([2], () => 0.75)).toEqual([2, 3]);
    expect(nextSimonSequence([], () => 0)).toEqual([0]);
    expect(simonPlaybackDelay.easy).toBeGreaterThan(simonPlaybackDelay.normal);
    expect(simonPlaybackDelay.normal).toBeGreaterThan(simonPlaybackDelay.hard);
  });

  it("bounds the rider step and resolves a track crossing", () => {
    const rider = { x: 50, y: 85, vx: 0, vy: 600, angle: 0 };
    const result = stepRider(rider, [[{ x: 0, y: 100 }, { x: 100, y: 100 }]], 1 / 30);
    expect(result.y).toBeLessThanOrEqual(91.01);
    expect(result.vy).toBeLessThan(0);
    expect(stepRider(rider, [], 10).y).toBeLessThan(110);
  });

  it("collects resources and purchases increasingly priced upgrades", () => {
    const collected = clickerCollect({ ...clickerInitialState, lastSavedAt: 0 });
    expect(collected.resources).toBe(1);
    expect(clickerUpgradePrice("click", 1)).toBeGreaterThan(clickerUpgradePrice("click", 0));
    expect(clickerUpgrade(collected, "auto")).toBeNull();
    const purchased = clickerUpgrade({ ...collected, resources: 100 }, "auto")!;
    expect(purchased.autoLevel).toBe(1);
    expect(clickerProduction(purchased)).toBeGreaterThan(0);
  });

  it("caps offline production and ignores negative elapsed time", () => {
    const state = { ...clickerInitialState, autoLevel: 2, lastSavedAt: 0 };
    expect(applyClickerOfflineProgress(state, -500).gained).toBe(0);
    const result = applyClickerOfflineProgress(state, 72 * 60 * 60 * 1000);
    expect(result.gained).toBe(2 * 0.8 * 8 * 60 * 60);
    expect(result.state.lastSavedAt).toBe(72 * 60 * 60 * 1000);
  });

  it("normalizes untrusted local saves without discarding valid progress", () => {
    const normalized = normalizeClickerSave({
      resources: 124.5, lifetime: -4, clickLevel: 3, autoLevel: "bad",
      multiplierLevel: 1, lastSavedAt: 1000, achievements: ["first-hundred", 4],
    }, 42);
    expect(normalized).toMatchObject({
      resources: 124.5, lifetime: 0, clickLevel: 3, autoLevel: 0,
      multiplierLevel: 1, lastSavedAt: 1000, achievements: ["first-hundred"],
    });
  });
});
