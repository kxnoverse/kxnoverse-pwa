import { describe, expect, it } from "vitest";
import {
  chooseConnectColumn, connectColumns, connectWinningCells, createConnectState, createFlappyState,
  createMaze, flappyGapHeight, mazePath, moveMaze, playConnectColumn, stepFlappy, type ConnectState,
} from "./phase5b-games";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("Phase 5B game rules", () => {
  it("starts Flappy Cube on input, uses fair procedural gaps and detects collisions", () => {
    const fresh = createFlappyState();
    expect(stepFlappy(fresh, 1 / 60)).toBe(fresh);
    let state = stepFlappy(fresh, 1 / 120, true, seededRandom(9));
    expect(state.started).toBe(true);
    expect(state.velocityY).toBeLessThan(0);
    for (let frame = 0; frame < 240 && !state.gameOver; frame += 1) {
      const obstacle = state.obstacles[0];
      const targetY = obstacle && obstacle.x < 220 && obstacle.x > 90 ? obstacle.gapY : state.birdY > 300 ? 240 : state.birdY < 180 ? 280 : state.birdY;
      state = stepFlappy(state, 1 / 60, state.birdY > targetY, seededRandom(frame + 20));
    }
    expect(state.elapsed).toBeGreaterThan(0);
    expect(state.obstacles.every((obstacle) =>
      obstacle.gapY >= flappyGapHeight / 2 + 42 && obstacle.gapY <= state.height - flappyGapHeight / 2 - 42,
    )).toBe(true);
    const collided = stepFlappy({ ...fresh, started: true, birdY: 12, obstacles: [] }, 1 / 120);
    expect(collided.gameOver).toBe(true);
  });

  it("keeps Flappy Cube physics consistent across common frame rates", () => {
    const simulate = (framesPerSecond: number) => {
      const random = seededRandom(42);
      let state = stepFlappy(createFlappyState(), 1 / 120, true, random);
      for (let frame = 0; frame < framesPerSecond / 5; frame += 1) {
        state = stepFlappy(state, 1 / framesPerSecond, false, random);
      }
      return state;
    };
    const at30 = simulate(30);
    const at60 = simulate(60);
    const at120 = simulate(120);
    expect(at30.birdY).toBeCloseTo(at60.birdY, 1);
    expect(at60.birdY).toBeCloseTo(at120.birdY, 1);
    expect(at30.elapsed).toBeCloseTo(at120.elapsed, 3);
    expect(at30.obstacles[0].x).toBeCloseTo(at120.obstacles[0].x, 1);
  });

  it("applies Connect Four gravity, detects wins and draws, and rejects full columns", () => {
    let state = createConnectState();
    state = playConnectColumn(state, 3);
    expect(state.board[5 * connectColumns + 3]).toBe(1);
    expect(state.lastMove).toBe(5 * connectColumns + 3);

    state = createConnectState();
    for (const column of [0, 6, 1, 6, 2, 5]) state = playConnectColumn(state, column);
    state = playConnectColumn(state, 3);
    expect(state.status).toBe("redWon");
    expect(state.winningCells).toHaveLength(4);
    expect(connectWinningCells(state.board, 1)).toHaveLength(4);

    const random = seededRandom(99);
    let drawPosition = -1;
    let drawPlayer: 1 | 2 = 1;
    let drawBoard: number[] = [];
    for (let attempt = 0; attempt < 10000 && drawPosition < 0; attempt += 1) {
      const empty = Math.floor(random() * 42);
      const player = random() < 0.5 ? 1 : 2;
      const board = Array.from({ length: 42 }, (_, index) => index === empty ? 0 : random() < 0.5 ? 1 : 2);
      const result = playConnectColumn({
        board, turn: player, status: "playing", winningCells: [], lastMove: null,
      }, empty % connectColumns);
      if (result.status === "draw") {
        drawPosition = empty;
        drawPlayer = player;
        drawBoard = board;
      }
    }
    expect(drawPosition).toBeGreaterThanOrEqual(0);
    const full = playConnectColumn({
      board: drawBoard, turn: drawPlayer, status: "playing", winningCells: [], lastMove: null,
    } satisfies ConnectState, drawPosition % connectColumns);
    expect(full.status).toBe("draw");
    expect(playConnectColumn(full, 0)).toBe(full);
    let columnFull = createConnectState();
    for (let turn = 0; turn < 6; turn += 1) columnFull = playConnectColumn(columnFull, 0);
    expect(playConnectColumn(columnFull, 0)).toBe(columnFull);
  });

  it("chooses legal Connect Four moves and blocks an immediate threat", () => {
    let state = createConnectState();
    for (const column of [0, 6, 1, 6, 2]) state = playConnectColumn(state, column);
    expect(state.turn).toBe(2);
    expect(chooseConnectColumn(state, "normal")).toBe(3);
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const column = chooseConnectColumn(createConnectState(), difficulty, () => 0.5);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(connectColumns);
    }
  });

  it.each(["easy", "normal", "hard"] as const)("generates a reachable %s maze and moves only through open doors", (difficulty) => {
    let maze = createMaze(difficulty, seededRandom(difficulty.length * 107));
    const path = mazePath(maze);
    expect(path[0]).toBe(maze.player);
    expect(path[path.length - 1]).toBe(maze.finish);
    expect(path.length).toBeGreaterThan(1);
    const blockedMove = moveMaze(maze, "left");
    expect(blockedMove.moves).toBe(0);
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const next = path[index];
      const rowDelta = Math.floor(next / maze.columns) - Math.floor(previous / maze.columns);
      const columnDelta = next % maze.columns - previous % maze.columns;
      const direction = rowDelta < 0 ? "up" : rowDelta > 0 ? "down" : columnDelta < 0 ? "left" : "right";
      maze = moveMaze(maze, direction);
    }
    expect(maze.complete).toBe(true);
    expect(maze.player).toBe(maze.finish);
    expect(maze.moves).toBe(path.length - 1);
  });
});
