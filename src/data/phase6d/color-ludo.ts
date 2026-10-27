export type LudoColor = "coral" | "teal" | "gold" | "violet";
export type LudoMode = "computer" | "local";
export type LudoDifficulty = "easy" | "normal" | "hard";
export type LudoPhase = "roll" | "move" | "won";

export interface LudoHistoryEntry {
  type: "start" | "roll" | "third-six" | "no-move" | "move" | "win";
  player: number;
  roll?: number;
  token?: number;
  destination?: number;
  captured?: number[];
}

export interface LudoPlayer {
  color: LudoColor;
  kind: "human" | "computer";
  tokens: number[];
}

export interface ColorLudoState {
  version: 1;
  seed: number;
  randomState: number;
  mode: LudoMode;
  difficulty: LudoDifficulty;
  players: LudoPlayer[];
  activePlayer: number;
  phase: LudoPhase;
  dice: number | null;
  legalTokens: number[];
  consecutiveSixes: number;
  turn: number;
  winner: number | null;
  history: LudoHistoryEntry[];
}

export interface LudoMoveResult {
  state: ColorLudoState;
  captured: number[];
  finished: boolean;
}

export const LUDO_COLORS: LudoColor[] = ["coral", "teal", "gold", "violet"];
export const LUDO_STARTS: Record<LudoColor, number> = {
  coral: 0,
  teal: 13,
  gold: 26,
  violet: 39,
};
export const LUDO_SAFE_SPACES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const LUDO_FINISH_PROGRESS = 57;
const TOKEN_COUNT = 4;

function randomFromSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function createColorLudo(
  mode: LudoMode,
  playerCount: 2 | 3 | 4,
  difficulty: LudoDifficulty,
  seed: number,
): ColorLudoState {
  if (!Number.isSafeInteger(seed)) throw new Error("Color Ludo seed must be a safe integer.");
  if (mode !== "computer" && mode !== "local") throw new Error("Unknown Color Ludo mode.");
  if (mode === "computer" && playerCount !== 2) throw new Error("Computer mode requires two players.");
  if (![2, 3, 4].includes(playerCount)) throw new Error("Color Ludo requires two, three, or four players.");
  if (!["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unknown Color Ludo difficulty.");
  return {
    version: 1,
    seed,
    randomState: seed >>> 0 || 0x9e3779b9,
    mode,
    difficulty,
    players: LUDO_COLORS.slice(0, playerCount).map((color, index) => ({
      color,
      kind: mode === "computer" && index > 0 ? "computer" : "human",
      tokens: Array(TOKEN_COUNT).fill(-1),
    })),
    activePlayer: 0,
    phase: "roll",
    dice: null,
    legalTokens: [],
    consecutiveSixes: 0,
    turn: 1,
    winner: null,
    history: [{ type: "start", player: 0 }],
  };
}

export function rollColorLudo(state: ColorLudoState, roll: number): ColorLudoState {
  if (state.phase !== "roll" || !Number.isInteger(roll) || roll < 1 || roll > 6) return state;
  const player = state.players[state.activePlayer];
  const sixes = roll === 6 ? state.consecutiveSixes + 1 : 0;
  if (roll === 6 && sixes === 3) {
    const history = [...state.history, { type: "third-six" as const, player: state.activePlayer, roll }].slice(-30);
    return {
      ...state,
      activePlayer: (state.activePlayer + 1) % state.players.length,
      phase: "roll",
      dice: null,
      legalTokens: [],
      consecutiveSixes: 0,
      turn: state.turn + 1,
      history,
    };
  }
  const legalTokens = player.tokens.flatMap((progress, index) => {
    if (progress === LUDO_FINISH_PROGRESS) return [];
    if (progress === -1) return roll === 6 ? [index] : [];
    return progress + roll <= LUDO_FINISH_PROGRESS ? [index] : [];
  });
  const history = [...state.history, { type: "roll" as const, player: state.activePlayer, roll }].slice(-30);
  if (legalTokens.length) {
    return { ...state, phase: "move", dice: roll, legalTokens, consecutiveSixes: sixes, history };
  }
  const automaticExtraRoll = roll === 6 && sixes < 3;
  return {
    ...state,
    activePlayer: automaticExtraRoll ? state.activePlayer : (state.activePlayer + 1) % state.players.length,
    phase: "roll",
    dice: null,
    legalTokens: [],
    consecutiveSixes: automaticExtraRoll ? sixes : 0,
    turn: state.turn + (automaticExtraRoll ? 0 : 1),
    history: [...history, { type: "no-move" as const, player: state.activePlayer, roll }].slice(-30),
  };
}

function ringPosition(color: LudoColor, progress: number): number | null {
  return progress < 0 || progress >= 52 ? null : (LUDO_STARTS[color] + progress) % 52;
}

export function moveColorLudoToken(state: ColorLudoState, tokenIndex: number): LudoMoveResult {
  if (state.phase !== "move" || !state.dice || !state.legalTokens.includes(tokenIndex)) {
    return { state, captured: [], finished: false };
  }
  const active = state.players[state.activePlayer];
  const previous = active.tokens[tokenIndex];
  const nextProgress = previous === -1 ? 0 : previous + state.dice;
  const movedPlayers = state.players.map((player, index) => ({
    ...player,
    tokens: [...player.tokens],
    ...(index === state.activePlayer ? { tokens: player.tokens.map((progress, token) => token === tokenIndex ? nextProgress : progress) } : {}),
  }));
  const destination = ringPosition(active.color, nextProgress);
  const captured: number[] = [];
  if (destination !== null && !LUDO_SAFE_SPACES.has(destination)) {
    for (let playerIndex = 0; playerIndex < movedPlayers.length; playerIndex += 1) {
      if (playerIndex === state.activePlayer) continue;
      movedPlayers[playerIndex].tokens = movedPlayers[playerIndex].tokens.map((progress) => {
        if (ringPosition(movedPlayers[playerIndex].color, progress) !== destination) return progress;
        captured.push(playerIndex);
        return -1;
      });
    }
  }
  const finished = nextProgress === LUDO_FINISH_PROGRESS;
  const won = movedPlayers[state.activePlayer].tokens.every((progress) => progress === LUDO_FINISH_PROGRESS);
  const history = [...state.history, {
    type: "move" as const,
    player: state.activePlayer,
    roll: state.dice,
    token: tokenIndex,
    destination: nextProgress,
    captured,
  }].slice(-30);
  if (won) {
    return {
      state: {
        ...state,
        players: movedPlayers,
        phase: "won",
        dice: state.dice,
        legalTokens: [],
        winner: state.activePlayer,
        history: [...history, { type: "win" as const, player: state.activePlayer }].slice(-30),
      },
      captured,
      finished,
    };
  }
  const extraRoll = state.dice === 6;
  return {
    state: {
      ...state,
      players: movedPlayers,
      activePlayer: extraRoll ? state.activePlayer : (state.activePlayer + 1) % state.players.length,
      phase: "roll",
      dice: null,
      legalTokens: [],
      consecutiveSixes: extraRoll ? state.consecutiveSixes : 0,
      turn: state.turn + (extraRoll ? 0 : 1),
      history,
    },
    captured,
    finished,
  };
}

function moveProgress(state: ColorLudoState, playerIndex: number, tokenIndex: number): number {
  const progress = state.players[playerIndex].tokens[tokenIndex];
  return progress === -1 ? 0 : progress + (state.dice ?? 0);
}

function threatScore(state: ColorLudoState, playerIndex: number, progress: number): number {
  const player = state.players[playerIndex];
  const position = ringPosition(player.color, progress);
  if (position === null || LUDO_SAFE_SPACES.has(position)) return 0;
  let threats = 0;
  for (let index = 0; index < state.players.length; index += 1) {
    if (index === playerIndex) continue;
    for (const opponentProgress of state.players[index].tokens) {
      const opponentPosition = ringPosition(state.players[index].color, opponentProgress);
      if (opponentPosition === null) continue;
      const distance = (position - opponentPosition + 52) % 52;
      if (distance >= 1 && distance <= 6) threats += 1;
    }
  }
  return threats;
}

function scoreMove(state: ColorLudoState, tokenIndex: number): number {
  const playerIndex = state.activePlayer;
  const player = state.players[playerIndex];
  const previous = player.tokens[tokenIndex];
  const next = moveProgress(state, playerIndex, tokenIndex);
  if (next === LUDO_FINISH_PROGRESS) return 10000;
  const destination = ringPosition(player.color, next);
  let score = next * 1.8 + (previous === -1 ? 12 : 0);
  if (destination !== null && LUDO_SAFE_SPACES.has(destination)) score += 12;
  if (destination !== null && !LUDO_SAFE_SPACES.has(destination)) {
    for (let index = 0; index < state.players.length; index += 1) {
      if (index !== playerIndex && state.players[index].tokens.some((progress) =>
        ringPosition(state.players[index].color, progress) === destination)) score += 90;
    }
  }
  if (next >= 52) score += 24 + (next - 52) * 2;
  if (state.difficulty === "hard") {
    const before = threatScore(state, playerIndex, previous);
    const after = threatScore(state, playerIndex, next);
    score += before * 4 - after * 9;
    const teammates = player.tokens.filter((progress) => progress >= 0 && progress < 52 &&
      ringPosition(player.color, progress) === destination).length;
    score += teammates ? 2 : 0;
  }
  return score;
}

export function chooseColorLudoMove(
  state: ColorLudoState,
  random = Math.random,
): number | null {
  if (state.phase !== "move" || state.legalTokens.length === 0) return null;
  const randomIndex = (length: number) => {
    const value = random();
    return Math.min(length - 1, Math.max(0, Number.isFinite(value) ? Math.floor(value * length) : 0));
  };
  if (state.difficulty === "easy") {
    return state.legalTokens[randomIndex(state.legalTokens.length)];
  }
  const ranked = state.legalTokens
    .map((token) => ({ token, score: scoreMove(state, token) }))
    .sort((left, right) => right.score - left.score);
  if (state.difficulty === "normal" && ranked.length > 1 && random() < 0.3) {
    return ranked[randomIndex(ranked.length)].token;
  }
  return ranked[0].token;
}

export function advanceColorLudoRandom(state: ColorLudoState): { state: ColorLudoState; roll: number } {
  const nextSeed = randomFromSeed(state.randomState || (state.seed >>> 0) || 0x9e3779b9);
  const roll = nextSeed % 6 + 1;
  return { state: { ...state, randomState: nextSeed }, roll };
}

export function validateColorLudoState(value: unknown): value is ColorLudoState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ColorLudoState>;
  if (state.version !== 1 || !Number.isSafeInteger(state.seed) || !Number.isInteger(state.randomState) ||
      (state.mode !== "computer" && state.mode !== "local") ||
      !["easy", "normal", "hard"].includes(String(state.difficulty)) ||
      !Array.isArray(state.players) || ![2, 3, 4].includes(state.players.length) ||
      (state.mode === "computer" && state.players.length !== 2) ||
      !Number.isInteger(state.activePlayer) || (state.activePlayer ?? -1) < 0 ||
      (state.activePlayer ?? 0) >= state.players.length ||
      !["roll", "move", "won"].includes(String(state.phase)) ||
      !(state.dice === null || (typeof state.dice === "number" && Number.isInteger(state.dice) && state.dice >= 1 && state.dice <= 6)) ||
      !Array.isArray(state.legalTokens) || !Number.isInteger(state.consecutiveSixes) ||
      (state.consecutiveSixes ?? -1) < 0 || (state.consecutiveSixes ?? 0) > 2 ||
      !Number.isInteger(state.turn) || (state.turn ?? 0) < 1 ||
      !(state.winner === null || (typeof state.winner === "number" && Number.isInteger(state.winner) && state.winner >= 0 && state.winner < state.players.length)) ||
      !Array.isArray(state.history) || !state.history.every((item) => {
        if (!item || typeof item !== "object" ||
            !["start", "roll", "third-six", "no-move", "move", "win"].includes(item.type) ||
            !Number.isInteger(item.player) || item.player < 0 || item.player >= state.players!.length) return false;
        if (item.roll !== undefined && (!Number.isInteger(item.roll) || item.roll < 1 || item.roll > 6)) return false;
        if (item.token !== undefined && (!Number.isInteger(item.token) || item.token < 0 || item.token >= TOKEN_COUNT)) return false;
        if (item.destination !== undefined && (!Number.isInteger(item.destination) || item.destination < 0 || item.destination > LUDO_FINISH_PROGRESS)) return false;
        return item.captured === undefined || (Array.isArray(item.captured) && item.captured.every((index) =>
          Number.isInteger(index) && index >= 0 && index < state.players!.length));
      })) return false;
  const players = state.players as ColorLudoState["players"];
  const colors = new Set<LudoColor>();
  for (const player of players) {
    if (!player || !LUDO_COLORS.includes(player.color) || colors.has(player.color) ||
        (player.kind !== "human" && player.kind !== "computer") ||
        !Array.isArray(player.tokens) || player.tokens.length !== TOKEN_COUNT ||
        player.tokens.some((progress) => !Number.isInteger(progress) || progress < -1 || progress > LUDO_FINISH_PROGRESS)) return false;
    colors.add(player.color);
  }
  if (players.some((player, index) =>
    player.kind !== (state.mode === "computer" && index > 0 ? "computer" : "human"))) return false;
  const activePlayer = state.activePlayer;
  const dice = state.dice;
  const legalTokens = state.legalTokens;
  if (state.phase === "move") {
    if (typeof activePlayer !== "number" || typeof dice !== "number" || !Array.isArray(legalTokens) ||
        legalTokens.length === 0 ||
        legalTokens.some((token) => !Number.isInteger(token) || token < 0 || token >= TOKEN_COUNT) ||
        new Set(legalTokens).size !== legalTokens.length) return false;
    const active = players[activePlayer];
    if (!active) return false;
    const expectedLegalTokens = active.tokens.flatMap((progress, index) => {
      if (progress === LUDO_FINISH_PROGRESS) return [];
      if (progress === -1) return dice === 6 ? [index] : [];
      return progress + dice <= LUDO_FINISH_PROGRESS ? [index] : [];
    });
    if (expectedLegalTokens.length !== legalTokens.length ||
        expectedLegalTokens.some((token) => !legalTokens.includes(token))) return false;
  } else if (!Array.isArray(legalTokens) || legalTokens.length !== 0 || (state.phase === "roll" && dice !== null)) return false;
  if (state.phase === "won") {
    const winner = state.winner;
    const winnerPlayer = typeof winner === "number" ? players[winner] : undefined;
    if (!winnerPlayer || winnerPlayer.tokens.some((progress) => progress !== LUDO_FINISH_PROGRESS)) return false;
  } else if (state.winner !== null) return false;
  return true;
}

export function ludoTokenRingPosition(player: LudoPlayer, progress: number): number | null {
  return ringPosition(player.color, progress);
}
