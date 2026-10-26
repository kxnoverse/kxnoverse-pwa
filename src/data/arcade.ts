export type GameId = "2048" | "snake" | "memory" | "reaction" | "sliding" | "word-guess" | "brick-breaker" | "geometry-runner" | "air-hockey" | "aim-trainer" | "simon-says" | "line-rider" | "idle-clicker" | "chess" | "block-stack" | "minesweeper" | "pong" | "sudoku" | "flappy-cube" | "connect-four" | "maze-escape" | "tower-defense" | "rhythm-tiles" | "mini-platformer";
export type GameCategory = "puzzle" | "arcade" | "reaction" | "precision" | "strategy";

export interface GameDefinition {
  id: GameId;
  category: GameCategory;
  name: string;
  description: string;
}

export const games: GameDefinition[] = [
  { id: "2048", category: "puzzle", name: "2048", description: "Merge matching tiles to reach 2048." },
  { id: "snake", category: "arcade", name: "Snake", description: "Collect food and avoid your tail." },
  { id: "memory", category: "puzzle", name: "Memory", description: "Match every pair in as few moves as possible." },
  { id: "reaction", category: "reaction", name: "Reaction test", description: "Wait for the signal, then react quickly." },
  { id: "sliding", category: "puzzle", name: "Sliding puzzle", description: "Arrange the tiles in numerical order." },
  { id: "word-guess", category: "puzzle", name: "Word Guess", description: "Find the hidden word in six tries." },
  { id: "brick-breaker", category: "arcade", name: "Brick Breaker", description: "Clear each level with the paddle and ball." },
  { id: "geometry-runner", category: "arcade", name: "Geometry Runner", description: "Jump over obstacles and keep running." },
  { id: "air-hockey", category: "arcade", name: "Air Hockey", description: "Outscore the computer in a fast rink match." },
  { id: "aim-trainer", category: "precision", name: "Aim Trainer", description: "Train your precision and reaction time." },
  { id: "simon-says", category: "reaction", name: "Simon Says", description: "Repeat the growing sequence of lights and sounds." },
  { id: "line-rider", category: "arcade", name: "Line Rider", description: "Draw a track and guide the rider through it." },
  { id: "idle-clicker", category: "arcade", name: "Idle Clicker", description: "Collect resources, upgrade production and progress offline." },
  { id: "chess", category: "puzzle", name: "Chess", description: "Play chess locally against a friend or the computer." },
  { id: "block-stack", category: "puzzle", name: "Block Stack", description: "Rotate and place falling blocks to clear lines." },
  { id: "minesweeper", category: "puzzle", name: "Minesweeper", description: "Reveal safe tiles and mark every hidden mine." },
  { id: "pong", category: "arcade", name: "Pong", description: "Outplay the computer or challenge a friend." },
  { id: "sudoku", category: "puzzle", name: "Sudoku", description: "Complete a unique number puzzle with logic." },
  { id: "flappy-cube", category: "arcade", name: "Flappy Cube", description: "Flap through a shifting course of obstacles." },
  { id: "connect-four", category: "puzzle", name: "Connect Four", description: "Connect four pieces before your opponent." },
  { id: "maze-escape", category: "puzzle", name: "Maze Escape", description: "Find your way through a generated maze." },
  { id: "tower-defense", category: "strategy", name: "Tower Defense", description: "Build and upgrade towers to defend the route." },
  { id: "rhythm-tiles", category: "reaction", name: "Rhythm Tiles", description: "Hit four lanes in time with original synthesized tracks." },
  { id: "mini-platformer", category: "arcade", name: "Mini Platformer", description: "Jump through eight handcrafted platform levels." },
];

export interface Move2048Result {
  board: number[];
  score: number;
  changed: boolean;
}

export function move2048(board: number[], direction: "left" | "right" | "up" | "down"): Move2048Result {
  if (board.length !== 16) throw new Error("2048 requires a 4 by 4 board.");
  const next = [...board];
  let score = 0;
  for (let line = 0; line < 4; line += 1) {
    const indices = Array.from({ length: 4 }, (_, position) => {
      const oriented = direction === "right" || direction === "down" ? 3 - position : position;
      return direction === "left" || direction === "right" ? line * 4 + oriented : oriented * 4 + line;
    });
    const values = indices.map((index) => board[index]).filter(Boolean);
    const merged: number[] = [];
    for (let position = 0; position < values.length; position += 1) {
      if (values[position] === values[position + 1]) {
        const value = values[position] * 2;
        merged.push(value);
        score += value;
        position += 1;
      } else merged.push(values[position]);
    }
    indices.forEach((index, position) => { next[index] = merged[position] ?? 0; });
  }
  return { board: next, score, changed: next.some((value, index) => value !== board[index]) };
}

export function spawn2048(board: number[], random = Math.random): number[] {
  const empty = board.flatMap((value, index) => value === 0 ? [index] : []);
  if (!empty.length) return [...board];
  const next = [...board];
  const slot = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
  next[slot] = random() < 0.9 ? 2 : 4;
  return next;
}

export function canMove2048(board: number[]): boolean {
  return board.some((value, index) => value === 0 ||
    (index % 4 < 3 && value === board[index + 1]) ||
    (index < 12 && value === board[index + 4]));
}

export type Point = { x: number; y: number };

export function advanceSnake(
  snake: Point[],
  direction: Point,
  food: Point,
  width: number,
  height: number,
): { snake: Point[]; ate: boolean; collided: boolean } {
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const ate = head.x === food.x && head.y === food.y;
  const body = ate ? snake : snake.slice(0, -1);
  const collided = head.x < 0 || head.x >= width || head.y < 0 || head.y >= height ||
    body.some((part) => part.x === head.x && part.y === head.y);
  return { snake: collided ? snake : [head, ...body], ate, collided };
}

export function movePuzzle(board: number[], index: number): number[] | null {
  const empty = board.indexOf(0);
  const size = Math.sqrt(board.length);
  if (!Number.isInteger(size) || Math.abs(index % size - empty % size) + Math.abs(Math.floor(index / size) - Math.floor(empty / size)) !== 1) return null;
  const next = [...board];
  [next[empty], next[index]] = [next[index], next[empty]];
  return next;
}

export function isPuzzleSolved(board: number[]): boolean {
  return board.every((value, index) => value === (index === board.length - 1 ? 0 : index + 1));
}

export function shufflePuzzle(size: 3 | 4, random = Math.random, steps = size * size * 30): number[] {
  let board = Array.from({ length: size * size }, (_, index) => index === size * size - 1 ? 0 : index + 1);
  let previousEmpty = -1;
  for (let step = 0; step < steps; step += 1) {
    const empty = board.indexOf(0);
    const candidates = board.flatMap((_, index) => {
      const adjacent = Math.abs(index % size - empty % size) + Math.abs(Math.floor(index / size) - Math.floor(empty / size)) === 1;
      return adjacent && index !== previousEmpty ? [index] : [];
    });
    const choice = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    const next = [...board];
    [next[empty], next[choice]] = [next[choice], next[empty]];
    previousEmpty = empty;
    board = next;
  }
  return board;
}

export function accentPalette(accent: string): { accent: string; soft: string; strong: string } {
  const match = /^#([0-9a-f]{6})$/i.exec(accent);
  if (!match) return { accent: "var(--accent)", soft: "color-mix(in srgb, var(--accent) 22%, var(--surface-1))", strong: "color-mix(in srgb, var(--accent) 74%, white)" };
  const channels = match[1].match(/../g)?.map((part) => Number.parseInt(part, 16)) ?? [165, 139, 212];
  const mix = (target: number, amount: number) => channels.map((channel) => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, "0")).join("");
  return { accent, soft: `#${mix(255, 0.22)}`, strong: `#${mix(255, 0.48)}` };
}
