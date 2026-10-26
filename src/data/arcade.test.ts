import { describe, expect, it } from "vitest";
import { advanceSnake, canMove2048, isPuzzleSolved, move2048, movePuzzle, shufflePuzzle, spawn2048 } from "./arcade";
import { airHockeyGoal, circleHitsRect, evaluateGuess, isAimHit, randomWord, runnerCollision } from "./phase2-games";

describe("arcade game rules", () => {
  it("merges each 2048 pair once and scores the merged tiles", () => {
    const result = move2048([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "left");
    expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(result.score).toBe(8);
    expect(result.changed).toBe(true);
  });

  it("does not report a move when a full board has no merges", () => {
    const board = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2, 4, 8, 16, 32, 64];
    expect(canMove2048(board)).toBe(false);
    expect(move2048(board, "left").changed).toBe(false);
  });

  it("spawns only into an empty cell", () => {
    const next = spawn2048([2, ...Array(15).fill(0)], () => 0);
    expect(next[0]).toBe(2);
    expect(next[1]).toBe(2);
  });

  it("handles snake food and body collisions", () => {
    expect(advanceSnake(
      [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }],
      { x: 1, y: 0 },
      { x: 7, y: 7 },
      8,
      8,
    ).collided).toBe(true);
    expect(advanceSnake([{ x: 2, y: 2 }], { x: 1, y: 0 }, { x: 3, y: 2 }, 8, 8).ate).toBe(true);
  });

  it("only slides an adjacent tile and makes a solvable shuffled board", () => {
    expect(movePuzzle([1, 2, 3, 4, 5, 6, 7, 0, 8], 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(movePuzzle([1, 2, 3, 4, 5, 6, 7, 0, 8], 0)).toBeNull();
    expect(isPuzzleSolved(shufflePuzzle(3, () => 0.4, 40))).toBe(false);
  });

  it("scores duplicate letters against the remaining answer counts", () => {
    expect(evaluateGuess("allee", "eagle")).toEqual(["present", "present", "absent", "present", "correct"]);
    expect(evaluateGuess("arose", "arose")).toEqual(["correct", "correct", "correct", "correct", "correct"]);
  });

  it("chooses a dictionary word and rejects empty solution lists", () => {
    expect(randomWord(["apple", "water"], () => 0)).toBe("apple");
    expect(randomWord(["apple", "water"], () => 1)).toBe("water");
    expect(() => randomWord([])).toThrow("empty word list");
  });

  it("handles canvas brick, runner, hockey goal and aim precision collisions", () => {
    expect(circleHitsRect({ x: 4, y: 5, radius: 4 }, { x: 7, y: 5, width: 8, height: 10 })).toBe(true);
    expect(circleHitsRect({ x: 2, y: 5, radius: 3 }, { x: 7, y: 5, width: 8, height: 10 })).toBe(false);
    expect(runnerCollision(100, 450, { x: 110, width: 30, height: 40 })).toBe(true);
    expect(runnerCollision(100, 420, { x: 110, width: 30, height: 40 })).toBe(false);
    expect(airHockeyGoal(400, -1)).toBe("player");
    expect(airHockeyGoal(400, 501)).toBe("opponent");
    expect(airHockeyGoal(100, -1)).toBeNull();
    expect(isAimHit({ x: 103, y: 104 }, { x: 100, y: 100 }, 5)).toBe(true);
    expect(isAimHit({ x: 106, y: 100 }, { x: 100, y: 100 }, 5)).toBe(false);
  });
});
