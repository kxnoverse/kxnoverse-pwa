export type TowerKind = "basic" | "rapid" | "heavy" | "frost";
export type TowerTarget = "first" | "last" | "strongest";
export type DefenseMapId = "meadow" | "harbor" | "ridge";
export type DefenseEnemyKind = "standard" | "fast" | "armored" | "boss";

export type DefensePoint = { x: number; y: number };
export type DefensePath = DefensePoint[];
export type DefenseTower = {
  id: number;
  kind: TowerKind;
  x: number;
  y: number;
  level: number;
  target: TowerTarget;
  cooldown: number;
  spent: number;
};
export type DefenseEnemy = {
  id: number;
  kind: DefenseEnemyKind;
  distance: number;
  health: number;
  maxHealth: number;
  slow: number;
};
export type DefenseProjectile = {
  id: number;
  targetId: number;
  x: number;
  y: number;
  damage: number;
  speed: number;
  kind: TowerKind;
};
export type DefenseState = {
  map: DefenseMapId;
  wave: number;
  waveActive: boolean;
  spawnRemaining: number;
  spawnTimer: number;
  enemies: DefenseEnemy[];
  towers: DefenseTower[];
  projectiles: DefenseProjectile[];
  currency: number;
  lives: number;
  score: number;
  nextId: number;
  selectedTower: number | null;
  status: "ready" | "playing" | "won" | "lost";
};

export const defenseMaps: Record<DefenseMapId, { name: string; path: DefensePath }> = {
  meadow: { name: "Meadow", path: [{ x: -12, y: 86 }, { x: 164, y: 86 }, { x: 164, y: 304 }, { x: 394, y: 304 }, { x: 394, y: 132 }, { x: 650, y: 132 }] },
  harbor: { name: "Harbor", path: [{ x: -12, y: 328 }, { x: 154, y: 328 }, { x: 154, y: 122 }, { x: 352, y: 122 }, { x: 352, y: 326 }, { x: 650, y: 326 }] },
  ridge: { name: "Ridge", path: [{ x: -12, y: 205 }, { x: 118, y: 205 }, { x: 118, y: 76 }, { x: 270, y: 76 }, { x: 270, y: 344 }, { x: 464, y: 344 }, { x: 464, y: 188 }, { x: 650, y: 188 }] },
};

const towerSpec: Record<TowerKind, { cost: number; range: number; cooldown: number; damage: number; speed: number }> = {
  basic: { cost: 70, range: 116, cooldown: 0.72, damage: 16, speed: 420 },
  rapid: { cost: 95, range: 86, cooldown: 0.24, damage: 5, speed: 500 },
  heavy: { cost: 125, range: 140, cooldown: 1.35, damage: 42, speed: 330 },
  frost: { cost: 110, range: 104, cooldown: 0.82, damage: 15, speed: 390 },
};

const enemySpec: Record<DefenseEnemyKind, { health: number; speed: number; reward: number }> = {
  standard: { health: 52, speed: 45, reward: 12 },
  fast: { health: 30, speed: 78, reward: 11 },
  armored: { health: 118, speed: 33, reward: 20 },
  boss: { health: 420, speed: 24, reward: 70 },
};

export function createDefenseState(map: DefenseMapId = "meadow"): DefenseState {
  return {
    map, wave: 0, waveActive: false, spawnRemaining: 0, spawnTimer: 0,
    enemies: [], towers: [], projectiles: [], currency: 220, lives: 20, score: 0,
    nextId: 1, selectedTower: null, status: "ready",
  };
}

function pathLength(path: DefensePath): number {
  return path.slice(1).reduce((length, point, index) => {
    const previous = path[index];
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

export function pointOnDefensePath(path: DefensePath, distance: number): DefensePoint {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= segment) {
      const ratio = segment === 0 ? 0 : remaining / segment;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    remaining -= segment;
  }
  return path[path.length - 1];
}

function distanceToSegment(point: DefensePoint, from: DefensePoint, to: DefensePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (from.x + ratio * dx), point.y - (from.y + ratio * dy));
}

export function canPlaceDefenseTower(state: DefenseState, point: DefensePoint): boolean {
  if (point.x < 24 || point.x > 616 || point.y < 24 || point.y > 396) return false;
  const path = defenseMaps[state.map].path;
  if (path.slice(1).some((to, index) => distanceToSegment(point, path[index], to) < 37)) return false;
  return state.towers.every((tower) => Math.hypot(tower.x - point.x, tower.y - point.y) >= 34);
}

export function placeDefenseTower(state: DefenseState, kind: TowerKind, point: DefensePoint): DefenseState {
  const spec = towerSpec[kind];
  if (state.status === "won" || state.status === "lost" || state.currency < spec.cost || !canPlaceDefenseTower(state, point)) return state;
  const tower: DefenseTower = { id: state.nextId, kind, x: point.x, y: point.y, level: 1, target: "first", cooldown: 0, spent: spec.cost };
  return { ...state, towers: [...state.towers, tower], currency: state.currency - spec.cost, nextId: state.nextId + 1, selectedTower: tower.id, status: "playing" };
}

export function upgradeDefenseTower(state: DefenseState): DefenseState {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower || tower.level >= 3) return state;
  const cost = 45 + (tower.level - 1) * 40;
  if (state.currency < cost) return state;
  return {
    ...state,
    currency: state.currency - cost,
    towers: state.towers.map((item) => item.id === tower.id ? { ...item, level: item.level + 1, spent: item.spent + cost } : item),
  };
}

export function sellDefenseTower(state: DefenseState): DefenseState {
  const tower = state.towers.find((item) => item.id === state.selectedTower);
  if (!tower) return state;
  return {
    ...state,
    currency: state.currency + Math.floor(tower.spent * 0.6),
    towers: state.towers.filter((item) => item.id !== tower.id),
    selectedTower: null,
  };
}

export function setDefenseTarget(state: DefenseState, target: TowerTarget): DefenseState {
  if (state.selectedTower === null) return state;
  return { ...state, towers: state.towers.map((tower) => tower.id === state.selectedTower ? { ...tower, target } : tower) };
}

export function startDefenseWave(state: DefenseState): DefenseState {
  if (state.waveActive || state.wave >= 10 || state.status === "won" || state.status === "lost") return state;
  const wave = state.wave + 1;
  return { ...state, wave, waveActive: true, spawnRemaining: 5 + wave * 2, spawnTimer: 0.15, status: "playing" };
}

function enemyKindFor(wave: number, index: number, count: number): DefenseEnemyKind {
  if (wave % 5 === 0 && index === count - 1) return "boss";
  if (wave >= 3 && index % 5 === 3) return "armored";
  if (wave >= 2 && index % 3 === 1) return "fast";
  return "standard";
}

function towerStats(tower: DefenseTower) {
  const base = towerSpec[tower.kind];
  return {
    range: base.range * (1 + (tower.level - 1) * 0.14),
    damage: base.damage * (1 + (tower.level - 1) * 0.48),
    cooldown: base.cooldown * Math.max(0.52, 1 - (tower.level - 1) * 0.17),
    speed: base.speed,
  };
}

export function chooseDefenseTarget(tower: DefenseTower, enemies: readonly DefenseEnemy[], path: DefensePath): DefenseEnemy | null {
  const stats = towerStats(tower);
  const candidates = enemies.filter((enemy) => {
    const position = pointOnDefensePath(path, enemy.distance);
    return enemy.health > 0 && Math.hypot(position.x - tower.x, position.y - tower.y) <= stats.range;
  });
  candidates.sort((a, b) => tower.target === "last" ? a.distance - b.distance || a.id - b.id
    : tower.target === "strongest" ? b.health - a.health || b.distance - a.distance || a.id - b.id
      : b.distance - a.distance || a.id - b.id);
  return candidates[0] ?? null;
}

export function stepDefense(state: DefenseState, deltaSeconds: number): DefenseState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !state.waveActive || state.status === "won" || state.status === "lost") return state;
  const dt = Math.min(deltaSeconds, 0.05);
  const mapPath = defenseMaps[state.map].path;
  const totalPath = pathLength(mapPath);
  const waveMultiplier = 1 + (state.wave - 1) * 0.17;
  let nextId = state.nextId;
  let currency = state.currency;
  let lives = state.lives;
  let score = state.score;
  let spawnTimer = state.spawnTimer - dt;
  let spawnRemaining = state.spawnRemaining;
  let enemies = state.enemies.map((enemy) => ({ ...enemy, slow: Math.max(0, enemy.slow - dt) }));
  const projectiles = state.projectiles.map((projectile) => ({ ...projectile }));
  if (spawnRemaining > 0 && spawnTimer <= 0) {
    const index = 5 + state.wave * 2 - spawnRemaining;
    const kind = enemyKindFor(state.wave, index, 5 + state.wave * 2);
    const spec = enemySpec[kind];
    const maxHealth = spec.health * waveMultiplier;
    enemies.push({ id: nextId++, kind, distance: 0, health: maxHealth, maxHealth, slow: 0 });
    spawnRemaining -= 1;
    spawnTimer = Math.max(0.34, 0.76 - state.wave * 0.025);
  }
  enemies = enemies.map((enemy) => ({
    ...enemy,
    distance: enemy.distance + enemySpec[enemy.kind].speed * waveMultiplier * (enemy.slow > 0 ? 0.52 : 1) * dt,
  }));
  const escaped = enemies.filter((enemy) => enemy.distance >= totalPath);
  lives = Math.max(0, lives - escaped.length);
  enemies = enemies.filter((enemy) => enemy.distance < totalPath);
  const activeProjectiles = projectiles.filter((projectile) => enemies.some((enemy) => enemy.id === projectile.targetId));
  let towers = state.towers.map((tower) => ({ ...tower, cooldown: Math.max(0, tower.cooldown - dt) }));
  for (const tower of towers) {
    if (tower.cooldown > 0) continue;
    const stats = towerStats(tower);
    const target = chooseDefenseTarget(tower, enemies, mapPath);
    if (!target) continue;
    activeProjectiles.push({ id: nextId++, targetId: target.id, x: tower.x, y: tower.y, damage: stats.damage * (tower.kind === "heavy" && target.kind === "armored" ? 1.55 : target.kind === "armored" ? 0.68 : 1), speed: stats.speed, kind: tower.kind });
    tower.cooldown = stats.cooldown;
    if (tower.kind === "frost") target.slow = Math.max(target.slow, 1.15);
  }
  const updatedProjectiles = activeProjectiles.map((projectile) => {
    const target = enemies.find((enemy) => enemy.id === projectile.targetId);
    if (!target) return projectile;
    const position = pointOnDefensePath(mapPath, target.distance);
    const dx = position.x - projectile.x;
    const dy = position.y - projectile.y;
    const distance = Math.hypot(dx, dy);
    const advance = projectile.speed * dt;
    return distance <= advance ? { ...projectile, x: position.x, y: position.y } : {
      ...projectile, x: projectile.x + dx / distance * advance, y: projectile.y + dy / distance * advance,
    };
  });
  const impacts = updatedProjectiles.filter((projectile) => {
    const target = enemies.find((enemy) => enemy.id === projectile.targetId);
    if (!target) return false;
    const position = pointOnDefensePath(mapPath, target.distance);
    return Math.hypot(position.x - projectile.x, position.y - projectile.y) < 9;
  });
  for (const projectile of impacts) {
    const target = enemies.find((enemy) => enemy.id === projectile.targetId);
    if (!target || target.health <= 0) continue;
    target.health -= projectile.damage;
    if (target.health <= 0) {
      const spec = enemySpec[target.kind];
      currency += spec.reward + Math.floor(state.wave * 0.5);
      score += Math.round(target.maxHealth);
    }
  }
  const deadIds = new Set(enemies.filter((enemy) => enemy.health <= 0).map((enemy) => enemy.id));
  enemies = enemies.filter((enemy) => enemy.health > 0);
  const filteredProjectiles = updatedProjectiles.filter((projectile) => !deadIds.has(projectile.targetId) && !impacts.includes(projectile));
  const waveActive = spawnRemaining > 0 || enemies.length > 0;
  if (!waveActive && state.waveActive) currency += 32 + state.wave * 4;
  const status = lives === 0 ? "lost" : !waveActive && state.wave >= 10 ? "won" : state.status;
  return {
    ...state, enemies, towers, projectiles: filteredProjectiles, currency, lives, score, nextId, spawnRemaining,
    spawnTimer, waveActive: waveActive && status === "playing", status,
  };
}

export type RhythmTrack = "signal" | "cadence" | "afterglow";
export type RhythmDifficulty = "easy" | "normal" | "hard";
export type RhythmNote = { id: number; lane: number; time: number };
export type RhythmJudgment = "perfect" | "good" | "miss";

const rhythmTracks: Record<RhythmTrack, { bpm: number; pattern: Array<[number, number]> }> = {
  signal: { bpm: 96, pattern: [[0, 0], [1, 2], [2, 1], [3, 3], [4, 0], [5, 2], [6, 1], [7, 3]] },
  cadence: { bpm: 122, pattern: [[0, 1], [0.5, 3], [1.5, 0], [2, 2], [3, 1], [4, 3], [5, 2], [5.5, 0], [7, 1]] },
  afterglow: { bpm: 146, pattern: [[0, 2], [1, 0], [2, 3], [3, 1], [4, 2], [4.5, 3], [6, 0], [7, 1]] },
};

export const rhythmWindows = { perfect: 0.055, good: 0.12, miss: 0.18 } as const;

export function createRhythmChart(track: RhythmTrack, difficulty: RhythmDifficulty): { bpm: number; notes: RhythmNote[]; duration: number } {
  const config = rhythmTracks[track];
  const beats = 32;
  const beatSeconds = 60 / config.bpm;
  const countIn = 1.3;
  const notes: RhythmNote[] = [];
  for (let bar = 0; bar < beats / 8; bar += 1) {
    for (const [beat, lane] of config.pattern) {
      const absoluteBeat = bar * 8 + beat;
      if (difficulty === "easy" && (absoluteBeat % 2 !== 0 || beat % 1 !== 0)) continue;
      notes.push({ id: notes.length, lane, time: countIn + absoluteBeat * beatSeconds });
      if (difficulty === "hard" && absoluteBeat % 2 === 0) {
        const offLane = (lane + 2 + bar % 2) % 4;
        notes.push({ id: notes.length, lane: offLane, time: countIn + (absoluteBeat + 0.5) * beatSeconds });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  return { bpm: config.bpm, notes, duration: countIn + beats * beatSeconds + 0.8 };
}

export function judgeRhythmNote(noteTime: number, hitTime: number, offsetSeconds = 0): RhythmJudgment | null {
  const difference = Math.abs(noteTime - (hitTime - offsetSeconds));
  if (difference <= rhythmWindows.perfect) return "perfect";
  if (difference <= rhythmWindows.good) return "good";
  if (difference <= rhythmWindows.miss) return "miss";
  return null;
}

export function rhythmScore(judgment: RhythmJudgment, combo: number): number {
  if (judgment === "miss") return 0;
  return (judgment === "perfect" ? 1000 : 500) + Math.min(combo, 100) * (judgment === "perfect" ? 10 : 5);
}

export type PlatformRect = { x: number; y: number; width: number; height: number };
export type PlatformLevel = {
  name: string;
  start: DefensePoint;
  exit: PlatformRect;
  platforms: PlatformRect[];
  hazards: PlatformRect[];
  collectibles: Array<DefensePoint & { id: string }>;
  checkpoints: Array<DefensePoint & { id: string }>;
  moving: Array<PlatformRect & { range: number; speed: number; phase: number }>;
};

const solid = (x: number, y: number, width: number, height = 18): PlatformRect => ({ x, y, width, height });
const levelPlatforms: PlatformRect[][] = [
  [solid(0, 402, 190, 48), solid(235, 350, 110), solid(390, 298, 110), solid(545, 350, 100), solid(690, 402, 110, 48)],
  [solid(0, 402, 150, 48), solid(190, 350, 100), solid(335, 300, 100), solid(475, 350, 110), solid(630, 302, 100), solid(750, 402, 50, 48)],
  [solid(0, 402, 130, 48), solid(168, 352, 85), solid(292, 302, 90), solid(425, 252, 92), solid(556, 302, 90), solid(690, 352, 110)],
  [solid(0, 402, 145, 48), solid(180, 352, 90), solid(312, 302, 90), solid(443, 252, 90), solid(570, 302, 90), solid(700, 402, 100, 48)],
  [solid(0, 402, 130, 48), solid(165, 352, 75), solid(280, 302, 80), solid(395, 252, 82), solid(510, 202, 82), solid(625, 252, 82), solid(738, 352, 62)],
  [solid(0, 402, 118, 48), solid(155, 360, 78), solid(270, 314, 78), solid(385, 268, 78), solid(500, 222, 78), solid(615, 268, 78), solid(730, 360, 70)],
  [solid(0, 402, 130, 48), solid(170, 350, 75), solid(286, 298, 75), solid(402, 246, 75), solid(518, 194, 75), solid(634, 246, 75), solid(750, 402, 50, 48)],
  [solid(0, 402, 110, 48), solid(145, 356, 68), solid(250, 310, 68), solid(355, 264, 68), solid(460, 218, 68), solid(565, 264, 68), solid(670, 310, 68), solid(760, 402, 40, 48)],
];

const makeLevel = (index: number): PlatformLevel => {
  const platforms = levelPlatforms[index];
  const finishPlatform = platforms[platforms.length - 1];
  return {
    name: `level-${index + 1}`,
    start: { x: 42, y: 365 },
    exit: { x: 748, y: finishPlatform.y - 40, width: 28, height: 44 },
    platforms,
    hazards: index === 0 ? [solid(192, 422, 38, 28)] : [solid(140 + index * 6, 422, 32, 28), solid(470 + index * 5, 422, 34, 28)],
    collectibles: [{ id: `coin-${index + 1}-a`, x: 310 + (index % 3) * 34, y: 268 }],
    checkpoints: index >= 2 ? [{ id: `checkpoint-${index + 1}`, x: 400, y: 220 }] : [],
    moving: index >= 4 ? [{ x: 315, y: 330, width: 76, height: 12, range: 40, speed: 1.2 + index * 0.08, phase: index }] : [],
  };
};

export const platformLevels: PlatformLevel[] = Array.from({ length: 8 }, (_, index) => makeLevel(index));

export type PlatformerInput = { left: boolean; right: boolean; jump: boolean };
export type PlatformerState = {
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpWasDown: boolean;
  remainder: number;
  time: number;
  lives: number;
  collected: string[];
  checkpoint: DefensePoint;
  complete: boolean;
  gameOver: boolean;
  unlocked: number;
  completedLevels: number[];
  bestTimes: number[];
};

export function createPlatformerState(): PlatformerState {
  return {
    level: 0, x: 42, y: 365, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0,
    jumpWasDown: false, remainder: 0, time: 0, lives: 3, collected: [], checkpoint: { x: 42, y: 365 },
    complete: false, gameOver: false, unlocked: 1, completedLevels: [], bestTimes: Array(8).fill(0),
  };
}

function overlaps(a: PlatformRect, b: PlatformRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function respawnPlatformer(state: PlatformerState): PlatformerState {
  return { ...state, x: state.checkpoint.x, y: state.checkpoint.y, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0, lives: Math.max(0, state.lives - 1) };
}

export function loadPlatformerLevel(state: PlatformerState, level: number): PlatformerState {
  const selected = Math.max(0, Math.min(platformLevels.length - 1, Math.floor(level)));
  const start = platformLevels[selected].start;
  return { ...state, level: selected, x: start.x, y: start.y, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0, jumpWasDown: false, remainder: 0, time: 0, lives: 3, collected: [], checkpoint: start, complete: false, gameOver: false };
}

export function stepPlatformer(state: PlatformerState, input: PlatformerInput, deltaSeconds: number): PlatformerState {
  if (state.complete || state.gameOver || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state;
  const level = platformLevels[state.level];
  const remaining = state.remainder + Math.min(deltaSeconds, 0.1);
  let accumulator = remaining;
  let next = { ...state, jumpWasDown: input.jump, jumpBuffer: input.jump && !state.jumpWasDown ? 0.12 : state.jumpBuffer, time: state.time + Math.min(deltaSeconds, 0.1) };
  const fixedStep = 1 / 120;
  const player = { width: 25, height: 32 };
  const stepCount = Math.min(12, Math.floor((accumulator + 1e-9) / fixedStep));
  for (let step = 0; step < stepCount && !next.complete; step += 1) {
    accumulator -= fixedStep;
    const elapsed = next.time - (remaining - accumulator);
    const moving = level.moving.map((platform) => ({
      ...platform,
      x: platform.x + Math.sin(elapsed * platform.speed + platform.phase) * platform.range,
    }));
    const previousMoving = level.moving.map((platform) => ({
      ...platform,
      x: platform.x + Math.sin((elapsed - fixedStep) * platform.speed + platform.phase) * platform.range,
    }));
    const solids = [...level.platforms, ...moving];
    const wasGrounded = next.grounded;
    let x = next.x;
    let y = next.y;
    let vx = next.vx;
    let vy = next.vy;
    let grounded = false;
    let coyote = wasGrounded ? 0.1 : Math.max(0, next.coyote - fixedStep);
    let jumpBuffer = Math.max(0, next.jumpBuffer - fixedStep);
    if (input.left !== input.right) vx += (input.right ? 1 : -1) * 1500 * fixedStep;
    else vx *= Math.max(0, 1 - 12 * fixedStep);
    vx = Math.max(-265, Math.min(265, vx));
    if (jumpBuffer > 0 && coyote > 0) {
      vy = -610;
      coyote = 0;
      jumpBuffer = 0;
    }
    vy = Math.min(900, vy + 1750 * fixedStep);
    const dx = vx * fixedStep;
    x += dx;
    const horizontal = { x, y, ...player };
    for (const platform of solids) if (overlaps(horizontal, platform)) {
      x = dx > 0 ? platform.x - player.width : platform.x + platform.width;
      vx = 0;
      break;
    }
    const dy = vy * fixedStep;
    y += dy;
    const vertical = { x, y, ...player };
    for (const platform of solids) if (overlaps(vertical, platform)) {
      if (dy > 0) { y = platform.y - player.height; grounded = true; coyote = 0.1; }
      else if (dy < 0) y = platform.y + platform.height;
      vy = 0;
      break;
    }
    if (wasGrounded && grounded) {
      const ride = moving.find((platform) => Math.abs(next.y + player.height - platform.y) < 3 && next.x + player.width > platform.x && next.x < platform.x + platform.width);
      if (ride) x += ride.x - (previousMoving.find((platform) => platform.phase === ride.phase)?.x ?? ride.x);
    }
    next = { ...next, x, y, vx, vy, grounded, coyote, jumpBuffer, remainder: 0 };
    if (level.hazards.some((hazard) => overlaps({ x, y, ...player }, hazard)) || y > 480 || x < -20 || x > 820) {
      next = respawnPlatformer(next);
      if (next.lives === 0) next.gameOver = true;
      continue;
    }
    for (const checkpoint of level.checkpoints) {
      if (Math.hypot(x + player.width / 2 - checkpoint.x, y + player.height / 2 - checkpoint.y) < 30) next.checkpoint = { x: checkpoint.x - player.width / 2, y: checkpoint.y - player.height };
    }
    next.collected = [...new Set([...next.collected, ...level.collectibles.filter((item) => Math.hypot(x + player.width / 2 - item.x, y + player.height / 2 - item.y) < 25).map((item) => item.id)])];
    if (overlaps({ x, y, ...player }, level.exit)) {
      const completedLevels = [...new Set([...next.completedLevels, state.level])];
      const unlocked = Math.min(platformLevels.length, Math.max(next.unlocked, state.level + 2));
      const bestTimes = [...next.bestTimes];
      bestTimes[state.level] = bestTimes[state.level] ? Math.min(bestTimes[state.level], next.time) : next.time;
      next = { ...next, complete: true, completedLevels, unlocked, bestTimes };
    }
  }
  return { ...next, remainder: accumulator };
}
