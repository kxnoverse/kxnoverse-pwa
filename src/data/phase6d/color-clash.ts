export const CLASH_COLORS = ["coral", "blue", "green", "gold"] as const;
export type ClashColor = typeof CLASH_COLORS[number];
export type ClashCardType = "number" | "skip" | "reverse" | "drawTwo" | "wild";
export type ClashMode = "computer" | "local";
export type ClashDifficulty = "easy" | "normal" | "hard";

export interface ClashCard {
  id: string;
  color: ClashColor | null;
  type: ClashCardType;
  value?: number;
}

export interface ClashPlayer {
  id: number;
  name: string;
  kind: "human" | "computer";
  hand: ClashCard[];
}

export interface ClashHistoryEntry {
  id: number;
  type: "start" | "play" | "draw" | "penalty" | "pass" | "win";
  player: number;
  cardType?: ClashCardType;
  color?: ClashColor;
  value?: number;
  amount?: number;
}

export interface ColorClashState {
  version: 1;
  seed: number;
  rngState: number;
  mode: ClashMode;
  difficulty: ClashDifficulty;
  stackDrawCards: boolean;
  players: ClashPlayer[];
  activePlayer: number;
  direction: 1 | -1;
  currentColor: ClashColor;
  drawPile: ClashCard[];
  discardPile: ClashCard[];
  pendingDraw: number;
  hasDrawn: boolean;
  drawnCardId: string | null;
  phase: "play" | "won";
  winner: number | null;
  turn: number;
  nextHistoryId: number;
  history: ClashHistoryEntry[];
}

export interface ClashActionResult {
  state: ColorClashState;
  error?: string;
}

export type ClashAiAction =
  | { type: "play"; cardId: string; color?: ClashColor; rngState: number }
  | { type: "draw" | "penalty" | "pass" };

function randomStep(seed: number): { seed: number; value: number } {
  let next = seed | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return { seed: next || 0x6d2b79f5, value: (next >>> 0) / 0x1_0000_0000 };
}

function shuffleCards(cards: readonly ClashCard[], seed: number): { cards: ClashCard[]; seed: number } {
  const shuffled = [...cards];
  let nextSeed = seed >>> 0 || 0x6d2b79f5;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = randomStep(nextSeed);
    nextSeed = random.seed;
    const target = Math.floor(random.value * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return { cards: shuffled, seed: nextSeed };
}

function createDeck(): ClashCard[] {
  const cards: ClashCard[] = [];
  for (const color of CLASH_COLORS) {
    cards.push({ id: `${color}-0`, color, type: "number", value: 0 });
    for (let value = 1; value <= 9; value += 1) {
      cards.push({ id: `${color}-${value}-a`, color, type: "number", value });
      cards.push({ id: `${color}-${value}-b`, color, type: "number", value });
    }
    for (const type of ["skip", "reverse", "drawTwo"] as const) {
      cards.push({ id: `${color}-${type}-a`, color, type });
      cards.push({ id: `${color}-${type}-b`, color, type });
    }
  }
  for (let index = 0; index < 4; index += 1) cards.push({ id: `wild-${index + 1}`, color: null, type: "wild" });
  return cards;
}

function addHistory(state: ColorClashState, entry: Omit<ClashHistoryEntry, "id">): ColorClashState {
  return {
    ...state,
    nextHistoryId: state.nextHistoryId + 1,
    history: [...state.history, { ...entry, id: state.nextHistoryId }].slice(-40),
  };
}

function nextPlayerIndex(state: ColorClashState, from: number, steps = 1): number {
  return (from + state.direction * steps + state.players.length * steps) % state.players.length;
}

function advanceTurn(state: ColorClashState, steps = 1): ColorClashState {
  return {
    ...state,
    activePlayer: nextPlayerIndex(state, state.activePlayer, steps),
    hasDrawn: false,
    drawnCardId: null,
    turn: state.turn + 1,
  };
}

function drawCards(
  state: ColorClashState,
  playerIndex: number,
  count: number,
): { state: ColorClashState; drawn: ClashCard[] } {
  let next = state;
  const drawn: ClashCard[] = [];
  for (let index = 0; index < count; index += 1) {
    if (next.drawPile.length === 0 && next.discardPile.length > 1) {
      const top = next.discardPile[next.discardPile.length - 1];
      const recycled = shuffleCards(next.discardPile.slice(0, -1), next.rngState);
      next = { ...next, drawPile: recycled.cards, discardPile: [top], rngState: recycled.seed };
    }
    if (next.drawPile.length === 0) break;
    const card = next.drawPile[next.drawPile.length - 1];
    next = { ...next, drawPile: next.drawPile.slice(0, -1) };
    drawn.push(card);
  }
  if (drawn.length > 0) {
    next = {
      ...next,
      players: next.players.map((player, index) =>
        index === playerIndex ? { ...player, hand: [...player.hand, ...drawn] } : player),
    };
  }
  return { state: next, drawn };
}

function validPlayerCount(count: number): count is 2 | 3 | 4 {
  return Number.isInteger(count) && count >= 2 && count <= 4;
}

export function createColorClash(
  mode: ClashMode,
  playerCount: 2 | 3 | 4,
  difficulty: ClashDifficulty = "normal",
  stackDrawCards = false,
  seed = Date.now(),
): ColorClashState {
  if (!validPlayerCount(playerCount)) throw new Error("Color Clash needs two to four players.");
  const safeSeed = seed >>> 0 || 0x6d2b79f5;
  const shuffled = shuffleCards(createDeck(), safeSeed);
  let drawPile = shuffled.cards;
  const players = Array.from({ length: playerCount }, (_, id): ClashPlayer => ({
    id,
    name: mode === "computer" ? (id === 0 ? "You" : `AI ${id}`) : `Player ${id + 1}`,
    kind: mode === "computer" && id > 0 ? "computer" : "human",
    hand: [],
  }));
  for (let cardIndex = 0; cardIndex < 7; cardIndex += 1) {
    for (const player of players) {
      const card = drawPile.pop();
      if (card) player.hand.push(card);
    }
  }
  const starterIndex = drawPile.findIndex((card) => card.type === "number");
  if (starterIndex < 0) throw new Error("Color Clash could not find a starting card.");
  const [starter] = drawPile.splice(starterIndex, 1);
  const initial: ColorClashState = {
    version: 1,
    seed: safeSeed,
    rngState: shuffled.seed,
    mode,
    difficulty,
    stackDrawCards,
    players,
    activePlayer: 0,
    direction: 1,
    currentColor: starter.color!,
    drawPile,
    discardPile: [starter],
    pendingDraw: 0,
    hasDrawn: false,
    drawnCardId: null,
    phase: "play",
    winner: null,
    turn: 1,
    nextHistoryId: 2,
    history: [{ id: 1, type: "start", player: 0 }],
  };
  return initial;
}

function matchesCurrent(card: ClashCard, state: ColorClashState): boolean {
  if (card.type === "wild") return true;
  const top = state.discardPile[state.discardPile.length - 1];
  return card.color === state.currentColor ||
    (card.type === "number" && top.type === "number" && card.value === top.value) ||
    (card.type !== "number" && card.type === top.type);
}

export function getPlayableClashCards(state: ColorClashState, playerIndex = state.activePlayer): ClashCard[] {
  const player = state.players[playerIndex];
  if (!player || state.phase !== "play" || playerIndex !== state.activePlayer) return [];
  if (state.pendingDraw > 0) {
    return state.stackDrawCards
      ? player.hand.filter((card) => card.type === "drawTwo")
      : [];
  }
  return player.hand.filter((card) =>
    (state.drawnCardId === null || state.drawnCardId === card.id) && matchesCurrent(card, state));
}

export function playClashCard(state: ColorClashState, cardId: string, chosenColor?: ClashColor): ClashActionResult {
  if (state.phase !== "play") return { state, error: "This Color Clash game has finished." };
  const player = state.players[state.activePlayer];
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card || !getPlayableClashCards(state).some((candidate) => candidate.id === cardId)) {
    return { state, error: "That card cannot be played now." };
  }
  if (card.type === "wild" && !CLASH_COLORS.includes(chosenColor!)) {
    return { state, error: "Choose a color for the Wild card." };
  }

  const remainingHand = player.hand.filter((candidate) => candidate.id !== card.id);
  let next: ColorClashState = {
    ...state,
    players: state.players.map((candidate, index) =>
      index === state.activePlayer ? { ...candidate, hand: remainingHand } : candidate),
    discardPile: [...state.discardPile, card],
    currentColor: card.type === "wild" ? chosenColor! : card.color!,
    pendingDraw: card.type === "drawTwo" ? state.pendingDraw + 2 : 0,
    hasDrawn: false,
    drawnCardId: null,
  };
  next = addHistory(next, {
    type: "play",
    player: state.activePlayer,
    cardType: card.type,
    color: next.currentColor,
    value: card.value,
  });
  if (remainingHand.length === 0) {
    next = { ...next, phase: "won", winner: state.activePlayer };
    return { state: addHistory(next, { type: "win", player: state.activePlayer }) };
  }

  if (card.type === "reverse") {
    next = { ...next, direction: next.direction === 1 ? -1 : 1 };
    next = advanceTurn(next, next.players.length === 2 ? 0 : 1);
  } else if (card.type === "skip") {
    next = advanceTurn(next, 2);
  } else if (card.type === "drawTwo" && !state.stackDrawCards) {
    const targetIndex = nextPlayerIndex(next, state.activePlayer);
    const penalty = drawCards(next, targetIndex, next.pendingDraw);
    next = { ...penalty.state, pendingDraw: 0 };
    next = addHistory(next, { type: "penalty", player: targetIndex, amount: penalty.drawn.length });
    next = advanceTurn(next, 2);
  } else {
    next = advanceTurn(next);
  }
  return { state: next };
}

export function drawClashCard(state: ColorClashState): ClashActionResult {
  if (state.phase !== "play" || state.pendingDraw > 0 || state.hasDrawn ||
      getPlayableClashCards(state).length > 0) {
    return { state, error: "You can draw only when no playable card is available." };
  }
  const result = drawCards(state, state.activePlayer, 1);
  if (result.drawn.length === 0) {
    const passed = advanceTurn(result.state);
    return { state: addHistory(passed, { type: "pass", player: state.activePlayer }) };
  }
  const drawnCard = result.drawn[0];
  const next = {
    ...result.state,
    hasDrawn: true,
    drawnCardId: drawnCard.id,
  };
  return { state: addHistory(next, { type: "draw", player: state.activePlayer, amount: 1 }) };
}

export function passClashTurn(state: ColorClashState): ClashActionResult {
  if (state.phase !== "play" || !state.hasDrawn || state.pendingDraw > 0) {
    return { state, error: "Draw a card before passing this turn." };
  }
  const next = advanceTurn(state);
  return { state: addHistory(next, { type: "pass", player: state.activePlayer }) };
}

export function takeClashPenalty(state: ColorClashState): ClashActionResult {
  if (state.phase !== "play" || state.pendingDraw <= 0) {
    return { state, error: "There is no draw penalty to take." };
  }
  const playerIndex = state.activePlayer;
  const amount = state.pendingDraw;
  const result = drawCards({ ...state, pendingDraw: 0 }, playerIndex, amount);
  const next = advanceTurn(result.state);
  return { state: addHistory(next, { type: "penalty", player: playerIndex, amount: result.drawn.length }) };
}

function chooseAiCard(state: ColorClashState, legal: ClashCard[]): { card: ClashCard; color?: ClashColor; rngState: number } {
  let rngState = state.rngState;
  const nextRandom = () => {
    const result = randomStep(rngState);
    rngState = result.seed;
    return result.value;
  };
  let candidates = [...legal];
  if (state.difficulty === "normal") {
    const actionCards = candidates.filter((card) => card.type !== "number");
    if (actionCards.length > 0) candidates = actionCards;
  } else if (state.difficulty === "hard") {
    const opponent = state.players
      .filter((player) => player.id !== state.activePlayer)
      .sort((left, right) => left.hand.length - right.hand.length)[0];
    const threat = opponent?.hand.length === 1;
    const score = (card: ClashCard) =>
      (card.type === "drawTwo" ? (threat ? 8 : 5) : 0) +
      (card.type === "skip" ? (threat ? 7 : 4) : 0) +
      (card.type === "reverse" ? (threat ? 6 : 3) : 0) +
      (card.type === "wild" ? 2 : 0) +
      (card.type === "number" ? 0 : 1);
    const highest = Math.max(...candidates.map(score));
    candidates = candidates.filter((card) => score(card) === highest);
  }
  const card = candidates[Math.floor(nextRandom() * candidates.length)];
  const color = card.type === "wild"
    ? CLASH_COLORS.reduce((best, candidate) => {
      const held = state.players[state.activePlayer].hand.filter((heldCard) => heldCard.color === candidate).length;
      const bestHeld = state.players[state.activePlayer].hand.filter((heldCard) => heldCard.color === best).length;
      return held > bestHeld ? candidate : best;
    }, CLASH_COLORS[Math.floor(nextRandom() * CLASH_COLORS.length)])
    : undefined;
  return { card, color, rngState };
}

export function chooseColorClashAiAction(state: ColorClashState): ClashAiAction {
  if (state.phase !== "play" || state.players[state.activePlayer]?.kind !== "computer") return { type: "pass" };
  const legal = getPlayableClashCards(state);
  if (state.pendingDraw > 0) {
    if (legal.length > 0 && (state.difficulty === "hard" || (state.difficulty === "normal" && state.players[state.activePlayer].hand.length > state.pendingDraw + 1))) {
      const selected = chooseAiCard(state, legal);
      return { type: "play", cardId: selected.card.id, color: selected.color, rngState: selected.rngState };
    }
    return { type: "penalty" };
  }
  if (legal.length > 0) {
    const selected = chooseAiCard(state, legal);
    return { type: "play", cardId: selected.card.id, color: selected.color, rngState: selected.rngState };
  }
  return state.hasDrawn ? { type: "pass" } : { type: "draw" };
}

export function runColorClashAiTurn(state: ColorClashState): ColorClashState {
  let next = state;
  for (let actionCount = 0; actionCount < 512 && next.phase === "play" &&
      next.players[next.activePlayer].kind === "computer"; actionCount += 1) {
    const action = chooseColorClashAiAction(next);
    if (action.type === "play") {
      next = { ...next, rngState: action.rngState };
      const result = playClashCard(next, action.cardId, action.color);
      if (result.error) break;
      next = result.state;
    } else if (action.type === "draw") {
      next = drawClashCard(next).state;
    } else if (action.type === "penalty") {
      const result = takeClashPenalty(next);
      if (result.error) break;
      next = result.state;
    } else {
      next = passClashTurn(next).state;
    }
  }
  return next;
}

export function validateColorClashState(value: unknown): value is ColorClashState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ColorClashState>;
  if (state.version !== 1 || !Array.isArray(state.players) || !Array.isArray(state.drawPile) ||
      !Array.isArray(state.discardPile) || state.discardPile.length === 0 || !Array.isArray(state.history)) return false;
  if (!["computer", "local"].includes(state.mode ?? "") || !["easy", "normal", "hard"].includes(state.difficulty ?? "") ||
      typeof state.stackDrawCards !== "boolean" || !["play", "won"].includes(state.phase ?? "") ||
      ![1, -1].includes(state.direction ?? 0) || !CLASH_COLORS.includes(state.currentColor!)) return false;
  if (state.players.length < 2 || state.players.length > 4 || !Number.isInteger(state.activePlayer) ||
      state.activePlayer! < 0 || state.activePlayer! >= state.players.length || !Number.isInteger(state.pendingDraw) ||
      state.pendingDraw! < 0 || (state.pendingDraw! % 2 !== 0) || !Number.isInteger(state.turn) || state.turn! < 1) return false;
  if (state.players.some((player, index) => !player || player.id !== index || !Array.isArray(player.hand) ||
      !["human", "computer"].includes(player.kind) || player.hand.some((card) => !isValidClashCard(card)))) return false;
  if (state.drawPile.some((card) => !isValidClashCard(card)) || state.discardPile.some((card) => !isValidClashCard(card))) return false;
  const allCards = [...state.players.flatMap((player) => player.hand), ...state.drawPile, ...state.discardPile];
  if (allCards.length !== 104 || new Set(allCards.map((card) => card.id)).size !== 104) return false;
  if (state.phase === "won") {
    if (!Number.isInteger(state.winner) || state.winner! < 0 || state.winner! >= state.players.length ||
        state.players[state.winner!].hand.length !== 0) return false;
  } else if (state.winner !== null) return false;
  const activePlayer = state.players[state.activePlayer ?? -1];
  if (state.drawnCardId !== null && (!activePlayer || !activePlayer.hand.some((card) => card.id === state.drawnCardId))) return false;
  if (!Number.isInteger(state.rngState) || !Number.isInteger(state.seed) || !Number.isInteger(state.nextHistoryId)) return false;
  return true;
}

function isValidClashCard(card: ClashCard): boolean {
  if (!card || typeof card.id !== "string" || card.id.length === 0 ||
      !["number", "skip", "reverse", "drawTwo", "wild"].includes(card.type)) return false;
  if (card.type === "wild") return card.color === null && card.value === undefined;
  if (!CLASH_COLORS.includes(card.color!)) return false;
  return card.type === "number"
    ? Number.isInteger(card.value) && card.value! >= 0 && card.value! <= 9
    : card.value === undefined;
}
