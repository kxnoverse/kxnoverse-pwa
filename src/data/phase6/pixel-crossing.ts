export type CrossingStatus = "ready" | "playing" | "paused" | "over";
export type CrossingLaneKind = "safe" | "road" | "river";

export interface CrossingObstacle {
  x: number;
  width: number;
  variant: number;
}

export interface CrossingRow {
  kind: CrossingLaneKind;
  direction: -1 | 1;
  speed: number;
  obstacles: CrossingObstacle[];
}

export interface PixelCrossingState {
  playerX: number;
  playerY: number;
  rows: CrossingRow[];
  score: number;
  furthest: number;
  cameraDistance: number;
  collision: "road" | "river" | "edge" | null;
  status: CrossingStatus;
}

export const CROSSING_COLUMNS = 15;
export const CROSSING_ROWS = 13;

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function createRow(random: () => number, safe = false, forcedKind?: CrossingLaneKind): CrossingRow {
  if (safe) return { kind: "safe", direction: 1, speed: 0, obstacles: [] };
  const roll = random();
  const kind: CrossingLaneKind = forcedKind ?? (roll < 0.48 ? "road" : roll < 0.68 ? "river" : "safe");
  if (kind === "safe") return { kind, direction: 1, speed: 0, obstacles: [] };
  const direction = random() < 0.5 ? -1 : 1;
  const speed = randomBetween(random, 0.55, kind === "road" ? 1.3 : 0.85);
  const count = kind === "road" ? 2 : 3;
  const obstacles = Array.from({ length: count }, (_, index) => ({
    x: (index * (CROSSING_COLUMNS / count) + random() * 2) % CROSSING_COLUMNS,
    width: kind === "road" ? randomBetween(random, 0.7, 1.35) : randomBetween(random, 2.1, 3.2),
    variant: Math.floor(random() * 3),
  }));
  return { kind, direction, speed, obstacles };
}

export function createPixelCrossing(random = Math.random): PixelCrossingState {
  return {
    playerX: 7,
    playerY: 10,
    rows: Array.from({ length: CROSSING_ROWS }, (_, index) => createRow(
      random,
      index === 0 || index === 9 || index === 10 || index === 12,
      index === 6 ? "river" : index === 8 ? "road" : undefined,
    )),
    score: 0,
    furthest: 0,
    cameraDistance: 0,
    collision: null,
    status: "ready",
  };
}

export function startPixelCrossing(state: PixelCrossingState): PixelCrossingState {
  return state.status === "ready" ? { ...state, status: "playing" } : state;
}

export function isCrossingPositionSafe(state: PixelCrossingState, playerX = state.playerX, playerY = state.playerY): boolean {
  const row = state.rows[playerY];
  if (!row || row.kind === "safe") return true;
  if (row.kind === "road") {
    return !row.obstacles.some((obstacle) =>
      playerX + 0.72 > obstacle.x && playerX < obstacle.x + obstacle.width);
  }
  return row.obstacles.some((log) => playerX + 0.88 > log.x && playerX < log.x + log.width);
}

export function movePixelCrossing(
  state: PixelCrossingState,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
  random = Math.random,
): PixelCrossingState {
  if (state.status !== "playing" || Math.abs(dx) + Math.abs(dy) !== 1) return state;
  let playerX = Math.max(0, Math.min(CROSSING_COLUMNS - 1, state.playerX + dx));
  let playerY = state.playerY + dy;
  let rows = state.rows;
  let cameraDistance = state.cameraDistance;
  if (dy < 0 && state.playerY === 4) {
    rows = [createRow(random), ...rows.slice(0, CROSSING_ROWS - 1)];
    playerY = 4;
    cameraDistance += 1;
  }
  playerY = Math.max(0, Math.min(CROSSING_ROWS - 1, playerY));
  const progress = cameraDistance + 10 - playerY;
  const furthest = Math.max(state.furthest, progress);
  const next = {
    ...state,
    playerX,
    playerY,
    rows,
    cameraDistance,
    furthest,
    score: furthest,
    collision: null,
  };
  if (!isCrossingPositionSafe(next)) {
    const row = rows[playerY];
    return {
      ...next,
      collision: row?.kind === "river" ? "river" : "road",
      status: "over",
    };
  }
  return next;
}

function wrapX(x: number, width: number): number {
  const total = CROSSING_COLUMNS + width;
  return ((x + width) % total + total) % total - width;
}

export function stepPixelCrossing(state: PixelCrossingState, deltaSeconds: number): PixelCrossingState {
  if (state.status !== "playing") return state;
  const delta = Math.max(0, Math.min(0.05, deltaSeconds));
  const playerRow = state.rows[state.playerY];
  const supported = playerRow?.kind === "river" && isCrossingPositionSafe(state);
  const rows = state.rows.map((row) => row.kind === "safe" ? row : ({
    ...row,
    obstacles: row.obstacles.map((obstacle) => ({
      ...obstacle,
      x: wrapX(obstacle.x + row.direction * row.speed * delta, obstacle.width),
    })),
  }));
  const playerX = supported && playerRow ? state.playerX + playerRow.direction * playerRow.speed * delta : state.playerX;
  const next = { ...state, rows, playerX };
  const safe = playerX >= 0 && playerX <= CROSSING_COLUMNS - 1 && isCrossingPositionSafe(next);
  return safe ? next : { ...next, collision: playerX < 0 || playerX > CROSSING_COLUMNS - 1 ? "edge" : "river", status: "over" };
}

export function resetPixelCrossing(random = Math.random): PixelCrossingState {
  return createPixelCrossing(random);
}
