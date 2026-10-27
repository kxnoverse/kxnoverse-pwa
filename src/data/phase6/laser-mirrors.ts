export type MirrorDirection = "right" | "down" | "left" | "up";
export type MirrorOrientation = "/" | "\\";
export type LaserDifficulty = "easy" | "medium" | "hard" | "expert";

export interface LaserPoint {
  x: number;
  y: number;
}

export interface LaserEmitter extends LaserPoint {
  direction: MirrorDirection;
  receiverIndex: number;
}

export interface LaserMirror extends LaserPoint {
  orientation: MirrorOrientation;
}

export interface LaserPuzzle {
  size: number;
  difficulty: LaserDifficulty;
  seed: number;
  emitters: LaserEmitter[];
  receivers: LaserPoint[];
  mirrors: LaserMirror[];
  blockers: LaserPoint[];
  requiredRotations: number;
  pathLength: number;
  fingerprint: string;
}

export interface LaserMirrorsState extends LaserPuzzle {
  level: number;
  history: MirrorOrientation[][];
  complete: boolean;
}

export interface LaserTrace {
  paths: LaserPoint[][];
  hits: boolean[];
  hit: boolean;
  blocked: boolean;
}

interface DifficultyConfig {
  size: number;
  turnsPerBeam: number;
  beamCount: number;
  blockers: number;
  decoys: number;
  minimumRotations: number;
  minimumPathLength: number;
}

const difficultyConfig: Record<LaserDifficulty, DifficultyConfig> = {
  easy: { size: 6, turnsPerBeam: 2, beamCount: 1, blockers: 0, decoys: 0, minimumRotations: 2, minimumPathLength: 8 },
  medium: { size: 8, turnsPerBeam: 4, beamCount: 1, blockers: 2, decoys: 1, minimumRotations: 3, minimumPathLength: 13 },
  hard: { size: 10, turnsPerBeam: 6, beamCount: 1, blockers: 4, decoys: 2, minimumRotations: 5, minimumPathLength: 20 },
  expert: { size: 12, turnsPerBeam: 4, beamCount: 2, blockers: 8, decoys: 4, minimumRotations: 6, minimumPathLength: 30 },
};

const delta: Record<MirrorDirection, LaserPoint> = {
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  up: { x: 0, y: -1 },
};

function hashSeed(value: number, salt: number): number {
  let seed = (value ^ salt) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  return (seed ^ (seed >>> 16)) >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
}

function choice<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

function movePath(path: LaserPoint[], x: number, y: number): void {
  let current = path[path.length - 1];
  const dx = Math.sign(x - current.x);
  const dy = Math.sign(y - current.y);
  while (current.x !== x || current.y !== y) {
    path.push({ x: current.x + dx, y: current.y + dy });
    current = path[path.length - 1];
  }
}

function makeRoute(
  size: number,
  startY: number,
  band: [number, number],
  turnPositions: number[],
  random: () => number,
): { emitter: LaserEmitter; receiver: LaserPoint; path: LaserPoint[]; solution: LaserMirror[] } {
  let y = startY;
  let path: LaserPoint[] = [{ x: 0, y }];
  const solution: LaserMirror[] = [];
  for (let pair = 0; pair < turnPositions.length; pair += 2) {
    const firstX = turnPositions[pair];
    const secondX = turnPositions[pair + 1];
    movePath(path, firstX, y);
    const possibleRows = Array.from({ length: band[1] - band[0] + 1 }, (_, index) => band[0] + index)
      .filter((row) => row !== y);
    const nextY = choice(possibleRows, random);
    const orientation: MirrorOrientation = nextY > y ? "\\" : "/";
    solution.push({ x: firstX, y, orientation });
    movePath(path, firstX, nextY);
    solution.push({ x: firstX, y: nextY, orientation });
    movePath(path, secondX, nextY);
    y = nextY;
  }
  movePath(path, size - 1, y);
  return {
    emitter: { x: 0, y: startY, direction: "right", receiverIndex: 0 },
    receiver: { x: size - 1, y },
    path,
    solution,
  };
}

function reverse(orientation: MirrorOrientation): MirrorOrientation {
  return orientation === "/" ? "\\" : "/";
}

function countBits(value: number): number {
  let count = 0;
  for (let bits = value; bits; bits &= bits - 1) count += 1;
  return count;
}

function reflect(direction: MirrorDirection, orientation: MirrorOrientation): MirrorDirection {
  if (orientation === "/") {
    return ({ right: "up", up: "right", left: "down", down: "left" } as const)[direction];
  }
  return ({ right: "down", down: "right", left: "up", up: "left" } as const)[direction];
}

function traceEmitter(state: LaserPuzzle, emitter: LaserEmitter): { path: LaserPoint[]; hit: boolean; blocked: boolean } {
  let position = { x: emitter.x, y: emitter.y };
  let direction = emitter.direction;
  const path = [position];
  const visited = new Set<string>();
  const receiver = state.receivers[emitter.receiverIndex];
  for (let count = 0; count < state.size * state.size * 4; count += 1) {
    const step = delta[direction];
    position = { x: position.x + step.x, y: position.y + step.y };
    if (position.x < 0 || position.x >= state.size || position.y < 0 || position.y >= state.size) {
      return { path, hit: false, blocked: false };
    }
    path.push(position);
    const receiverIndex = state.receivers.findIndex((item) => item.x === position.x && item.y === position.y);
    if (receiverIndex >= 0) return { path, hit: receiverIndex === emitter.receiverIndex, blocked: false };
    if (state.blockers.some((item) => item.x === position.x && item.y === position.y)) {
      return { path, hit: false, blocked: true };
    }
    const key = `${position.x},${position.y},${direction}`;
    if (visited.has(key)) return { path, hit: false, blocked: false };
    visited.add(key);
    const mirror = state.mirrors.find((item) => item.x === position.x && item.y === position.y);
    if (mirror) direction = reflect(direction, mirror.orientation);
  }
  return { path, hit: Boolean(receiver && position.x === receiver.x && position.y === receiver.y), blocked: false };
}

export function traceLaser(state: LaserPuzzle): LaserTrace {
  const traces = state.emitters.map((emitter) => traceEmitter(state, emitter));
  const hits = traces.map((trace) => trace.hit);
  return {
    paths: traces.map((trace) => trace.path),
    hits,
    hit: hits.length > 0 && hits.every(Boolean),
    blocked: traces.some((trace) => trace.blocked),
  };
}

export function solveLaserPuzzle(state: LaserPuzzle): number[] | null {
  const combinations = 1 << state.mirrors.length;
  const original = state.mirrors;
  for (let flips = 0; flips <= original.length; flips += 1) {
    for (let mask = 0; mask < combinations; mask += 1) {
      if (countBits(mask) !== flips) continue;
      const mirrors = original.map((mirror, index) =>
        (mask & (1 << index)) ? { ...mirror, orientation: reverse(mirror.orientation) } : mirror);
      if (traceLaser({ ...state, mirrors }).hit) {
        return original.flatMap((_, index) => mask & (1 << index) ? [index] : []);
      }
    }
  }
  return null;
}

function routeForDifficulty(
  config: DifficultyConfig,
  random: () => number,
): Array<ReturnType<typeof makeRoute>> {
  const split = Math.floor(config.size / 2);
  const bands: Array<[number, number]> = config.beamCount === 1
    ? [[1, config.size - 2]]
    : [[1, split - 2], [split + 1, config.size - 2]];
  return bands.map((band) => {
    const startY = Math.floor(random() * (band[1] - band[0] + 1)) + band[0];
    const xPositions = Array.from({ length: config.size - 2 }, (_, index) => index + 1);
    for (let index = xPositions.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [xPositions[index], xPositions[swap]] = [xPositions[swap], xPositions[index]];
    }
    const turnPositions = xPositions.slice(0, config.turnsPerBeam).sort((left, right) => left - right);
    return makeRoute(config.size, startY, band, turnPositions, random);
  });
}

function buildCandidate(difficulty: LaserDifficulty, seed: number): LaserMirrorsState {
  const config = difficultyConfig[difficulty];
  const random = seededRandom(seed);
  const routes = routeForDifficulty(config, random);
  const pathCells = new Set(routes.flatMap((route) => route.path.map(({ x, y }) => `${x},${y}`)));
  const occupiedCells = new Set(pathCells);
  const emitters = routes.map((route, index) => ({ ...route.emitter, receiverIndex: index }));
  const receivers = routes.map((route) => route.receiver);
  const solutionMirrors = routes.flatMap((route) => route.solution);
  const mirrors: LaserMirror[] = solutionMirrors.map((mirror) => ({
    ...mirror,
    orientation: reverse(mirror.orientation),
  }));
  const emptyCells: LaserPoint[] = [];
  for (let y = 1; y < config.size - 1; y += 1) {
    for (let x = 1; x < config.size - 1; x += 1) {
      if (!occupiedCells.has(`${x},${y}`)) emptyCells.push({ x, y });
    }
  }
  for (let count = 0; count < config.decoys && emptyCells.length; count += 1) {
    const index = Math.floor(random() * emptyCells.length);
    const [position] = emptyCells.splice(index, 1);
    mirrors.push({ ...position, orientation: random() < 0.5 ? "/" : "\\" });
    occupiedCells.add(`${position.x},${position.y}`);
  }
  const blockers: LaserPoint[] = [];
  for (let count = 0; count < config.blockers && emptyCells.length; count += 1) {
    const index = Math.floor(random() * emptyCells.length);
    const [position] = emptyCells.splice(index, 1);
    blockers.push(position);
    occupiedCells.add(`${position.x},${position.y}`);
  }
  const raw: LaserPuzzle = {
    size: config.size,
    difficulty,
    seed,
    emitters,
    receivers,
    mirrors,
    blockers,
    requiredRotations: 0,
    pathLength: routes.reduce((sum, route) => sum + route.path.length, 0),
    fingerprint: "",
  };
  const fingerprint = laserPuzzleFingerprint(raw);
  const initial = traceLaser(raw);
  const solved = traceLaser({
    ...raw,
    mirrors: mirrors.map((mirror) => solutionMirrors.find((item) => item.x === mirror.x && item.y === mirror.y)
      ? { ...mirror, orientation: solutionMirrors.find((item) => item.x === mirror.x && item.y === mirror.y)!.orientation }
      : mirror),
  });
  if (initial.hit || !solved.hit) return { ...raw, fingerprint, level: 1, history: [], complete: false };
  const state = { ...raw, fingerprint, level: 1, history: [], complete: false };
  return {
    ...state,
    requiredRotations: solutionMirrors.length,
  };
}

export function laserPuzzleFingerprint(puzzle: Pick<LaserPuzzle, "difficulty" | "size" | "emitters" | "receivers" | "mirrors" | "blockers">): string {
  return JSON.stringify([
    puzzle.difficulty,
    puzzle.size,
    puzzle.emitters,
    puzzle.receivers,
    puzzle.mirrors.map(({ x, y, orientation }) => [x, y, orientation]),
    puzzle.blockers.map(({ x, y }) => [x, y]),
  ]);
}

export function randomLaserSeed(): number {
  return makeSeed();
}

export function generateLaserPuzzle(
  difficulty: LaserDifficulty,
  seed: number = makeSeed(),
  puzzleNumber = 1,
  excludedFingerprints: readonly string[] = [],
): LaserMirrorsState {
  const config = difficultyConfig[difficulty];
  const excluded = new Set(excludedFingerprints);
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const candidateSeed = hashSeed(seed, attempt * 0x9e3779b9);
    const candidate = buildCandidate(difficulty, candidateSeed);
    if (candidate.requiredRotations < config.minimumRotations) continue;
    if (candidate.pathLength < config.minimumPathLength) continue;
    if (traceLaser(candidate).hit) continue;
    const solution = solveLaserPuzzle(candidate);
    if (!solution || solution.length < config.minimumRotations) continue;
    if (excluded.has(candidate.fingerprint)) continue;
    return { ...candidate, level: puzzleNumber, requiredRotations: solution.length };
  }
  throw new Error(`Could not generate a unique solvable ${difficulty} laser puzzle.`);
}

export function restoreLaserPuzzle(
  puzzle: LaserMirrorsState,
  orientations: readonly MirrorOrientation[],
  history: readonly MirrorOrientation[][] = [],
): LaserMirrorsState {
  if (orientations.length !== puzzle.mirrors.length || orientations.some((item) => item !== "/" && item !== "\\")) {
    throw new Error("Saved laser puzzle has invalid mirror orientations.");
  }
  if (history.some((entry) => entry.length !== puzzle.mirrors.length || entry.some((item) => item !== "/" && item !== "\\"))) {
    throw new Error("Saved laser puzzle has invalid undo history.");
  }
  const mirrors = puzzle.mirrors.map((mirror, index) => ({ ...mirror, orientation: orientations[index] }));
  return {
    ...puzzle,
    mirrors,
    history: history.map((entry) => [...entry]),
    complete: traceLaser({ ...puzzle, mirrors }).hit,
  };
}

export function createLaserMirrors(level = 1, seed: number = hashSeed(0x5eed, level)): LaserMirrorsState {
  const difficulty: LaserDifficulty = level <= 5 ? "easy" : level <= 15 ? "medium" : level <= 30 ? "hard" : "expert";
  return generateLaserPuzzle(difficulty, seed, level);
}

export function rotateLaserMirror(state: LaserMirrorsState, x: number, y: number): LaserMirrorsState {
  const index = state.mirrors.findIndex((mirror) => mirror.x === x && mirror.y === y);
  if (index < 0 || state.complete) return state;
  const previous = state.mirrors.map((mirror) => mirror.orientation);
  const mirrors = state.mirrors.map((mirror, mirrorIndex) => mirrorIndex === index
    ? { ...mirror, orientation: reverse(mirror.orientation) }
    : mirror);
  return {
    ...state,
    mirrors,
    history: [...state.history, previous],
    complete: traceLaser({ ...state, mirrors }).hit,
  };
}

export function undoLaserMirror(state: LaserMirrorsState): LaserMirrorsState {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  const mirrors = state.mirrors.map((mirror, index) => ({ ...mirror, orientation: previous[index] }));
  return {
    ...state,
    mirrors,
    history: state.history.slice(0, -1),
    complete: traceLaser({ ...state, mirrors }).hit,
  };
}

export function resetLaserMirrors(state: LaserMirrorsState): LaserMirrorsState {
  return generateLaserPuzzle(state.difficulty, state.seed, state.level);
}

export function nextLaserPuzzle(
  state: LaserMirrorsState,
  seed: number = makeSeed(),
  excludedFingerprints: readonly string[] = [],
): LaserMirrorsState {
  return generateLaserPuzzle(state.difficulty, seed, state.level + 1, excludedFingerprints);
}

export function getLaserDifficultyConfig(difficulty: LaserDifficulty): DifficultyConfig {
  return difficultyConfig[difficulty];
}
