import { describe, expect, it } from "vitest";
import {
  blockBoardHeight, blockBoardWidth, blockCells, canPlaceBlock, chordMinesweeperCell, countSudokuSolutions,
  createBlockStack, createMinesweeperState, createPongState, createSudokuPuzzle, dropBlock,
  holdBlock, isValidSudokuBoard, mineDifficulties, minesweeperNeighbors, moveBlock,
  predictPongInterceptY, revealMinesweeperCell, rotateBlock, solveSudokuEffort, stepPong,
  sudokuIsComplete, tickBlockStack, toggleMinesweeperFlag, type BlockStackState, type MineCell,
  type MinesweeperState, type PongInput,
} from "./phase5-games";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("Phase 5A game rules", () => {
  it("uses a seven-bag and keeps tetrominoes inside the board when rotating near a wall", () => {
    const state = createBlockStack(() => 0);
    expect(new Set([state.piece.type, ...state.next, ...state.bag])).toHaveProperty("size", 7);
    const nearWall = { ...state, piece: { type: 0 as const, rotation: 0, x: 0, y: 5 } };
    const rotated = rotateBlock(nearWall);
    expect(canPlaceBlock(rotated.board, rotated.piece)).toBe(true);
    expect(blockCells(rotated.piece).every((cell) => cell.x >= 0 && cell.x < blockBoardWidth)).toBe(true);
    expect(blockCells(nearWall.piece).every((cell) => cell.y >= 0 && cell.y < blockBoardHeight)).toBe(true);
  });

  it("clears a completed row on hard drop and applies line score", () => {
    const board = Array(blockBoardWidth * blockBoardHeight).fill(0);
    for (let column = 0; column < blockBoardWidth; column += 1) {
      if (column < 3 || column > 6) board[(blockBoardHeight - 1) * blockBoardWidth + column] = 7;
    }
    const state: BlockStackState = {
      ...createBlockStack(() => 0),
      board,
      piece: { type: 0, rotation: 0, x: 3, y: blockBoardHeight - 1 },
    };
    const dropped = dropBlock(state, () => 0.4);
    expect(dropped.lines).toBe(1);
    expect(dropped.score).toBe(100);
    expect(dropped.board.slice(-blockBoardWidth)).toEqual(Array(blockBoardWidth).fill(0));
  });

  it("restricts hold to once per piece and detects a blocked spawn", () => {
    const initial = createBlockStack(() => 0.1);
    const held = holdBlock(initial, () => 0.2);
    expect(held.canHold).toBe(false);
    expect(holdBlock(held)).toBe(held);
    expect(holdBlock(dropBlock(held, () => 0.3), () => 0.4).canHold).toBe(false);
    const blockedBoard = Array(blockBoardWidth * blockBoardHeight).fill(0);
    for (let row = 0; row < blockBoardHeight - 1; row += 1) {
      for (let column = 1; column < blockBoardWidth; column += 1) blockedBoard[row * blockBoardWidth + column] = 1;
    }
    const blocked = { ...initial, board: blockedBoard };
    expect(dropBlock(blocked).gameOver).toBe(true);
    const ended = { ...blocked, gameOver: true };
    expect(tickBlockStack(ended)).toBe(ended);
    expect(moveBlock({ ...blocked, gameOver: true }, 1)).toMatchObject({ gameOver: true });
  });

  it("keeps the first Minesweeper click safe and reveals connected empty cells", () => {
    const fresh = createMinesweeperState("easy");
    const started = revealMinesweeperCell(fresh, 40, () => 0);
    expect(started.cells[40].mine).toBe(false);
    expect(started.cells[40].adjacent).toBe(0);
    expect(started.cells[40].revealed).toBe(true);
    expect(started.cells.filter((cell) => cell.mine)).toHaveLength(mineDifficulties.easy.mines);
    expect(started.cells.every((cell, index) =>
      cell.adjacent === minesweeperNeighbors(index, started.rows, started.columns).filter((neighbor) => started.cells[neighbor].mine).length,
    )).toBe(true);
    expect(started.cells.filter((cell) => cell.revealed).length).toBeGreaterThan(1);
  });

  it("toggles flags, wins after all safe cells are revealed, and loses on a chorded mine", () => {
    const base = createMinesweeperState("easy");
    const mine = 0;
    const cells: MineCell[] = base.cells.map((cell, index) => ({
      ...cell,
      mine: index === mine,
      adjacent: minesweeperNeighbors(index, base.rows, base.columns).includes(mine) ? 1 : 0,
      revealed: index !== mine,
    }));
    cells[1] = { ...cells[1], revealed: false };
    const almostWon: MinesweeperState = { ...base, cells, started: true };
    const flagged = toggleMinesweeperFlag(almostWon, mine);
    expect(flagged.cells[mine].flagged).toBe(true);
    expect(toggleMinesweeperFlag(flagged, mine).cells[mine].flagged).toBe(false);
    expect(revealMinesweeperCell(almostWon, 1).won).toBe(true);

    const chordBase = createMinesweeperState("easy");
    const chordCells = chordBase.cells.map((cell, index) => ({
      ...cell,
      mine: index === 0,
      adjacent: minesweeperNeighbors(index, chordBase.rows, chordBase.columns).includes(0) ? 1 : 0,
      revealed: index === 1 || index === 10,
      flagged: index === 10,
    }));
    expect(chordMinesweeperCell({ ...chordBase, cells: chordCells, started: true }, 1).gameOver).toBe(true);
  });

  it("supports Pong wall and paddle collisions, scoring, and bounded paddles", () => {
    const input: PongInput = { player: -1, opponent: 0, twoPlayer: true, difficulty: "normal" };
    const nearPaddle = {
      ...createPongState(1),
      ball: { x: 36, y: 225, vx: -600, vy: 0 },
    };
    const returned = stepPong(nearPaddle, 0.05, input);
    expect(returned.ball.vx).toBeGreaterThan(0);
    expect(returned.playerY).toBeGreaterThanOrEqual(41);
    const score = stepPong({ ...createPongState(1), ball: { x: 799, y: 220, vx: 500, vy: 0 } }, 0.05, input);
    expect(score.playerScore).toBe(1);
    expect(score.status).toBe("playerWon");
    expect(stepPong(score, 0.05, input)).toBe(score);
    const wallBounce = stepPong({ ...createPongState(), ball: { x: 400, y: 11, vx: 0, vy: -400 } }, 0.05, input);
    expect(wallBounce.ball.vy).toBeGreaterThan(0);
  });

  it("predicts reflected Pong trajectories and returns ordinary shots without teleporting", () => {
    const state = {
      ...createPongState(),
      ball: { x: 600, y: 420, vx: 300, vy: 160 },
    };
    expect(predictPongInterceptY(state, 766)).toBeGreaterThan(300);

    const input: PongInput = { player: 0, opponent: 0, twoPlayer: false, difficulty: "normal" };
    let current = { ...state, ball: { x: 600, y: 225, vx: 300, vy: 0 } };
    let previousY = current.opponentY;
    for (let index = 0; index < 180; index += 1) {
      current = stepPong(current, 1 / 120, input);
      expect(Math.abs(current.opponentY - previousY)).toBeLessThanOrEqual(430 / 120 + 1e-8);
      previousY = current.opponentY;
    }
    expect(current.ball.vx).toBeLessThan(0);
    expect(current.opponentScore).toBe(0);
  });

  it.each(["easy", "normal", "hard"] as const)("lets the %s Pong computer win against a motionless player", (difficulty) => {
    const input: PongInput = { player: 0, opponent: 0, twoPlayer: false, difficulty };
    let current = createPongState(3);
    for (let frame = 0; frame < 120_000 && current.status === "playing"; frame += 1) {
      current = stepPong(current, 1 / 120, input);
    }
    expect(current.opponentScore).toBeGreaterThan(0);
    expect(current.status).toBe("opponentWon");
    expect(current.playerScore).toBeLessThan(current.targetScore);
  });

  it.each([30, 60, 120])("keeps Pong trajectory and scoring consistent at %i Hz", (rate) => {
    const input: PongInput = { player: 0, opponent: 0, twoPlayer: false, difficulty: "normal" };
    let current = {
      ...createPongState(7),
      serveSeconds: 0,
      ball: { x: 400, y: 225, vx: 300, vy: 220 },
    };
    for (let frame = 0; frame < rate * 2; frame += 1) current = stepPong(current, 1 / rate, input);
    expect(current.ball.x).toBeGreaterThan(100);
    expect(current.ball.x).toBeLessThan(790);
    expect(current.ball.y).toBeGreaterThanOrEqual(10);
    expect(current.ball.y).toBeLessThanOrEqual(440);
  });

  it("keeps Pong beatable when a player tracks the incoming ball against Easy", () => {
    const input: PongInput = { player: 0, opponent: 0, twoPlayer: false, difficulty: "easy" };
    let current = createPongState(3);
    for (let frame = 0; frame < 120_000 && current.status === "playing"; frame += 1) {
      const target = predictPongInterceptY(current, 34) + 30;
      const direction = current.ball.vx < 0 ? Math.sign(target - current.playerY) : 0;
      current = stepPong(current, 1 / 120, { ...input, player: direction as -1 | 0 | 1 });
    }
    expect(current.playerScore, JSON.stringify({ player: current.playerScore, opponent: current.opponentScore, status: current.status, ball: current.ball, playerY: current.playerY, opponentY: current.opponentY, rally: current.rally, serve: current.serveSeconds })).toBeGreaterThan(0);
  });

  it("keeps Easy capable of returning a normal incoming shot", () => {
    const input: PongInput = { player: 0, opponent: 0, twoPlayer: false, difficulty: "easy" };
    let current = { ...createPongState(), ball: { x: 600, y: 225, vx: 300, vy: 0 } };
    for (let frame = 0; frame < 180; frame += 1) current = stepPong(current, 1 / 120, input);
    expect(current.ball.vx).toBeLessThan(0);
    expect(current.playerScore).toBe(0);
    expect(current.opponentScore).toBe(0);
  });

  it("generates valid, unique Sudoku puzzles with complexity-aware ratings", () => {
    const easy = createSudokuPuzzle("easy", seededRandom(17));
    const normal = createSudokuPuzzle("normal", seededRandom(29));
    const hard = createSudokuPuzzle("hard", seededRandom(41));
    for (const puzzle of [easy, normal, hard]) {
      expect(isValidSudokuBoard(puzzle.solution, false)).toBe(true);
      expect(isValidSudokuBoard(puzzle.puzzle)).toBe(true);
      expect(countSudokuSolutions(puzzle.puzzle)).toBe(1);
      expect(sudokuIsComplete(puzzle.solution, puzzle.solution)).toBe(true);
      expect(puzzle.rating).toBe(solveSudokuEffort(puzzle.puzzle));
    }
    expect(easy.puzzle.filter(Boolean).length).toBeGreaterThan(normal.puzzle.filter(Boolean).length);
    expect(normal.puzzle.filter(Boolean).length).toBeGreaterThan(hard.puzzle.filter(Boolean).length);
    expect(new Set(easy.solution)).toHaveProperty("size", 9);
  });
});
