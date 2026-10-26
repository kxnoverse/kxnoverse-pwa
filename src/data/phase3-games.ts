export type SimonDifficulty = "easy" | "normal" | "hard";

export const simonPlaybackDelay: Record<SimonDifficulty, number> = {
  easy: 720,
  normal: 520,
  hard: 340,
};

export function nextSimonSequence(sequence: number[], random = Math.random): number[] {
  const sample = random();
  if (!Number.isFinite(sample)) throw new Error("Random source must return a finite number.");
  const value = Math.min(3, Math.max(0, Math.floor(sample * 4)));
  return [...sequence, value];
}

export interface TrackPoint {
  x: number;
  y: number;
}

export interface RiderState extends TrackPoint {
  vx: number;
  vy: number;
  angle: number;
}

export function stepRider(
  rider: RiderState,
  segments: Array<[TrackPoint, TrackPoint]>,
  delta: number,
): RiderState {
  const step = Math.max(0, Math.min(delta, 1 / 30));
  const next = { ...rider, vx: rider.vx + 95 * step, vy: rider.vy + 620 * step };
  next.x += next.vx * step;
  next.y += next.vy * step;
  for (const [start, end] of segments) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1) continue;
    const t = Math.max(0, Math.min(1, ((next.x - start.x) * dx + (next.y - start.y) * dy) / lengthSquared));
    const closestX = start.x + dx * t;
    const closestY = start.y + dy * t;
    const distance = Math.hypot(next.x - closestX, next.y - closestY);
    const radius = 9;
    const inverseLength = 1 / Math.sqrt(lengthSquared);
    const segmentNormalX = -dy * inverseLength;
    const segmentNormalY = dx * inverseLength;
    const previousSide = (rider.x - start.x) * segmentNormalX + (rider.y - start.y) * segmentNormalY;
    const nextSide = (next.x - start.x) * segmentNormalX + (next.y - start.y) * segmentNormalY;
    const crossedSegment = previousSide * nextSide <= 0 && t > 0 && t < 1;
    if ((distance >= radius && !crossedSegment) || (distance === 0 && !crossedSegment)) continue;
    const side = Math.sign(previousSide || nextSide || -1);
    const nx = segmentNormalX * side;
    const ny = segmentNormalY * side;
    next.x = closestX + nx * radius;
    next.y = closestY + ny * radius;
    const normalSpeed = next.vx * nx + next.vy * ny;
    if (normalSpeed < 0) {
      next.vx -= 1.35 * normalSpeed * nx;
      next.vy -= 1.35 * normalSpeed * ny;
      const tangentSpeed = next.vx * -ny + next.vy * nx;
      next.vx += ny * tangentSpeed * 0.08;
      next.vy -= nx * tangentSpeed * 0.08;
    }
    next.angle = Math.atan2(dy, dx);
  }
  next.vx *= Math.max(0, 1 - 0.12 * step);
  next.vy *= Math.max(0, 1 - 0.04 * step);
  return next;
}

export interface ClickerState {
  resources: number;
  lifetime: number;
  clickLevel: number;
  autoLevel: number;
  multiplierLevel: number;
  lastSavedAt: number;
  achievements: string[];
}

export const clickerInitialState: ClickerState = {
  resources: 0,
  lifetime: 0,
  clickLevel: 0,
  autoLevel: 0,
  multiplierLevel: 0,
  lastSavedAt: Date.now(),
  achievements: [],
};

export const clickerOfflineCapSeconds = 8 * 60 * 60;
const priceScales = { click: 1.16, auto: 1.18, multiplier: 1.24 } as const;

export function clickerUpgradePrice(kind: "click" | "auto" | "multiplier", level: number): number {
  const base = kind === "click" ? 15 : kind === "auto" ? 30 : 250;
  return Math.ceil(base * priceScales[kind] ** Math.max(0, level));
}

export function clickerProduction(state: ClickerState): number {
  return state.autoLevel * 0.8 * 1.5 ** state.multiplierLevel;
}

export function clickerCollect(state: ClickerState): ClickerState {
  const amount = (1 + state.clickLevel) * 2 ** state.multiplierLevel;
  return withAchievements({
    ...state,
    resources: state.resources + amount,
    lifetime: state.lifetime + amount,
  });
}

export function clickerUpgrade(state: ClickerState, kind: "click" | "auto" | "multiplier"): ClickerState | null {
  const levelKey = kind === "click" ? "clickLevel" : kind === "auto" ? "autoLevel" : "multiplierLevel";
  const price = clickerUpgradePrice(kind, state[levelKey]);
  if (state.resources < price) return null;
  return withAchievements({
    ...state,
    resources: state.resources - price,
    [levelKey]: state[levelKey] + 1,
  });
}

export function applyClickerOfflineProgress(state: ClickerState, now: number): { state: ClickerState; gained: number } {
  const elapsed = Math.max(0, Math.min(clickerOfflineCapSeconds, (now - state.lastSavedAt) / 1000));
  const gained = Math.floor(clickerProduction(state) * elapsed);
  return {
    state: withAchievements({ ...state, resources: state.resources + gained, lifetime: state.lifetime + gained, lastSavedAt: now }),
    gained,
  };
}

function withAchievements(state: ClickerState): ClickerState {
  const achievements = new Set(state.achievements);
  if (state.lifetime >= 100) achievements.add("first-hundred");
  if (state.lifetime >= 1_000) achievements.add("first-thousand");
  if (state.lifetime >= 10_000) achievements.add("first-ten-thousand");
  if (state.autoLevel >= 1) achievements.add("first-automation");
  if (state.multiplierLevel >= 1) achievements.add("first-multiplier");
  return { ...state, achievements: [...achievements] };
}

export function normalizeClickerSave(value: unknown, now = Date.now()): ClickerState {
  if (!value || typeof value !== "object") return { ...clickerInitialState, lastSavedAt: now };
  const source = value as Partial<ClickerState>;
  const integer = (entry: unknown) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0 ? entry : 0;
  return {
    resources: typeof source.resources === "number" && Number.isFinite(source.resources) ? Math.max(0, source.resources) : 0,
    lifetime: typeof source.lifetime === "number" && Number.isFinite(source.lifetime) ? Math.max(0, source.lifetime) : 0,
    clickLevel: integer(source.clickLevel),
    autoLevel: integer(source.autoLevel),
    multiplierLevel: integer(source.multiplierLevel),
    lastSavedAt: typeof source.lastSavedAt === "number" && Number.isFinite(source.lastSavedAt) ? source.lastSavedAt : now,
    achievements: Array.isArray(source.achievements) ? source.achievements.filter((item): item is string => typeof item === "string") : [],
  };
}
