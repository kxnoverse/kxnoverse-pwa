export type FlappyObstacle = { x: number; gapY: number; scored: boolean };
export type FlappyState = {
  width: number;
  height: number;
  birdY: number;
  velocityY: number;
  obstacles: FlappyObstacle[];
  score: number;
  started: boolean;
  gameOver: boolean;
  elapsed: number;
  physicsRemainder: number;
  pendingFlap: boolean;
};

export const flappyGapHeight = 154;
const flappyBirdX = 92;
const flappyBirdRadius = 13;
const flappyPipeWidth = 58;

export function createFlappyState(): FlappyState {
  return { width: 440, height: 520, birdY: 250, velocityY: 0, obstacles: [], score: 0, started: false, gameOver: false, elapsed: 0, physicsRemainder: 0, pendingFlap: false };
}

function nextGapY(random: () => number): number {
  const margin = flappyGapHeight / 2 + 42;
  return margin + Math.min(0.999999, Math.max(0, random())) * (520 - margin * 2);
}

function flappyCollision(state: FlappyState): boolean {
  const radius = flappyBirdRadius;
  if (state.birdY - radius <= 0 || state.birdY + radius >= state.height - 24) return true;
  return state.obstacles.some(({ x, gapY }) => {
    const overlapX = flappyBirdX + radius > x && flappyBirdX - radius < x + flappyPipeWidth;
    return overlapX && (state.birdY - radius < gapY - flappyGapHeight / 2 || state.birdY + radius > gapY + flappyGapHeight / 2);
  });
}

export function stepFlappy(
  initial: FlappyState,
  deltaSeconds: number,
  flap = false,
  random: () => number = Math.random,
): FlappyState {
  if (initial.gameOver || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return initial;
  if (!initial.started) {
    if (!flap) return initial;
    initial = {
      ...initial,
      started: true,
      velocityY: -385,
      obstacles: [{ x: initial.width + 40, gapY: nextGapY(random), scored: false }],
    };
  } else if (flap) initial = { ...initial, pendingFlap: true };

  let state = initial;
  let remaining = Math.min(deltaSeconds, 0.1) + (Number.isFinite(initial.physicsRemainder) ? initial.physicsRemainder : 0);
  const fixedStep = 1 / 120;
  while (remaining + 1e-10 >= fixedStep && !state.gameOver) {
    remaining = Math.max(0, remaining - fixedStep);
    const velocity = state.pendingFlap ? -385 : state.velocityY;
    const speed = Math.min(260, 178 + state.score * 3.2);
    let obstacles = state.obstacles.map((obstacle) => ({ ...obstacle, x: obstacle.x - speed * fixedStep }));
    if (obstacles.length && obstacles[0].x + flappyPipeWidth < flappyBirdX && !obstacles[0].scored) {
      state = { ...state, score: state.score + 1 };
      obstacles[0].scored = true;
    }
    obstacles = obstacles.filter((obstacle) => obstacle.x + flappyPipeWidth > -2);
    if (!obstacles.length || obstacles[obstacles.length - 1].x < state.width - 205) {
      const previous = obstacles[obstacles.length - 1];
      const gapY = nextGapY(random);
      const fair = !previous || Math.abs(gapY - previous.gapY) <= flappyGapHeight * 0.72;
      obstacles.push({
        x: previous ? previous.x + 205 + (fair ? 0 : 80) : state.width + 40,
        gapY: fair ? gapY : Math.max(flappyGapHeight / 2 + 42, Math.min(state.height - flappyGapHeight / 2 - 42, previous!.gapY + Math.sign(gapY - previous!.gapY) * flappyGapHeight * 0.72)),
        scored: false,
      });
    }
    const velocityY = Math.min(640, velocity + 980 * fixedStep);
    const birdY = state.birdY + velocityY * fixedStep;
    state = {
      ...state,
      birdY,
      velocityY,
      obstacles,
      elapsed: state.elapsed + fixedStep,
      physicsRemainder: remaining,
      pendingFlap: false,
    };
    if (flappyCollision(state)) state = { ...state, gameOver: true };
  }
  return { ...state, physicsRemainder: remaining };
}

export type ConnectDifficulty = "easy" | "normal" | "hard";
export type ConnectState = {
  board: number[];
  turn: 1 | 2;
  status: "playing" | "redWon" | "yellowWon" | "draw";
  winningCells: number[];
  lastMove: number | null;
};

export const connectRows = 6;
export const connectColumns = 7;

export function createConnectState(): ConnectState {
  return { board: Array(connectRows * connectColumns).fill(0), turn: 1, status: "playing", winningCells: [], lastMove: null };
}

export function connectWinningCells(board: readonly number[], player: 1 | 2): number[] {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let row = 0; row < connectRows; row += 1) for (let column = 0; column < connectColumns; column += 1) {
    const start = row * connectColumns + column;
    if (board[start] !== player) continue;
    for (const [dy, dx] of directions) {
      const cells = Array.from({ length: 4 }, (_, offset) => {
        const y = row + dy * offset;
        const x = column + dx * offset;
        return y >= 0 && y < connectRows && x >= 0 && x < connectColumns ? y * connectColumns + x : -1;
      });
      if (cells.every((cell) => cell >= 0 && board[cell] === player)) return cells;
    }
  }
  return [];
}

export function playConnectColumn(state: ConnectState, column: number): ConnectState {
  if (state.status !== "playing" || !Number.isInteger(column) || column < 0 || column >= connectColumns) return state;
  let row = connectRows - 1;
  while (row >= 0 && state.board[row * connectColumns + column] !== 0) row -= 1;
  if (row < 0) return state;
  const index = row * connectColumns + column;
  const board = [...state.board];
  board[index] = state.turn;
  const winningCells = connectWinningCells(board, state.turn);
  const status = winningCells.length ? state.turn === 1 ? "redWon" : "yellowWon"
    : board.every(Boolean) ? "draw" : "playing";
  return { board, turn: state.turn === 1 ? 2 : 1, status, winningCells, lastMove: index };
}

function connectLegalColumns(board: readonly number[]): number[] {
  return [3, 2, 4, 1, 5, 0, 6].filter((column) => board[column] === 0);
}

function hasConnectWin(board: readonly number[], player: 1 | 2): boolean {
  return connectWinningCells(board, player).length > 0;
}

function evaluateConnectBoard(board: readonly number[], player: 1 | 2): number {
  let score = 0;
  for (let row = 0; row < connectRows; row += 1) for (let column = 0; column < connectColumns; column += 1) {
    for (const [dy, dx] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = Array.from({ length: 4 }, (_, offset) => {
        const y = row + dy * offset;
        const x = column + dx * offset;
        return y >= 0 && y < connectRows && x >= 0 && x < connectColumns ? board[y * connectColumns + x] : -1;
      });
      if (cells.includes(-1)) continue;
      const own = cells.filter((value) => value === player).length;
      const other = cells.filter((value) => value === (player === 1 ? 2 : 1)).length;
      if (own && !other) score += [0, 2, 14, 110, 10000][own];
      if (other && !own) score -= [0, 3, 20, 160, 12000][other];
    }
  }
  for (let row = 0; row < connectRows; row += 1) score += (board[row * connectColumns + 3] === player ? 5 : board[row * connectColumns + 3] ? -5 : 0);
  return score;
}

function simulateConnect(board: readonly number[], column: number, player: 1 | 2): number[] {
  const next = [...board];
  for (let row = connectRows - 1; row >= 0; row -= 1) {
    const index = row * connectColumns + column;
    if (!next[index]) { next[index] = player; break; }
  }
  return next;
}

function searchConnect(board: number[], turn: 1 | 2, depth: number, alpha: number, beta: number): number {
  if (hasConnectWin(board, 2)) return 100000 + depth;
  if (hasConnectWin(board, 1)) return -100000 - depth;
  const columns = connectLegalColumns(board);
  if (!depth || !columns.length) return evaluateConnectBoard(board, 2);
  if (turn === 2) {
    let best = -Infinity;
    for (const column of columns) {
      best = Math.max(best, searchConnect(simulateConnect(board, column, 2), 1, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const column of columns) {
    best = Math.min(best, searchConnect(simulateConnect(board, column, 1), 2, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseConnectColumn(
  state: ConnectState,
  difficulty: ConnectDifficulty,
  random: () => number = Math.random,
): number | null {
  if (state.status !== "playing") return null;
  const legal = connectLegalColumns(state.board);
  if (!legal.length) return null;
  const findsWin = (player: 1 | 2) => legal.find((column) => hasConnectWin(simulateConnect(state.board, column, player), player));
  if (difficulty !== "easy") {
    const win = findsWin(2);
    if (win !== undefined) return win;
    const block = findsWin(1);
    if (block !== undefined) return block;
  }
  if (difficulty === "easy") return legal[Math.min(legal.length - 1, Math.floor(Math.max(0, random()) * legal.length))];
  if (difficulty === "normal") return legal.reduce((best, column) =>
    evaluateConnectBoard(simulateConnect(state.board, column, 2), 2) > evaluateConnectBoard(simulateConnect(state.board, best, 2), 2) ? column : best, legal[0]);
  let best = legal[0];
  let bestScore = -Infinity;
  for (const column of legal) {
    const score = searchConnect(simulateConnect(state.board, column, 2), 1, 5, -Infinity, Infinity);
    if (score > bestScore) { bestScore = score; best = column; }
  }
  return best;
}

export type MazeDifficulty = "easy" | "normal" | "hard";
export type MazeState = {
  rows: number;
  columns: number;
  walls: number[];
  player: number;
  finish: number;
  moves: number;
  complete: boolean;
};

const mazeDimensions: Record<MazeDifficulty, { rows: number; columns: number }> = {
  easy: { rows: 8, columns: 8 },
  normal: { rows: 10, columns: 12 },
  hard: { rows: 12, columns: 16 },
};
const north = 1;
const east = 2;
const south = 4;
const west = 8;

export function createMaze(
  difficulty: MazeDifficulty,
  random: () => number = Math.random,
): MazeState {
  const { rows, columns } = mazeDimensions[difficulty];
  const walls = Array(rows * columns).fill(north | east | south | west) as number[];
  const visited = new Set<number>([0]);
  const stack = [0];
  const directions = [
    { dy: -1, dx: 0, wall: north, opposite: south },
    { dy: 0, dx: 1, wall: east, opposite: west },
    { dy: 1, dx: 0, wall: south, opposite: north },
    { dy: 0, dx: -1, wall: west, opposite: east },
  ];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const row = Math.floor(current / columns);
    const column = current % columns;
    const candidates = directions.flatMap((direction) => {
      const y = row + direction.dy;
      const x = column + direction.dx;
      const index = y * columns + x;
      return y >= 0 && y < rows && x >= 0 && x < columns && !visited.has(index) ? [{ index, direction }] : [];
    });
    if (!candidates.length) { stack.pop(); continue; }
    const choice = candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))];
    walls[current] &= ~choice.direction.wall;
    walls[choice.index] &= ~choice.direction.opposite;
    visited.add(choice.index);
    stack.push(choice.index);
  }
  return { rows, columns, walls, player: 0, finish: rows * columns - 1, moves: 0, complete: false };
}

export function mazePath(state: Pick<MazeState, "rows" | "columns" | "walls" | "player" | "finish">): number[] {
  const directions = [
    { wall: north, dy: -1, dx: 0 },
    { wall: east, dy: 0, dx: 1 },
    { wall: south, dy: 1, dx: 0 },
    { wall: west, dy: 0, dx: -1 },
  ];
  const queue = [state.player];
  const previous = new Map<number, number>([[state.player, -1]]);
  for (let head = 0; head < queue.length && !previous.has(state.finish); head += 1) {
    const current = queue[head];
    const row = Math.floor(current / state.columns);
    const column = current % state.columns;
    for (const direction of directions) {
      if (state.walls[current] & direction.wall) continue;
      const y = row + direction.dy;
      const x = column + direction.dx;
      if (y < 0 || y >= state.rows || x < 0 || x >= state.columns) continue;
      const next = y * state.columns + x;
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(state.finish)) return [];
  const path = [state.finish];
  while (path[path.length - 1] !== state.player) path.push(previous.get(path[path.length - 1])!);
  return path.reverse();
}

export function moveMaze(state: MazeState, direction: "up" | "right" | "down" | "left"): MazeState {
  if (state.complete) return state;
  const wallsByDirection = { up: north, right: east, down: south, left: west };
  const deltas = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] } as const;
  const wall = wallsByDirection[direction];
  if (state.walls[state.player] & wall) return state;
  const row = Math.floor(state.player / state.columns);
  const column = state.player % state.columns;
  const [dy, dx] = deltas[direction];
  const y = row + dy;
  const x = column + dx;
  if (y < 0 || y >= state.rows || x < 0 || x >= state.columns) return state;
  const player = y * state.columns + x;
  return { ...state, player, moves: state.moves + 1, complete: player === state.finish };
}
