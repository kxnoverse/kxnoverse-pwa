import { describe, expect, it } from "vitest";
import {
  airHockeyDifficultyRules,
  advanceGeometryRunner,
  createAirHockeyState,
  createGeometryRunner,
  runnerMinimumGap,
  stepAirHockey,
} from "./phase2-physics";

describe("Geometry Runner fixed-step physics", () => {
  it("generates repeatable seeded obstacle sequences", () => {
    const first = createGeometryRunner(12345);
    const second = createGeometryRunner(12345);
    for (let index = 0; index < 90; index += 1) {
      const jump = index % 46 === 0;
      advanceGeometryRunner(first, 1 / 60, jump);
      advanceGeometryRunner(second, 1 / 60, jump);
    }
    expect(first).toEqual(second);
  });

  it("uses a safe opening and physics-based minimum obstacle spacing", () => {
    const state = createGeometryRunner(5);
    expect(state.obstacles[0].x).toBeGreaterThan(600);
    advanceGeometryRunner(state, 1 / 120, false);
    expect(state.obstacles).toHaveLength(2);
    const first = state.obstacles[0];
    const second = state.obstacles[1];
    expect(second.x - first.x - first.width).toBeGreaterThanOrEqual(runnerMinimumGap(state.speed, second.width));
  });

  it("supports buffered jumps and coyote time without enabling a second jump", () => {
    const coyote = createGeometryRunner(2);
    coyote.grounded = false;
    coyote.playerY -= 2;
    coyote.coyoteTime = 0.05;
    expect(advanceGeometryRunner(coyote, 1 / 120, true).jumped).toBe(true);

    const airborne = createGeometryRunner(3);
    expect(advanceGeometryRunner(airborne, 1 / 120, true).jumped).toBe(true);
    for (let frame = 0; frame < 6; frame += 1) advanceGeometryRunner(airborne, 1 / 120, false);
    const velocityBeforeRepeatedPress = airborne.playerVy;
    expect(advanceGeometryRunner(airborne, 1 / 120, true).jumped).toBe(false);
    expect(airborne.playerVy).toBeGreaterThan(velocityBeforeRepeatedPress);
  });

  it("detects obstacle collision at maximum speed during a fixed step", () => {
    const state = createGeometryRunner(4);
    state.speed = 620;
    state.obstacles = [{ x: 108, width: 24, height: 50 }];
    expect(advanceGeometryRunner(state, 1 / 120, false).died).toBe(true);
  });
});

describe("Air Hockey bounded AI and physics", () => {
  it("keeps paddles and puck inside their geometric play areas", () => {
    const state = createAirHockeyState("normal");
    for (let frame = 0; frame < 600; frame += 1) {
      stepAirHockey(state, 1 / 120, { x: 10000, y: -10000 }, () => 0.8);
      expect(state.player.x).toBeGreaterThanOrEqual(48);
      expect(state.player.x).toBeLessThanOrEqual(752);
      expect(state.player.y).toBeGreaterThanOrEqual(276);
      expect(state.player.y).toBeLessThanOrEqual(456);
      expect(state.opponent.x).toBeGreaterThanOrEqual(48);
      expect(state.opponent.x).toBeLessThanOrEqual(752);
      expect(state.opponent.y).toBeGreaterThanOrEqual(48);
      expect(state.opponent.y).toBeLessThanOrEqual(224);
      expect(state.puck.x).toBeGreaterThanOrEqual(35);
      expect(state.puck.x).toBeLessThanOrEqual(765);
      expect(state.puck.y).toBeGreaterThanOrEqual(35);
      expect(state.puck.y).toBeLessThanOrEqual(465);
    }
  });

  it("limits AI movement to each difficulty's speed cap", () => {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const state = createAirHockeyState(difficulty);
      for (let frame = 0; frame < 120; frame += 1) {
        const previous = { ...state.opponent };
        stepAirHockey(state, 1 / 120, { x: 400, y: 430 }, () => 0.95);
        expect(Math.hypot(state.opponent.x - previous.x, state.opponent.y - previous.y))
          .toBeLessThanOrEqual(airHockeyDifficultyRules[difficulty].maxSpeed / 120 + 0.001);
      }
    }
  });

  it("makes easy, normal, and hard AI observably different", () => {
    const outcomes = (["easy", "normal", "hard"] as const).map((difficulty) => {
      const state = createAirHockeyState(difficulty);
      for (let frame = 0; frame < 360; frame += 1) stepAirHockey(state, 1 / 120, { x: 400, y: 430 }, () => 0.95);
      return `${state.opponent.x.toFixed(2)}:${state.opponent.y.toFixed(2)}`;
    });
    expect(new Set(outcomes).size).toBe(3);
  });

  it("awards a goal once, resets the puck, and keeps the match state stable", () => {
    const state = createAirHockeyState("easy");
    state.scores[0] = 6;
    state.puck = { x: 400, y: 36, vx: 0, vy: -250 };
    expect(stepAirHockey(state, 1 / 60, state.player).goal).toBe("player");
    expect(state.scores).toEqual([7, 0]);
    expect(state.finished).toBe(true);
    expect(state.puck).toMatchObject({ x: 400, y: 250 });
    expect(stepAirHockey(state, 1, state.player).goal).toBeNull();
    expect(state.scores).toEqual([7, 0]);
  });

  it("reflects near-corner puck movement without escaping rink walls", () => {
    const state = createAirHockeyState("normal");
    state.puck = { x: 40, y: 40, vx: -500, vy: -500 };
    for (let frame = 0; frame < 30; frame += 1) {
      stepAirHockey(state, 1 / 120, state.player, () => 0.5);
      expect(state.puck.x).toBeGreaterThanOrEqual(35);
      expect(state.puck.y).toBeGreaterThanOrEqual(35);
    }
    expect(state.puck.vx).toBeGreaterThan(0);
    expect(state.puck.vy).toBeGreaterThan(0);
  });
});
