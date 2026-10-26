export type Tetromino = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type BlockPiece = { type: Tetromino; rotation: number; x: number; y: number };
export type BlockStackState = {
  board: number[];
  piece: BlockPiece;
  next: Tetromino[];
  bag: Tetromino[];
  held: Tetromino | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
};

const blockShapes: Record<Tetromino, readonly (readonly number[])[]> = {
  0: [[1, 1, 1, 1]],
  1: [[2, 2], [2, 2]],
  2: [[0, 3, 0], [3, 3, 3]],
  3: [[0, 4, 4], [4, 4, 0]],
  4: [[5, 5, 0], [0, 5, 5]],
  5: [[6, 0, 0], [6, 6, 6]],
  6: [[0, 0, 7], [7, 7, 7]],
};

export const blockBoardWidth = 10;
export const blockBoardHeight = 20;

export function blockCells(piece: BlockPiece): Array<{ x: number; y: number; value: number }> {
  const shape = blockShapes[piece.type];
  let cells = shape.flatMap((row, y) => row.flatMap((value, x) => value ? [{ x, y, value }] : []));
  for (let turn = 0; turn < piece.rotation % 4; turn += 1) {
    const currentHeight = Math.max(...cells.map((cell) => cell.y)) + 1;
    cells = cells.map(({ x, y, value }) => ({ x: currentHeight - 1 - y, y: x, value }));
    const minX = Math.min(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    cells = cells.map((cell) => ({ ...cell, x: cell.x - minX, y: cell.y - minY }));
  }
  return cells.map((cell) => ({ ...cell, x: cell.x + piece.x, y: cell.y + piece.y }));
}

export function canPlaceBlock(board: readonly number[], piece: BlockPiece): boolean {
  return blockCells(piece).every(({ x, y }) =>
    x >= 0 && x < blockBoardWidth && y < blockBoardHeight && (y < 0 || board[y * blockBoardWidth + x] === 0),
  );
}

function shuffledBag(random: () => number): Tetromino[] {
  const bag: Tetromino[] = [0, 1, 2, 3, 4, 5, 6];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const choice = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [bag[index], bag[choice]] = [bag[choice], bag[index]];
  }
  return bag;
}

function fillBlockQueue(state: BlockStackState, random: () => number): BlockStackState {
  const next = [...state.next];
  let bag = [...state.bag];
  while (next.length < 5) {
    if (bag.length === 0) bag = shuffledBag(random);
    next.push(bag.shift()!);
  }
  return { ...state, next, bag };
}

function spawnBlock(state: BlockStackState, random: () => number): BlockStackState {
  const queued = fillBlockQueue(state, random);
  const [type, ...next] = queued.next;
  const piece: BlockPiece = { type, rotation: 0, x: 3, y: 0 };
  const spawned = { ...queued, piece, next, canHold: true };
  return canPlaceBlock(spawned.board, piece) ? spawned : { ...spawned, gameOver: true };
}

export function createBlockStack(random: () => number = Math.random): BlockStackState {
  const initial: BlockStackState = {
    board: Array(blockBoardWidth * blockBoardHeight).fill(0),
    piece: { type: 0, rotation: 0, x: 3, y: 0 },
    next: [],
    bag: [],
    held: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    gameOver: false,
  };
  return spawnBlock(initial, random);
}

export function moveBlock(state: BlockStackState, dx: number, dy = 0): BlockStackState {
  if (state.gameOver) return state;
  const piece = { ...state.piece, x: state.piece.x + dx, y: state.piece.y + dy };
  return canPlaceBlock(state.board, piece) ? { ...state, piece } : state;
}

export function rotateBlock(state: BlockStackState, direction: 1 | -1 = 1): BlockStackState {
  if (state.gameOver) return state;
  const rotation = (state.piece.rotation + direction + 4) % 4;
  for (const kick of [0, -1, 1, -2, 2]) {
    const piece = { ...state.piece, rotation, x: state.piece.x + kick };
    if (canPlaceBlock(state.board, piece)) return { ...state, piece };
  }
  return state;
}

function lockBlock(state: BlockStackState, random: () => number): BlockStackState {
  const board = [...state.board];
  for (const { x, y, value } of blockCells(state.piece)) {
    if (y < 0) return { ...state, gameOver: true };
    board[y * blockBoardWidth + x] = value;
  }
  const remaining: number[] = [];
  let cleared = 0;
  for (let row = 0; row < blockBoardHeight; row += 1) {
    const cells = board.slice(row * blockBoardWidth, (row + 1) * blockBoardWidth);
    if (cells.every(Boolean)) cleared += 1;
    else remaining.push(...cells);
  }
  const nextBoard = [...Array(cleared * blockBoardWidth).fill(0), ...remaining];
  const lines = state.lines + cleared;
  const next = spawnBlock({
    ...state,
    board: nextBoard,
    score: state.score + [0, 100, 300, 500, 800][cleared] * state.level,
    lines,
    level: Math.floor(lines / 10) + 1,
  }, random);
  return next;
}

export function dropBlock(state: BlockStackState, random: () => number = Math.random): BlockStackState {
  if (state.gameOver) return state;
  let current = state;
  let distance = 0;
  while (canPlaceBlock(current.board, { ...current.piece, y: current.piece.y + 1 })) {
    current = { ...current, piece: { ...current.piece, y: current.piece.y + 1 } };
    distance += 1;
  }
  return lockBlock({ ...current, score: current.score + distance * 2 }, random);
}

export function tickBlockStack(state: BlockStackState, random: () => number = Math.random): BlockStackState {
  if (state.gameOver) return state;
  const next = { ...state.piece, y: state.piece.y + 1 };
  return canPlaceBlock(state.board, next) ? { ...state, piece: next } : lockBlock(state, random);
}

export function holdBlock(state: BlockStackState, random: () => number = Math.random): BlockStackState {
  if (state.gameOver || !state.canHold) return state;
  if (state.held === null) {
    return { ...spawnBlock({ ...state, held: state.piece.type }, random), canHold: false };
  }
  const piece: BlockPiece = { type: state.held, rotation: 0, x: 3, y: 0 };
  const held = { ...state, held: state.piece.type, piece, canHold: false };
  return canPlaceBlock(held.board, piece) ? held : { ...held, gameOver: true };
}

export type MineCell = { mine: boolean; adjacent: number; revealed: boolean; flagged: boolean };
export type MinesweeperState = {
  rows: number;
  columns: number;
  mineCount: number;
  cells: MineCell[];
  started: boolean;
  gameOver: boolean;
  won: boolean;
};

export const mineDifficulties = {
  easy: { rows: 9, columns: 9, mines: 10 },
  normal: { rows: 16, columns: 16, mines: 40 },
  hard: { rows: 16, columns: 30, mines: 99 },
} as const;
export type MineDifficulty = keyof typeof mineDifficulties;

export function minesweeperNeighbors(index: number, rows: number, columns: number): number[] {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const result: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) continue;
    const y = row + dy;
    const x = column + dx;
    if (y >= 0 && y < rows && x >= 0 && x < columns) result.push(y * columns + x);
  }
  return result;
}

export function createMinesweeperState(difficulty: MineDifficulty = "easy"): MinesweeperState {
  const config = mineDifficulties[difficulty];
  return {
    rows: config.rows,
    columns: config.columns,
    mineCount: config.mines,
    cells: Array.from({ length: config.rows * config.columns }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false })),
    started: false,
    gameOver: false,
    won: false,
  };
}

export function placeMines(
  state: MinesweeperState,
  firstIndex: number,
  random: () => number = Math.random,
): MinesweeperState {
  const safe = new Set([firstIndex, ...minesweeperNeighbors(firstIndex, state.rows, state.columns)]);
  let candidates = state.cells.map((_, index) => index).filter((index) => !safe.has(index));
  if (candidates.length < state.mineCount) candidates = state.cells.map((_, index) => index).filter((index) => index !== firstIndex);
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const choice = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [candidates[index], candidates[choice]] = [candidates[choice], candidates[index]];
  }
  const mines = new Set(candidates.slice(0, state.mineCount));
  const cells = state.cells.map((cell, index) => ({
    ...cell,
    mine: mines.has(index),
    adjacent: minesweeperNeighbors(index, state.rows, state.columns).filter((neighbor) => mines.has(neighbor)).length,
  }));
  return { ...state, cells, started: true };
}

function updateMineOutcome(state: MinesweeperState): MinesweeperState {
  const won = !state.gameOver && state.cells.every((cell) => cell.mine || cell.revealed);
  return { ...state, won, gameOver: state.gameOver || won };
}

export function revealMinesweeperCell(
  state: MinesweeperState,
  index: number,
  random: () => number = Math.random,
): MinesweeperState {
  if (state.gameOver || index < 0 || index >= state.cells.length || state.cells[index].flagged || state.cells[index].revealed) return state;
  let current = state.started ? state : placeMines(state, index, random);
  if (current.cells[index].mine) {
    const cells = current.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, revealed: true } : cell);
    return { ...current, cells, gameOver: true, won: false };
  }
  const cells = current.cells.map((cell) => ({ ...cell }));
  const queue = [index];
  while (queue.length) {
    const cellIndex = queue.pop()!;
    const cell = cells[cellIndex];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.adjacent === 0) queue.push(...minesweeperNeighbors(cellIndex, current.rows, current.columns));
  }
  current = { ...current, cells };
  return updateMineOutcome(current);
}

export function toggleMinesweeperFlag(state: MinesweeperState, index: number): MinesweeperState {
  if (state.gameOver || index < 0 || index >= state.cells.length || state.cells[index].revealed) return state;
  const cells = state.cells.map((cell, cellIndex) => cellIndex === index ? { ...cell, flagged: !cell.flagged } : cell);
  return { ...state, cells };
}

export function chordMinesweeperCell(
  state: MinesweeperState,
  index: number,
  random: () => number = Math.random,
): MinesweeperState {
  if (state.gameOver || !state.cells[index]?.revealed || state.cells[index].adjacent === 0) return state;
  const neighbors = minesweeperNeighbors(index, state.rows, state.columns);
  if (neighbors.filter((neighbor) => state.cells[neighbor].flagged).length !== state.cells[index].adjacent) return state;
  return neighbors.reduce((current, neighbor) => revealMinesweeperCell(current, neighbor, random), state);
}

export type PongDifficulty = "easy" | "normal" | "hard";
export type PongState = {
  width: number;
  height: number;
  ball: { x: number; y: number; vx: number; vy: number };
  playerY: number;
  opponentY: number;
  playerScore: number;
  opponentScore: number;
  targetScore: number;
  serveSeconds: number;
  rally: number;
  opponentTargetY: number;
  opponentReactionSeconds: number;
  status: "playing" | "playerWon" | "opponentWon";
};
export type PongInput = { player: -1 | 0 | 1; opponent: -1 | 0 | 1; twoPlayer: boolean; difficulty: PongDifficulty };

export function createPongState(targetScore = 7, serveTo: 1 | -1 = 1): PongState {
  return {
    width: 800,
    height: 450,
    ball: { x: 400, y: 225, vx: 300 * serveTo, vy: 90 },
    playerY: 225,
    opponentY: 225,
    playerScore: 0,
    opponentScore: 0,
    targetScore,
    serveSeconds: 0,
    rally: 0,
    opponentTargetY: 225,
    opponentReactionSeconds: 0,
    status: "playing",
  };
}

function reflectPongY(y: number, height: number): number {
  const min = 10;
  const span = height - 20;
  const position = ((y - min) % (span * 2) + span * 2) % (span * 2);
  return min + (position <= span ? position : span * 2 - position);
}

export function predictPongInterceptY(state: PongState, x: number): number {
  if (state.ball.vx <= 0) return state.ball.y;
  const seconds = Math.max(0, (x - state.ball.x) / state.ball.vx);
  return reflectPongY(state.ball.y + state.ball.vy * seconds, state.height);
}

function movePongPaddle(current: number, target: number, speed: number, dt: number, limit: number): number {
  const difference = target - current;
  return Math.max(41, Math.min(limit, current + Math.sign(difference) * Math.min(Math.abs(difference), speed * dt)));
}

export function stepPong(state: PongState, deltaSeconds: number, input: PongInput): PongState {
  if (state.status !== "playing") return state;
  const dt = Math.max(0, Math.min(deltaSeconds, 0.05));
  const paddleHeight = 82;
  const paddleLimit = state.height - paddleHeight / 2;
  const paddleSpeed = 430;
  let playerY = movePongPaddle(state.playerY, state.playerY + input.player * paddleSpeed * dt, paddleSpeed, dt, paddleLimit);
  let opponentY = state.opponentY;
  let opponentTargetY = state.opponentTargetY;
  let opponentReactionSeconds = state.opponentReactionSeconds - dt;
  if (input.twoPlayer) {
    opponentY = movePongPaddle(state.opponentY, state.opponentY + input.opponent * paddleSpeed * dt, paddleSpeed, dt, paddleLimit);
  } else {
    const difficulty = {
      easy: { speed: 190, reaction: 0.42, error: 56, strike: 0.08 },
      normal: { speed: 430, reaction: 0.12, error: 10, strike: 0.8 },
      hard: { speed: 500, reaction: 0.065, error: 4, strike: 0.86 },
    }[input.difficulty];
    if (state.ball.vx > 0 && opponentReactionSeconds <= 0) {
      const intercept = predictPongInterceptY(state, state.width - 34);
      const matchPoint = state.playerScore + state.opponentScore + 1;
      const wave = Math.sin(matchPoint * 2.17);
      const strikeOffset = (wave < 0 ? -1 : 1) * difficulty.strike;
      const angleFactor = input.difficulty === "easy" ? Math.min(1, Math.abs(state.ball.vy) / 240) : 1;
      const positioningError = Math.sin(matchPoint * 4.31) * difficulty.error * angleFactor;
      opponentTargetY = Math.max(41, Math.min(paddleLimit, intercept - strikeOffset * (paddleHeight / 2) + positioningError));
      opponentReactionSeconds = difficulty.reaction;
    } else if (state.ball.vx <= 0) {
      opponentTargetY = state.height / 2;
      opponentReactionSeconds = Math.min(opponentReactionSeconds, 0);
    }
    opponentY = movePongPaddle(state.opponentY, opponentTargetY, difficulty.speed, dt, paddleLimit);
  }
  if (state.serveSeconds > 0) {
    const serveSeconds = Math.max(0, state.serveSeconds - dt);
    return { ...state, playerY, opponentY, opponentTargetY, opponentReactionSeconds, serveSeconds };
  }
  const ball = { ...state.ball };
  const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 10));
  const step = dt / steps;
  for (let index = 0; index < steps; index += 1) {
    const oldX = ball.x;
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;
    if (ball.y < 10 || ball.y > state.height - 10) {
      ball.y = Math.max(10, Math.min(state.height - 10, ball.y));
      ball.vy *= -1;
    }
    if (ball.vx < 0 && oldX >= 34 && ball.x <= 34) {
      if (Math.abs(ball.y - playerY) <= paddleHeight / 2 + 10) {
        const offset = (ball.y - playerY) / (paddleHeight / 2);
        const speed = Math.min(850, Math.hypot(ball.vx, ball.vy) * 1.045);
        const angle = offset * 0.92;
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.x = 34;
      } else ball.x = -11;
    } else if (ball.vx > 0 && oldX <= state.width - 34 && ball.x >= state.width - 34) {
      if (Math.abs(ball.y - opponentY) <= paddleHeight / 2 + 10) {
        const offset = (ball.y - opponentY) / (paddleHeight / 2);
        const speed = Math.min(850, Math.hypot(ball.vx, ball.vy) * 1.045);
        const angle = offset * 0.92;
        ball.vx = -Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.x = state.width - 34;
      } else ball.x = state.width + 11;
    }
  }
  if (ball.x < -10 || ball.x > state.width + 10) {
    const playerScored = ball.x > state.width;
    const playerScore = state.playerScore + Number(playerScored);
    const opponentScore = state.opponentScore + Number(!playerScored);
    const status = playerScore >= state.targetScore ? "playerWon" : opponentScore >= state.targetScore ? "opponentWon" : "playing";
    const next = createPongState(state.targetScore, playerScored ? 1 : -1);
    return {
      ...next,
      playerY,
      opponentY,
      playerScore,
      opponentScore,
      status,
      serveSeconds: status === "playing" ? 0.7 : 0,
      rally: state.rally + 1,
    };
  }
  return { ...state, ball, playerY, opponentY, opponentTargetY, opponentReactionSeconds, rally: state.rally + 1 };
}

export type SudokuDifficulty = "easy" | "normal" | "hard";
export type SudokuPuzzle = { puzzle: number[]; solution: number[]; difficulty: SudokuDifficulty; rating: number };

function sudokuCandidates(board: readonly number[], index: number): number[] {
  const row = Math.floor(index / 9);
  const column = index % 9;
  const used = new Set<number>();
  for (let i = 0; i < 9; i += 1) {
    used.add(board[row * 9 + i]);
    used.add(board[i * 9 + column]);
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  for (let y = boxRow; y < boxRow + 3; y += 1) for (let x = boxColumn; x < boxColumn + 3; x += 1) used.add(board[y * 9 + x]);
  return Array.from({ length: 9 }, (_, value) => value + 1).filter((value) => !used.has(value));
}

export function isValidSudokuBoard(board: readonly number[], allowEmpty = true): boolean {
  if (board.length !== 81 || board.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) return false;
  if (!allowEmpty && board.some((value) => value === 0)) return false;
  for (let group = 0; group < 9; group += 1) {
    const row = new Set<number>();
    const column = new Set<number>();
    const box = new Set<number>();
    for (let offset = 0; offset < 9; offset += 1) {
      const rowValue = board[group * 9 + offset];
      const columnValue = board[offset * 9 + group];
      const boxValue = board[Math.floor(group / 3) * 27 + Math.floor(group % 3) * 3 + Math.floor(offset / 3) * 9 + offset % 3];
      if (rowValue && row.has(rowValue) || columnValue && column.has(columnValue) || boxValue && box.has(boxValue)) return false;
      if (rowValue) row.add(rowValue);
      if (columnValue) column.add(columnValue);
      if (boxValue) box.add(boxValue);
    }
  }
  return true;
}

function countSolutions(board: number[], limit: number): number {
  let selected = -1;
  let candidates: number[] = [];
  for (let index = 0; index < board.length; index += 1) {
    if (board[index]) continue;
    const options = sudokuCandidates(board, index);
    if (options.length === 0) return 0;
    if (selected < 0 || options.length < candidates.length) {
      selected = index;
      candidates = options;
      if (options.length === 1) break;
    }
  }
  if (selected < 0) return 1;
  let solutions = 0;
  for (const value of candidates) {
    board[selected] = value;
    solutions += countSolutions(board, limit - solutions);
    board[selected] = 0;
    if (solutions >= limit) break;
  }
  return solutions;
}

export function countSudokuSolutions(board: readonly number[], limit = 2): number {
  if (!isValidSudokuBoard(board) || limit < 1) return 0;
  return countSolutions([...board], limit);
}

export function solveSudokuEffort(board: readonly number[]): number {
  const logical = [...board];
  let nakedSingles = 0;
  let hiddenSingles = 0;
  while (true) {
    let placed = false;
    for (let index = 0; index < 81; index += 1) {
      if (logical[index]) continue;
      const options = sudokuCandidates(logical, index);
      if (options.length === 1) {
        logical[index] = options[0];
        nakedSingles += 1;
        placed = true;
        break;
      }
    }
    if (placed) continue;
    const units = [
      ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row * 9 + column)),
      ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, row) => row * 9 + column)),
      ...Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, offset) =>
        Math.floor(box / 3) * 27 + (box % 3) * 3 + Math.floor(offset / 3) * 9 + offset % 3,
      )),
    ];
    for (const unit of units) {
      const present = new Set(unit.map((index) => logical[index]).filter(Boolean));
      for (let value = 1; value <= 9; value += 1) {
        if (present.has(value)) continue;
        const locations = unit.filter((index) => !logical[index] && sudokuCandidates(logical, index).includes(value));
        if (locations.length === 1) {
          logical[locations[0]] = value;
          hiddenSingles += 1;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) break;
  }
  const working = [...board];
  let branches = 0;
  let deepestBranch = 0;
  function solve(depth = 0): boolean {
    let selected = -1;
    let candidates: number[] = [];
    for (let index = 0; index < 81; index += 1) {
      if (working[index]) continue;
      const options = sudokuCandidates(working, index);
      if (options.length === 0) return false;
      if (selected < 0 || options.length < candidates.length) {
        selected = index;
        candidates = options;
        if (options.length === 1) break;
      }
    }
    if (selected < 0) return true;
    if (candidates.length > 1) {
      branches += candidates.length;
      deepestBranch = Math.max(deepestBranch, depth + 1);
    }
    for (const value of candidates) {
      working[selected] = value;
      if (solve(depth + 1)) return true;
      working[selected] = 0;
    }
    return false;
  }
  solve();
  const clues = board.filter(Boolean).length;
  return (81 - clues) + nakedSingles + hiddenSingles * 3 + branches * 12 + deepestBranch * 8;
}

function randomize<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const choice = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [result[index], result[choice]] = [result[choice], result[index]];
  }
  return result;
}

function fillSudoku(board: number[], random: () => number): boolean {
  let selected = -1;
  let candidates: number[] = [];
  for (let index = 0; index < 81; index += 1) {
    if (board[index]) continue;
    const options = sudokuCandidates(board, index);
    if (options.length === 0) return false;
    if (selected < 0 || options.length < candidates.length) {
      selected = index;
      candidates = options;
      if (options.length === 1) break;
    }
  }
  if (selected < 0) return true;
  for (const value of randomize(candidates, random)) {
    board[selected] = value;
    if (fillSudoku(board, random)) return true;
    board[selected] = 0;
  }
  return false;
}

const sudokuClueTargets: Record<SudokuDifficulty, number> = { easy: 40, normal: 33, hard: 28 };

function generateSudokuCandidate(difficulty: SudokuDifficulty, random: () => number): SudokuPuzzle {
  const solution = Array(81).fill(0) as number[];
  if (!fillSudoku(solution, random)) throw new Error("Could not generate a valid Sudoku solution.");
  const puzzle = [...solution];
  const target = sudokuClueTargets[difficulty];
  for (const index of randomize(Array.from({ length: 81 }, (_, value) => value), random)) {
    if (puzzle.filter(Boolean).length <= target) break;
    const previous = puzzle[index];
    puzzle[index] = 0;
    if (countSudokuSolutions(puzzle, 2) !== 1) puzzle[index] = previous;
  }
  const rating = solveSudokuEffort(puzzle);
  return { puzzle, solution, difficulty, rating };
}

export function createSudokuPuzzle(difficulty: SudokuDifficulty, random: () => number = Math.random): SudokuPuzzle {
  const candidates = [generateSudokuCandidate(difficulty, random), generateSudokuCandidate(difficulty, random)];
  return difficulty === "easy"
    ? candidates.reduce((best, candidate) => candidate.rating < best.rating ? candidate : best)
    : candidates.reduce((challenging, candidate) => candidate.rating > challenging.rating ? candidate : challenging);
}

export function sudokuIsComplete(board: readonly number[], solution: readonly number[]): boolean {
  return board.length === 81 && solution.length === 81 && board.every((value, index) => value === solution[index]);
}
