export interface StackBlock {
  x: number;
  y: number;
  width: number;
}

export type StackStatus = "ready" | "playing" | "paused" | "over";

export interface PerfectStackState {
  blocks: StackBlock[];
  movingX: number;
  direction: -1 | 1;
  score: number;
  combo: number;
  speed: number;
  status: StackStatus;
}

const FIELD_WIDTH = 640;
const BLOCK_HEIGHT = 22;
const BASE_Y = 328;
const SPEED = 190;

export function createPerfectStack(): PerfectStackState {
  return {
    blocks: [{ x: 250, y: BASE_Y, width: 140 }],
    movingX: 0,
    direction: 1,
    score: 0,
    combo: 0,
    speed: 190,
    status: "ready",
  };
}

export function startPerfectStack(state: PerfectStackState): PerfectStackState {
  if (state.status !== "ready") return state;
  return { ...state, status: "playing" };
}

export function stepPerfectStack(state: PerfectStackState, deltaSeconds: number): PerfectStackState {
  if (state.status !== "playing") return state;
  const delta = Math.max(0, Math.min(0.05, deltaSeconds));
  const width = state.blocks[state.blocks.length - 1].width;
  const maximum = FIELD_WIDTH - width;
  const next = state.movingX + state.direction * state.speed * delta;
  if (next <= 0) return { ...state, movingX: 0, direction: 1 };
  if (next >= maximum) return { ...state, movingX: maximum, direction: -1 };
  return { ...state, movingX: next };
}

export function dropPerfectStack(state: PerfectStackState): PerfectStackState {
  if (state.status !== "playing") return state;
  const previous = state.blocks[state.blocks.length - 1];
  const left = Math.max(previous.x, state.movingX);
  const right = Math.min(previous.x + previous.width, state.movingX + previous.width);
  const width = right - left;
  if (width <= 0) return { ...state, status: "over", combo: 0 };

  const perfect = previous.width - width <= 5;
  const placedWidth = perfect ? previous.width : width;
  const placedX = perfect ? previous.x : left;
  const score = state.score + 1 + (perfect && state.combo > 0 && state.combo % 4 === 3 ? 1 : 0);
  const blocks = [...state.blocks, {
    x: placedX,
    y: BASE_Y - state.blocks.length * BLOCK_HEIGHT,
    width: placedWidth,
  }];
  return {
    ...state,
    blocks,
    movingX: 0,
    direction: 1,
    score,
    combo: perfect ? state.combo + 1 : 0,
    speed: Math.min(430, SPEED + score * 13),
  };
}

export function resetPerfectStack(): PerfectStackState {
  return createPerfectStack();
}
