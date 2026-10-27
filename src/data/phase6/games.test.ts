import { describe, expect, it } from "vitest";
import { createPerfectStack, dropPerfectStack, startPerfectStack, stepPerfectStack } from "./perfect-stack";
import { createLaserMirrors, generateLaserPuzzle, restoreLaserPuzzle, rotateLaserMirror, solveLaserPuzzle, traceLaser, undoLaserMirror } from "./laser-mirrors";
import { createPixelCrossing, isCrossingPositionSafe, movePixelCrossing, startPixelCrossing, stepPixelCrossing, type CrossingRow } from "./pixel-crossing";

describe("Phase 6 arcade game rules", () => {
  it("moves, aligns, scores combos and ends a missed Perfect Stack run", () => {
    const started = startPerfectStack(createPerfectStack());
    const moving = stepPerfectStack(started, 0.05);
    expect(moving.movingX).toBeGreaterThan(0);
    const first = dropPerfectStack({ ...started, movingX: 252 });
    expect(first).toMatchObject({ score: 1, combo: 1, blocks: [{ x: 250 }, { x: 250, width: 140 }] });
    const second = dropPerfectStack({ ...first, movingX: 254 });
    expect(second).toMatchObject({ score: 2, combo: 2 });
    expect(dropPerfectStack({ ...second, movingX: 500 }).status).toBe("over");
  });

  it("generates reproducible, solvable laser puzzles at every difficulty", () => {
    for (const [index, difficulty] of (["easy", "medium", "hard", "expert"] as const).entries()) {
      for (let seedOffset = 0; seedOffset < 4; seedOffset += 1) {
        const seed = 145 + index * 10 + seedOffset;
        const generated = generateLaserPuzzle(difficulty, seed, seedOffset + 1);
        const game = generateLaserPuzzle(difficulty, seed, seedOffset + 1);
        expect(game.fingerprint).toBe(generated.fingerprint);
        expect(game.requiredRotations).toBeGreaterThanOrEqual([2, 3, 5, 6][index]);
        expect(game.pathLength).toBeGreaterThanOrEqual([8, 13, 20, 30][index]);
        expect(traceLaser(game).hit, `${difficulty} should start unsolved`).toBe(false);
        const solution = solveLaserPuzzle(game);
        expect(solution).not.toBeNull();
        let solved = game;
        for (const mirrorIndex of solution ?? []) {
          const mirror = solved.mirrors[mirrorIndex];
          solved = rotateLaserMirror(solved, mirror.x, mirror.y);
        }
        expect(solved.complete).toBe(true);
        expect(traceLaser(solved).hit).toBe(true);
        expect(undoLaserMirror(solved).complete).toBe(false);
        expect(game.emitters.length).toBe(difficulty === "expert" ? 2 : 1);
      }
    }
    const game = createLaserMirrors();
    const modified = rotateLaserMirror(game, game.mirrors[0].x, game.mirrors[0].y);
    const restored = restoreLaserPuzzle(game, modified.mirrors.map((mirror) => mirror.orientation), modified.history);
    expect(restored).toMatchObject({ mirrors: modified.mirrors, history: modified.history });
    expect(rotateLaserMirror(game, 0, 0)).toBe(game);
  });

  it("moves, advances the crossing rows, and detects road and river hazards", () => {
    const started = startPixelCrossing(createPixelCrossing(() => 0.9));
    const safeRows: CrossingRow[] = started.rows.map(() => ({ kind: "safe", direction: 1, speed: 0, obstacles: [] }));
    const clear = { ...started, rows: safeRows };
    expect(movePixelCrossing(clear, 0, -1)).toMatchObject({ playerY: 9, score: 1, status: "playing" });
    const advanced = movePixelCrossing({ ...clear, playerY: 4, furthest: 6, score: 6 }, 0, -1, () => 0.1);
    expect(advanced).toMatchObject({ playerY: 4, score: 7, status: "playing" });
    expect(advanced.rows).not.toEqual(clear.rows);
    expect(advanced).not.toHaveProperty("cameraOffset");

    const roadRows = [...safeRows];
    roadRows[9] = { kind: "road", direction: 1, speed: 1, obstacles: [{ x: 7, width: 1, variant: 0 }] };
    const roadHit = movePixelCrossing({ ...clear, rows: roadRows }, 0, -1);
    expect(roadHit.status).toBe("over");
    expect(isCrossingPositionSafe(roadHit)).toBe(false);

    const riverRows = [...safeRows];
    riverRows[9] = { kind: "river", direction: 1, speed: 0.5, obstacles: [{ x: 7, width: 3, variant: 0 }] };
    const onLog = movePixelCrossing({ ...clear, rows: riverRows }, 0, -1);
    expect(onLog.status).toBe("playing");
    expect(stepPixelCrossing(onLog, 0.05).playerX).toBeGreaterThan(onLog.playerX);

    const firstAdvance = movePixelCrossing({ ...clear, playerY: 4, furthest: 6, score: 6 }, 0, -1);
    const stepBack = movePixelCrossing(firstAdvance, 0, 1);
    const returnToEdge = movePixelCrossing(stepBack, 0, -1);
    expect(returnToEdge.cameraDistance).toBe(firstAdvance.cameraDistance);
    expect(movePixelCrossing(returnToEdge, 0, -1).cameraDistance).toBe(firstAdvance.cameraDistance + 1);
    expect(movePixelCrossing({ ...clear, playerX: 0 }, -1, 0)).toMatchObject({ playerX: 0, status: "playing", collision: null });
  });
});
