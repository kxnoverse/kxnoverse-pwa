import type { Point } from "./arcade";

export type HockeyDifficulty = "easy" | "normal" | "hard";
export interface RunnerObstacle {
  x: number;
  width: number;
  height: number;
}
export interface GeometryRunnerState {
  playerY: number;
  playerVy: number;
  grounded: boolean;
  coyoteTime: number;
  jumpBuffer: number;
  distance: number;
  speed: number;
  obstacles: RunnerObstacle[];
  accumulator: number;
  seed: number;
  dead: boolean;
}
export interface HockeyState {
  puck: Point & { vx: number; vy: number };
  player: Point;
  opponent: Point;
  scores: [number, number];
  difficulty: HockeyDifficulty;
  finished: boolean;
  aiTarget: Point;
  aiThinkTime: number;
  goalPause: number;
}

export const RUNNER_GROUND = 452;
export const RUNNER_PLAYER_X = 100;
export const RUNNER_FIXED_STEP = 1 / 120;
const RUNNER_PLAYER_WIDTH = 32;
const RUNNER_PLAYER_HEIGHT = 28;
const RUNNER_GRAVITY = 1800;
const RUNNER_JUMP_VELOCITY = -625;
const RUNNER_COYOTE_SECONDS = 0.1;
const RUNNER_BUFFER_SECONDS = 0.12;

function seededRandom(state: Pick<GeometryRunnerState, "seed">): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}

export function runnerMinimumGap(speed: number, obstacleWidth = 40): number {
  return Math.max(390, speed * 1.35 + RUNNER_PLAYER_WIDTH + obstacleWidth);
}

export function createGeometryRunner(seed = 0x4b584e4f): GeometryRunnerState {
  return {
    playerY: RUNNER_GROUND,
    playerVy: 0,
    grounded: true,
    coyoteTime: RUNNER_COYOTE_SECONDS,
    jumpBuffer: 0,
    distance: 0,
    speed: 300,
    obstacles: [{ x: 700, width: 32, height: 38 }],
    accumulator: 0,
    seed: seed >>> 0,
    dead: false,
  };
}

export interface RunnerStepResult {
  jumped: boolean;
  landed: boolean;
  died: boolean;
}

export function advanceGeometryRunner(state: GeometryRunnerState, elapsed: number, jumpPressed: boolean): RunnerStepResult {
  const result: RunnerStepResult = { jumped: false, landed: false, died: false };
  if (state.dead) return result;
  if (jumpPressed) state.jumpBuffer = RUNNER_BUFFER_SECONDS;
  state.accumulator = Math.min(0.25, state.accumulator + Math.max(0, elapsed));
  while (state.accumulator >= RUNNER_FIXED_STEP && !state.dead) {
    const dt = RUNNER_FIXED_STEP;
    state.accumulator -= dt;
    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.coyoteTime = state.grounded ? RUNNER_COYOTE_SECONDS : Math.max(0, state.coyoteTime - dt);

    if (state.jumpBuffer > 0 && (state.grounded || state.coyoteTime > 0)) {
      state.playerVy = RUNNER_JUMP_VELOCITY;
      state.grounded = false;
      state.coyoteTime = 0;
      state.jumpBuffer = 0;
      result.jumped = true;
    }

    const previousY = state.playerY;
    state.playerVy += RUNNER_GRAVITY * dt;
    state.playerY += state.playerVy * dt;
    if (state.playerY >= RUNNER_GROUND) {
      if (!state.grounded && previousY < RUNNER_GROUND) result.landed = true;
      state.playerY = RUNNER_GROUND;
      state.playerVy = 0;
      state.grounded = true;
      state.coyoteTime = RUNNER_COYOTE_SECONDS;
    } else {
      state.grounded = false;
    }

    state.speed = Math.min(620, state.speed + 2.4 * dt);
    state.distance += state.speed * dt / 10;
    for (const obstacle of state.obstacles) obstacle.x -= state.speed * dt;
    state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -RUNNER_PLAYER_X);
    while (state.obstacles.length < 2) {
      const last = state.obstacles[state.obstacles.length - 1];
      const width = 28 + seededRandom(state) * 13;
      const gap = runnerMinimumGap(state.speed, width) + seededRandom(state) * state.speed * 0.45;
      state.obstacles.push({
        x: (last?.x ?? 800) + (last?.width ?? 0) + gap,
        width,
        height: 34 + seededRandom(state) * 34,
      });
    }
    if (state.obstacles.some((obstacle) => runnerCollision(RUNNER_PLAYER_X, state.playerY, obstacle))) {
      state.dead = true;
      result.died = true;
    }
  }
  return result;
}

export function runnerCollision(
  playerX: number,
  playerBottom: number,
  obstacle: RunnerObstacle,
  ground = RUNNER_GROUND,
): boolean {
  const overlapLeft = Math.max(playerX - RUNNER_PLAYER_WIDTH / 2, obstacle.x);
  const overlapRight = Math.min(playerX + RUNNER_PLAYER_WIDTH / 2, obstacle.x + obstacle.width);
  if (overlapLeft >= overlapRight) return false;
  const center = obstacle.x + obstacle.width / 2;
  const closest = Math.max(overlapLeft, Math.min(center, overlapRight));
  const obstacleSurface = ground - obstacle.height * (1 - Math.abs(closest - center) / (obstacle.width / 2));
  const playerTop = playerBottom - RUNNER_PLAYER_HEIGHT;
  return playerBottom > obstacleSurface && playerTop < ground;
}

const HOCKEY_WIDTH = 800;
const HOCKEY_HEIGHT = 500;
const HOCKEY_WALL = 22;
const HOCKEY_PUCK_RADIUS = 13;
const HOCKEY_PADDLE_RADIUS = 26;
const HOCKEY_GOAL_HALF_WIDTH = 80;
const difficultyRules: Record<HockeyDifficulty, { maxSpeed: number; reaction: number; error: number }> = {
  easy: { maxSpeed: 190, reaction: 0.42, error: 68 },
  normal: { maxSpeed: 330, reaction: 0.22, error: 30 },
  hard: { maxSpeed: 470, reaction: 0.105, error: 10 },
};

export function createAirHockeyState(difficulty: HockeyDifficulty = "normal"): HockeyState {
  return {
    puck: { x: HOCKEY_WIDTH / 2, y: HOCKEY_HEIGHT / 2, vx: 230, vy: -190 },
    player: { x: HOCKEY_WIDTH / 2, y: HOCKEY_HEIGHT - 56 },
    opponent: { x: HOCKEY_WIDTH / 2, y: 56 },
    scores: [0, 0],
    difficulty,
    finished: false,
    aiTarget: { x: HOCKEY_WIDTH / 2, y: 56 },
    aiThinkTime: 0,
    goalPause: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moveToward(point: Point, target: Point, maxDistance: number): void {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDistance || distance === 0) {
    point.x = target.x;
    point.y = target.y;
  } else {
    point.x += dx / distance * maxDistance;
    point.y += dy / distance * maxDistance;
  }
}

function reflectPuck(state: HockeyState, paddle: Point, paddleVelocity: Point): boolean {
  const puck = state.puck;
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const distance = Math.hypot(dx, dy);
  const collisionDistance = HOCKEY_PUCK_RADIUS + HOCKEY_PADDLE_RADIUS;
  if (distance >= collisionDistance || distance === 0) return false;
  const nx = dx / distance;
  const ny = dy / distance;
  const alongNormal = puck.vx * nx + puck.vy * ny;
  if (alongNormal >= 0) return false;

  const rebound = 1.88;
  puck.vx = puck.vx - rebound * alongNormal * nx + paddleVelocity.x * 0.18;
  puck.vy = puck.vy - rebound * alongNormal * ny + paddleVelocity.y * 0.18;
  const speed = clamp(Math.hypot(puck.vx, puck.vy), 170, 620);
  const reboundSpeed = Math.hypot(puck.vx, puck.vy) || 1;
  puck.vx = puck.vx / reboundSpeed * speed;
  puck.vy = puck.vy / reboundSpeed * speed;
  puck.x = paddle.x + nx * (collisionDistance + 0.5);
  puck.y = paddle.y + ny * (collisionDistance + 0.5);
  return true;
}

export function stepAirHockey(
  state: HockeyState,
  elapsed: number,
  playerTarget: Point,
  random: () => number = Math.random,
): { goal: "player" | "opponent" | null; collision: boolean } {
  let goal: "player" | "opponent" | null = null;
  let collision = false;
  const count = Math.max(1, Math.ceil(Math.max(0, elapsed) / (1 / 120)));
  const dt = elapsed / count;
  const previousPlayer = { ...state.player };
  const previousOpponent = { ...state.opponent };
  const rules = difficultyRules[state.difficulty];
  for (let index = 0; index < count; index += 1) {
    if (state.finished) break;
    if (state.goalPause > 0) {
      state.goalPause = Math.max(0, state.goalPause - dt);
      continue;
    }

    moveToward(state.player, {
      x: clamp(playerTarget.x, HOCKEY_WALL + HOCKEY_PADDLE_RADIUS, HOCKEY_WIDTH - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS),
      y: clamp(playerTarget.y, HOCKEY_HEIGHT / 2 + HOCKEY_PADDLE_RADIUS, HOCKEY_HEIGHT - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS),
    }, 720 * dt);
    state.aiThinkTime -= dt;
    if (state.aiThinkTime <= 0) {
      const puckThreat = state.puck.y < HOCKEY_HEIGHT * 0.68;
      const projected = state.puck.vy < -1
        ? state.puck.x + state.puck.vx * Math.max(0, (state.puck.y - 56) / -state.puck.vy)
        : state.puck.x;
      const offset = (random() * 2 - 1) * rules.error;
      state.aiTarget = {
        x: puckThreat ? clamp(projected + offset, HOCKEY_WALL + HOCKEY_PADDLE_RADIUS, HOCKEY_WIDTH - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS) : HOCKEY_WIDTH / 2 + offset * 0.4,
        y: puckThreat ? 88 : 66,
      };
      state.aiThinkTime = rules.reaction;
    }
    moveToward(state.opponent, state.aiTarget, rules.maxSpeed * dt);
    state.player.x = clamp(state.player.x, HOCKEY_WALL + HOCKEY_PADDLE_RADIUS, HOCKEY_WIDTH - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS);
    state.player.y = clamp(state.player.y, HOCKEY_HEIGHT / 2 + HOCKEY_PADDLE_RADIUS, HOCKEY_HEIGHT - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS);
    state.opponent.x = clamp(state.opponent.x, HOCKEY_WALL + HOCKEY_PADDLE_RADIUS, HOCKEY_WIDTH - HOCKEY_WALL - HOCKEY_PADDLE_RADIUS);
    state.opponent.y = clamp(state.opponent.y, HOCKEY_WALL + HOCKEY_PADDLE_RADIUS, HOCKEY_HEIGHT / 2 - HOCKEY_PADDLE_RADIUS);

    const puck = state.puck;
    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    const side = HOCKEY_WALL + HOCKEY_PUCK_RADIUS;
    if (puck.x < side) { puck.x = side; puck.vx = Math.abs(puck.vx); }
    if (puck.x > HOCKEY_WIDTH - side) { puck.x = HOCKEY_WIDTH - side; puck.vx = -Math.abs(puck.vx); }

    const inGoal = Math.abs(puck.x - HOCKEY_WIDTH / 2) <= HOCKEY_GOAL_HALF_WIDTH - HOCKEY_PUCK_RADIUS;
    if (puck.y < HOCKEY_WALL + HOCKEY_PUCK_RADIUS) {
      if (inGoal) goal = "player";
      else { puck.y = HOCKEY_WALL + HOCKEY_PUCK_RADIUS; puck.vy = Math.abs(puck.vy); }
    } else if (puck.y > HOCKEY_HEIGHT - HOCKEY_WALL - HOCKEY_PUCK_RADIUS) {
      if (inGoal) goal = "opponent";
      else { puck.y = HOCKEY_HEIGHT - HOCKEY_WALL - HOCKEY_PUCK_RADIUS; puck.vy = -Math.abs(puck.vy); }
    }
    if (goal) {
      state.scores[goal === "player" ? 0 : 1] += 1;
      state.finished = state.scores[0] >= 7 || state.scores[1] >= 7;
      state.puck.x = HOCKEY_WIDTH / 2;
      state.puck.y = HOCKEY_HEIGHT / 2;
      state.puck.vx = (random() < 0.5 ? -1 : 1) * 230;
      state.puck.vy = goal === "player" ? 190 : -190;
      state.goalPause = state.finished ? 0 : 0.65;
      break;
    }

    const playerVelocity = { x: (state.player.x - previousPlayer.x) / dt, y: (state.player.y - previousPlayer.y) / dt };
    const opponentVelocity = { x: (state.opponent.x - previousOpponent.x) / dt, y: (state.opponent.y - previousOpponent.y) / dt };
    collision = reflectPuck(state, state.player, playerVelocity) || collision;
    collision = reflectPuck(state, state.opponent, opponentVelocity) || collision;
    previousPlayer.x = state.player.x; previousPlayer.y = state.player.y;
    previousOpponent.x = state.opponent.x; previousOpponent.y = state.opponent.y;
  }
  return { goal, collision };
}

export const airHockeyDifficultyRules = difficultyRules;
