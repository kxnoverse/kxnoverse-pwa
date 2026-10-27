export const HEX_RESOURCES = ["wood", "brick", "sheep", "wheat", "ore", "gold"] as const;
export const HEX_BUILD_RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
export type HexResource = typeof HEX_RESOURCES[number];
export type HexTerrain = HexResource | "desert";
export type HexMapSize = "small" | "medium" | "large" | "extraLarge";
export type HexMapLayout = "island" | "atoll";
export type HexDevelopmentType = "knight" | "victoryPoint" | "roadBuilding" | "yearOfPlenty" | "monopoly";
export type HexGameMode = "computer" | "local";
export type HexPhase = "setup-settlement" | "setup-road" | "roll" | "action" | "won";

export interface HexTile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: HexTerrain;
  number: number | null;
  nodeIds: string[];
  edgeIds: string[];
}

export interface HexNode {
  id: string;
  x: number;
  y: number;
  tileIds: string[];
  edgeIds: string[];
}

export interface HexEdge {
  id: string;
  nodeIds: [string, string];
  tileIds: string[];
}

export interface HexBoard {
  seed: number;
  mapSize: HexMapSize;
  layout: HexMapLayout;
  tiles: HexTile[];
  nodes: HexNode[];
  edges: HexEdge[];
}

export interface HexDevelopmentCard {
  id: string;
  type: HexDevelopmentType;
  boughtTurn: number;
}

export type HexResources = Record<HexResource, number>;

export interface HexPlayer {
  id: number;
  name: string;
  color: string;
  kind: "human" | "computer";
  resources: HexResources;
  roads: string[];
  settlements: string[];
  cities: string[];
  developmentCards: HexDevelopmentCard[];
}

export interface HexLogEntry {
  id: number;
  text: string;
}

export interface HexSettlersState {
  version: 1;
  seed: number;
  rngState: number;
  mode: HexGameMode;
  board: HexBoard;
  players: HexPlayer[];
  activePlayer: number;
  phase: HexPhase;
  setupOrder: number[];
  setupIndex: number;
  pendingSetupNode: string | null;
  dice: [number, number] | null;
  developmentDeck: HexDevelopmentType[];
  playedDevelopmentCard: boolean;
  winner: number | null;
  turn: number;
  nextLogId: number;
  log: HexLogEntry[];
}

export interface HexActionResult {
  state: HexSettlersState;
  error?: string;
}

export interface HexResourceGain {
  playerId: number;
  resource: HexResource;
  amount: number;
}

const EMPTY_RESOURCES = (): HexResources => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, gold: 0 });
const PLAYER_COLORS = ["#d78372", "#78aaa0", "#d2b164", "#a38bbb"];
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const MAP_RADII: Record<HexMapSize, number> = { small: 2, medium: 3, large: 4, extraLarge: 5 };
const TERRAIN_WEIGHTS = { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3 } satisfies Record<typeof HEX_BUILD_RESOURCES[number], number>;
const NUMBER_WEIGHTS: Record<number, number> = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 };
const DEVELOPMENT_CARDS: HexDevelopmentType[] = [
  ...Array<HexDevelopmentType>(14).fill("knight"),
  ...Array<HexDevelopmentType>(5).fill("victoryPoint"),
  ...Array<HexDevelopmentType>(2).fill("roadBuilding"),
  ...Array<HexDevelopmentType>(2).fill("yearOfPlenty"),
  ...Array<HexDevelopmentType>(2).fill("monopoly"),
];
function allocateWeightedCounts(total: number, weights: Record<string, number>): Record<string, number> {
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const allocation = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, Math.floor(total * weight / weightTotal)]));
  let remainder = total - Object.values(allocation).reduce((sum, count) => sum + count, 0);
  const order = Object.entries(weights)
    .map(([key, weight]) => ({ key, remainder: total * weight / weightTotal - allocation[key] }))
    .sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remainder; index += 1) allocation[order[index].key] += 1;
  return allocation;
}

function expandCounts(counts: Record<string, number>): string[] {
  return Object.entries(counts).flatMap(([value, count]) => Array<string>(count).fill(value));
}

function randomStep(state: number): { state: number; value: number } {
  let next = state | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return { state: next || 0x6d2b79f5, value: (next >>> 0) / 0x1_0000_0000 };
}

function shuffle<T>(values: readonly T[], seed: number): { values: T[]; seed: number } {
  const result = [...values];
  let state = seed >>> 0 || 0x6d2b79f5;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = randomStep(state);
    state = random.state;
    const target = Math.floor(random.value * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return { values: result, seed: state };
}

function coordinateKey(x: number, y: number): string {
  return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
}

function tileNeighbours(tiles: readonly Pick<HexTile, "q" | "r">[]): number[][] {
  const indexByCoordinate = new Map(tiles.map((tile, index) => [`${tile.q},${tile.r}`, index]));
  const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;
  return tiles.map(({ q, r }) => directions.flatMap(([dq, dr]) => {
    const index = indexByCoordinate.get(`${q + dq},${r + dr}`);
    return index === undefined ? [] : [index];
  }));
}

function createBoard(seed: number, mapSize: HexMapSize, layout: HexMapLayout): HexBoard {
  const radius = MAP_RADII[mapSize];
  const coordinates = Array.from({ length: (radius * 2 + 1) ** 2 }, (_, index) => ({
    q: Math.floor(index / (radius * 2 + 1)) - radius,
    r: index % (radius * 2 + 1) - radius,
  })).filter(({ q, r }) =>
    Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= radius &&
    (layout !== "atoll" || q !== 0 || r !== 0))
    .sort((a, b) => a.q - b.q || a.r - b.r);
  const tileCount = coordinates.length;
  const goldCount = Math.max(1, Math.round(tileCount / 26));
  const desertCount = Math.max(1, Math.floor(tileCount / 50));
  const resourceCounts = allocateWeightedCounts(tileCount - goldCount - desertCount, TERRAIN_WEIGHTS);
  const terrainBag = [
    ...expandCounts(resourceCounts),
    ...Array<string>(goldCount).fill("gold"),
    ...Array<string>(desertCount).fill("desert"),
  ] as HexTerrain[];
  const shuffledTerrain = shuffle(terrainBag, seed);
  const rawTiles = coordinates.map((coordinate, index) => ({
    id: `${coordinate.q},${coordinate.r}`,
    ...coordinate,
    x: coordinate.q * 1.5,
    y: (coordinate.r + coordinate.q / 2) * Math.sqrt(3),
    terrain: shuffledTerrain.values[index],
    number: null as number | null,
    nodeIds: [] as string[],
    edgeIds: [] as string[],
  }));
  const landIndices = rawTiles.flatMap((tile, index) => tile.terrain === "desert" ? [] : [index]);
  const neighbours = tileNeighbours(rawTiles);
  const numberBag = expandCounts(allocateWeightedCounts(landIndices.length, NUMBER_WEIGHTS)).map(Number);
  const hotNumbers = numberBag.filter((number) => number === 6 || number === 8);
  const coolNumbers = numberBag.filter((number) => number !== 6 && number !== 8);
  let numberSeed = shuffledTerrain.seed;
  let assigned = new Map<number, number>();
  let bestBalance = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const candidate = shuffle(landIndices, numberSeed);
    numberSeed = candidate.seed;
    const hotTileIndices = new Set<number>();
    for (const tileIndex of candidate.values) {
      if (neighbours[tileIndex].some((neighbor) => hotTileIndices.has(neighbor))) continue;
      hotTileIndices.add(tileIndex);
      if (hotTileIndices.size === hotNumbers.length) break;
    }
    if (hotTileIndices.size !== hotNumbers.length) continue;

    const shuffledHot = shuffle(hotNumbers, numberSeed);
    numberSeed = shuffledHot.seed;
    const shuffledCool = shuffle(coolNumbers, numberSeed);
    numberSeed = shuffledCool.seed;
    const candidateNumbers = new Map<number, number>();
    [...hotTileIndices].forEach((tileIndex, index) => candidateNumbers.set(tileIndex, shuffledHot.values[index]));
    landIndices.filter((tileIndex) => !candidateNumbers.has(tileIndex))
      .forEach((tileIndex, index) => candidateNumbers.set(tileIndex, shuffledCool.values[index]));

    const terrainPips = new Map<HexResource, { total: number; count: number }>();
    for (const tileIndex of landIndices) {
      const terrain = rawTiles[tileIndex].terrain as HexResource;
      const number = candidateNumbers.get(tileIndex)!;
      const total = terrainPips.get(terrain) ?? { total: 0, count: 0 };
      total.total += 6 - Math.abs(7 - number);
      total.count += 1;
      terrainPips.set(terrain, total);
    }
    const expectedPips = numberBag.reduce((sum, number) => sum + 6 - Math.abs(7 - number), 0) / numberBag.length;
    const balance = [...terrainPips.values()].reduce((sum, terrain) =>
      sum + (terrain.total / terrain.count - expectedPips) ** 2, 0);
    if (balance < bestBalance) {
      assigned = candidateNumbers;
      bestBalance = balance;
    }
  }
  if (assigned.size !== landIndices.length) throw new Error(`Could not create a balanced ${mapSize} ${layout} board.`);
  for (const [tileIndex, number] of assigned) rawTiles[tileIndex].number = number;

  const nodeByPoint = new Map<string, HexNode>();
  const edgeByKey = new Map<string, HexEdge>();
  for (const tile of rawTiles) {
    const vertices = Array.from({ length: 6 }, (_, index) => {
      const angle = index * Math.PI / 3;
      const x = tile.x + Math.cos(angle) * 1;
      const y = tile.y + Math.sin(angle) * 1;
      const key = coordinateKey(x, y);
      let node = nodeByPoint.get(key);
      if (!node) {
        node = { id: key, x, y, tileIds: [], edgeIds: [] };
        nodeByPoint.set(key, node);
      }
      node.tileIds.push(tile.id);
      return node;
    });
    tile.nodeIds = vertices.map((node) => node.id);
    for (let index = 0; index < vertices.length; index += 1) {
      const first = vertices[index];
      const second = vertices[(index + 1) % vertices.length];
      const id = [first.id, second.id].sort().join("|");
      let edge = edgeByKey.get(id);
      if (!edge) {
        edge = { id, nodeIds: [first.id, second.id], tileIds: [] };
        edgeByKey.set(id, edge);
        first.edgeIds.push(id);
        second.edgeIds.push(id);
      }
      edge.tileIds.push(tile.id);
      tile.edgeIds.push(id);
    }
  }

  const tiles = rawTiles.map((tile) => ({ ...tile }));
  const nodes = [...nodeByPoint.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const edges = [...edgeByKey.values()];
  const centerX = (Math.min(...nodes.map((node) => node.x)) + Math.max(...nodes.map((node) => node.x))) / 2;
  const centerY = (Math.min(...nodes.map((node) => node.y)) + Math.max(...nodes.map((node) => node.y))) / 2;
  return {
    seed,
    mapSize,
    layout,
    tiles: tiles.map((tile) => ({ ...tile, x: tile.x - centerX, y: tile.y - centerY })),
    nodes: nodes.map((node) => ({ ...node, x: node.x - centerX, y: node.y - centerY })),
    edges,
  };
}

function addLog(state: HexSettlersState, text: string): HexSettlersState {
  return {
    ...state,
    nextLogId: state.nextLogId + 1,
    log: [...state.log, { id: state.nextLogId, text }].slice(-60),
  };
}

function playerHasNode(player: HexPlayer, nodeId: string): boolean {
  return player.settlements.includes(nodeId) || player.cities.includes(nodeId);
}

function nodeOwner(state: HexSettlersState, nodeId: string): number | undefined {
  return state.players.find((player) => playerHasNode(player, nodeId))?.id;
}

function edgeOwner(state: HexSettlersState, edgeId: string): number | undefined {
  return state.players.find((player) => player.roads.includes(edgeId))?.id;
}

export type HexGoldPlan = Partial<Record<typeof HEX_BUILD_RESOURCES[number], number>>;

export function canPayHexCost(player: HexPlayer, cost: Partial<HexResources>, goldPlan: HexGoldPlan = {}): boolean {
  let goldRequired = 0;
  for (const resource of HEX_BUILD_RESOURCES) {
    const substitution = goldPlan[resource] ?? 0;
    const required = cost[resource] ?? 0;
    if (!Number.isInteger(substitution) || substitution < 0 || substitution > required ||
        player.resources[resource] < required - substitution) return false;
    goldRequired += substitution;
  }
  return goldRequired <= player.resources.gold;
}

export function getAutomaticHexGoldPlan(player: HexPlayer, cost: Partial<HexResources>): HexGoldPlan | null {
  const plan: HexGoldPlan = {};
  for (const resource of HEX_BUILD_RESOURCES) {
    const shortage = Math.max(0, (cost[resource] ?? 0) - player.resources[resource]);
    if (shortage) plan[resource] = shortage;
  }
  const goldRequired = Object.values(plan).reduce((sum, amount) => sum + amount, 0);
  return goldRequired <= player.resources.gold ? plan : null;
}

function chargeResources(player: HexPlayer, cost: Partial<HexResources>, goldPlan: HexGoldPlan = {}): HexPlayer {
  const resources = { ...player.resources };
  let goldSpent = 0;
  for (const resource of HEX_BUILD_RESOURCES) {
    const substitution = goldPlan[resource] ?? 0;
    resources[resource] -= (cost[resource] ?? 0) - substitution;
    goldSpent += substitution;
  }
  resources.gold -= goldSpent;
  return { ...player, resources };
}

export const HEX_BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  development: { sheep: 1, wheat: 1, ore: 1 },
} satisfies Record<string, Partial<HexResources>>;

export function getHexVictoryPoints(player: HexPlayer): number {
  return player.settlements.length + player.cities.length * 2 +
    player.developmentCards.filter((card) => card.type === "victoryPoint").length;
}

export function getLegalSettlementNodes(state: HexSettlersState, playerIndex = state.activePlayer): string[] {
  const player = state.players[playerIndex];
  if (!player) return [];
  return state.board.nodes.flatMap((node) => {
    if (nodeOwner(state, node.id) !== undefined) return [];
    if (node.edgeIds.some((edgeId) => {
      const edge = state.board.edges.find((candidate) => candidate.id === edgeId);
      const otherNode = edge?.nodeIds.find((candidate) => candidate !== node.id);
      return otherNode !== undefined && nodeOwner(state, otherNode) !== undefined;
    })) return [];
    const connected = node.edgeIds.some((edgeId) => player.roads.includes(edgeId));
    return connected ? [node.id] : [];
  });
}

export function getLegalRoadEdges(state: HexSettlersState, playerIndex = state.activePlayer): string[] {
  const player = state.players[playerIndex];
  if (!player || player.roads.length >= 15) return [];
  return state.board.edges.flatMap((edge) => {
    if (edgeOwner(state, edge.id) !== undefined) return [];
    const connected = edge.nodeIds.some((nodeId) => {
      const owner = nodeOwner(state, nodeId);
      if (owner !== undefined) return owner === playerIndex;
      const node = state.board.nodes.find((candidate) => candidate.id === nodeId);
      return node?.edgeIds.some((candidateEdge) => player.roads.includes(candidateEdge)) ?? false;
    });
    return connected ? [edge.id] : [];
  });
}

export function getLegalCityNodes(state: HexSettlersState, playerIndex = state.activePlayer): string[] {
  const player = state.players[playerIndex];
  return player ? [...player.settlements] : [];
}

export function createHexSettlers(
  mode: HexGameMode,
  playerCount: 2 | 3 | 4,
  seed = Date.now(),
  mapSize: HexMapSize = "small",
  layout: HexMapLayout = "island",
): HexSettlersState {
  const safeSeed = seed >>> 0 || 0x6d2b79f5;
  const shuffledDeck = shuffle(DEVELOPMENT_CARDS, safeSeed ^ 0x9e3779b9);
  const players = Array.from({ length: playerCount }, (_, id): HexPlayer => ({
    id,
    name: mode === "computer" ? (id === 0 ? "You" : `AI ${id}`) : `Player ${id + 1}`,
    color: PLAYER_COLORS[id],
    kind: mode === "computer" && id > 0 ? "computer" : "human",
    resources: EMPTY_RESOURCES(),
    roads: [],
    settlements: [],
    cities: [],
    developmentCards: [],
  }));
  return {
    version: 1,
    seed: safeSeed,
    rngState: shuffledDeck.seed,
    mode,
    board: createBoard(safeSeed, mapSize, layout),
    players,
    activePlayer: 0,
    phase: "setup-settlement",
    setupOrder: [...Array.from({ length: playerCount }, (_, index) => index), ...Array.from({ length: playerCount }, (_, index) => playerCount - 1 - index)],
    setupIndex: 0,
    pendingSetupNode: null,
    dice: null,
    developmentDeck: shuffledDeck.values,
    playedDevelopmentCard: false,
    winner: null,
    turn: 0,
    nextLogId: 2,
    log: [{ id: 1, text: "Choose an intersection for your first settlement." }],
  };
}

export function getSetupSettlementNodes(state: HexSettlersState): string[] {
  if (state.phase !== "setup-settlement") return [];
  return state.board.nodes.flatMap((node) => {
    if (nodeOwner(state, node.id) !== undefined) return [];
    const blocked = node.edgeIds.some((edgeId) => {
      const edge = state.board.edges.find((candidate) => candidate.id === edgeId);
      const otherNode = edge?.nodeIds.find((candidate) => candidate !== node.id);
      return otherNode !== undefined && nodeOwner(state, otherNode) !== undefined;
    });
    return blocked ? [] : [node.id];
  });
}

export function getSetupRoadEdges(state: HexSettlersState): string[] {
  if (state.phase !== "setup-road" || !state.pendingSetupNode) return [];
  const player = state.players[state.activePlayer];
  const node = state.board.nodes.find((candidate) => candidate.id === state.pendingSetupNode);
  if (!player || !node) return [];
  return node.edgeIds.filter((edgeId) => edgeOwner(state, edgeId) === undefined);
}

function finishSetupTurn(state: HexSettlersState): HexSettlersState {
  const nextIndex = state.setupIndex + 1;
  if (nextIndex >= state.setupOrder.length) {
    return addLog({
      ...state,
      phase: "roll",
      setupIndex: nextIndex,
      pendingSetupNode: null,
      turn: 1,
    }, "Setup complete. Roll the dice to begin.");
  }
  const activePlayer = state.setupOrder[nextIndex];
  return addLog({
    ...state,
    activePlayer,
    phase: "setup-settlement",
    setupIndex: nextIndex,
    pendingSetupNode: null,
  }, `${state.players[activePlayer].name}: choose a settlement location.`);
}

export function placeSetupSettlement(state: HexSettlersState, nodeId: string): HexActionResult {
  if (state.phase !== "setup-settlement" || !getSetupSettlementNodes(state).includes(nodeId)) return { state, error: "That intersection is not available." };
  const playerIndex = state.activePlayer;
  const players = state.players.map((player, index) => index === playerIndex
    ? { ...player, settlements: [...player.settlements, nodeId] }
    : player);
  const next = {
    ...state,
    players,
    phase: "setup-road" as const,
    pendingSetupNode: nodeId,
  };
  return { state: addLog(next, `${state.players[playerIndex].name} placed a settlement.`) };
}

export function placeSetupRoad(state: HexSettlersState, edgeId: string): HexActionResult {
  if (state.phase !== "setup-road" || !getSetupRoadEdges(state).includes(edgeId)) return { state, error: "That road cannot be placed there." };
  const playerIndex = state.activePlayer;
  const nodeId = state.pendingSetupNode;
  if (!nodeId) return { state, error: "The setup settlement is missing." };
  let player = { ...state.players[playerIndex], roads: [...state.players[playerIndex].roads, edgeId] };
  if (state.setupIndex >= state.players.length) {
    const node = state.board.nodes.find((candidate) => candidate.id === nodeId);
    for (const tileId of node?.tileIds ?? []) {
      const tile = state.board.tiles.find((candidate) => candidate.id === tileId);
      if (tile && HEX_RESOURCES.includes(tile.terrain as HexResource)) player.resources[tile.terrain as HexResource] += 1;
    }
  }
  const players = state.players.map((candidate, index) => index === playerIndex ? player : candidate);
  return { state: finishSetupTurn(addLog({ ...state, players }, `${state.players[playerIndex].name} built a road.`)) };
}

function distributeResources(state: HexSettlersState, roll: number): HexSettlersState {
  const produced = new Map<number, HexResources>();
  for (const player of state.players) produced.set(player.id, EMPTY_RESOURCES());
  for (const tile of state.board.tiles) {
    if (tile.number !== roll || tile.terrain === "desert") continue;
    for (const nodeId of tile.nodeIds) {
      const owner = state.players.find((player) => player.settlements.includes(nodeId) || player.cities.includes(nodeId));
      if (!owner) continue;
      const amount = owner.cities.includes(nodeId) ? 2 : 1;
      const output = produced.get(owner.id);
      if (output) output[tile.terrain] += amount;
    }
  }
  const resourcesByPlayer = new Map(state.players.map((player) => [player.id, { ...player.resources }]));
  for (const resource of HEX_RESOURCES) {
    const total = [...produced.values()].reduce((sum, output) => sum + output[resource], 0);
    if (total === 0) continue;
    const available = 19 - state.players.reduce((sum, player) => sum + player.resources[resource], 0);
    if (available < total) {
      for (const output of produced.values()) output[resource] = 0;
      continue;
    }
    for (const [playerId, output] of produced) resourcesByPlayer.get(playerId)![resource] += output[resource];
  }
  const players = state.players.map((player) => ({ ...player, resources: resourcesByPlayer.get(player.id)! }));
  const recipients = players.flatMap((player) => HEX_RESOURCES.some((resource) => player.resources[resource] > state.players[player.id].resources[resource]) ? [player.name] : []);
  const message = recipients.length ? `${recipients.join(", ")} collected resources.` : "No resources were produced.";
  return addLog({ ...state, players }, message);
}

export function rollHexDice(state: HexSettlersState, first: number, second: number): HexActionResult {
  if (state.phase !== "roll" || !Number.isInteger(first) || first < 1 || first > 6 || !Number.isInteger(second) || second < 1 || second > 6) {
    return { state, error: "The dice cannot be rolled now." };
  }
  const dice: [number, number] = [first, second];
  let next: HexSettlersState = { ...state, phase: "action", dice };
  next = addLog(next, `${state.players[state.activePlayer].name} rolled ${first} + ${second} = ${first + second}.`);
  if (first + second !== 7) next = distributeResources(next, first + second);
  return { state: next };
}

export function rollHexDiceRandomly(state: HexSettlersState): HexSettlersState {
  const first = randomStep(state.rngState);
  const second = randomStep(first.state);
  const firstDie = Math.floor(first.value * 6) + 1;
  const secondDie = Math.floor(second.value * 6) + 1;
  const result = rollHexDice({ ...state, rngState: second.state }, firstDie, secondDie);
  return result.state;
}

function checkWin(state: HexSettlersState, playerIndex: number): HexSettlersState {
  if (getHexVictoryPoints(state.players[playerIndex]) < 10) return state;
  const won = addLog({ ...state, phase: "won", winner: playerIndex }, `${state.players[playerIndex].name} reached 10 victory points and won!`);
  return won;
}

export function buildHexRoad(state: HexSettlersState, edgeId: string, free = false, goldPlan: HexGoldPlan = {}): HexActionResult {
  const player = state.players[state.activePlayer];
  if (state.phase !== "action" || !getLegalRoadEdges(state).includes(edgeId)) return { state, error: "That road placement is not legal." };
  if (!free && !canPayHexCost(player, HEX_BUILD_COSTS.road, goldPlan)) return { state, error: "You need one wood and one brick or explicitly selected gold to build a road." };
  const nextPlayer = free ? { ...player, roads: [...player.roads, edgeId] } : chargeResources(player, HEX_BUILD_COSTS.road, goldPlan);
  nextPlayer.roads = [...nextPlayer.roads, ...(free ? [] : [edgeId])];
  const players = state.players.map((candidate, index) => index === state.activePlayer ? nextPlayer : candidate);
  return { state: addLog({ ...state, players }, `${player.name} built a road${free ? " for free" : ""}.`) };
}

export function buildHexSettlement(state: HexSettlersState, nodeId: string, goldPlan: HexGoldPlan = {}): HexActionResult {
  const player = state.players[state.activePlayer];
  if (state.phase !== "action" || !getLegalSettlementNodes(state).includes(nodeId)) return { state, error: "That settlement placement is not legal." };
  if (player.settlements.length >= 5) return { state, error: "You have no settlements left to build." };
  if (!canPayHexCost(player, HEX_BUILD_COSTS.settlement, goldPlan)) return { state, error: "A settlement costs one of each resource except ore, with explicitly selected gold substitutions." };
  const nextPlayer = chargeResources(player, HEX_BUILD_COSTS.settlement, goldPlan);
  nextPlayer.settlements = [...nextPlayer.settlements, nodeId];
  const next = addLog({ ...state, players: state.players.map((candidate, index) => index === state.activePlayer ? nextPlayer : candidate) }, `${player.name} built a settlement.`);
  return { state: checkWin(next, state.activePlayer) };
}

export function buildHexCity(state: HexSettlersState, nodeId: string, goldPlan: HexGoldPlan = {}): HexActionResult {
  const player = state.players[state.activePlayer];
  if (state.phase !== "action" || !getLegalCityNodes(state).includes(nodeId)) return { state, error: "Only one of your settlements can become a city." };
  if (player.cities.length >= 4) return { state, error: "You have no cities left to build." };
  if (!canPayHexCost(player, HEX_BUILD_COSTS.city, goldPlan)) return { state, error: "A city costs two wheat and three ore, with explicitly selected gold substitutions." };
  const nextPlayer = chargeResources(player, HEX_BUILD_COSTS.city, goldPlan);
  nextPlayer.settlements = nextPlayer.settlements.filter((candidate) => candidate !== nodeId);
  nextPlayer.cities = [...nextPlayer.cities, nodeId];
  const next = addLog({ ...state, players: state.players.map((candidate, index) => index === state.activePlayer ? nextPlayer : candidate) }, `${player.name} upgraded a settlement to a city.`);
  return { state: checkWin(next, state.activePlayer) };
}

export function tradeHexWithBank(state: HexSettlersState, give: HexResource, receive: HexResource, goldToSpend = 0): HexActionResult {
  const player = state.players[state.activePlayer];
  const goldOnlyTrade = give === "gold";
  const resourceCost = goldOnlyTrade ? 0 : 4 - goldToSpend;
  const goldCost = goldOnlyTrade ? 4 : goldToSpend;
  if (state.phase !== "action" || give === receive || !Number.isInteger(goldToSpend) || goldToSpend < 0 || goldToSpend > (goldOnlyTrade ? 0 : 4) ||
      player.resources[give] < resourceCost || player.resources.gold < goldCost || player.resources[receive] >= 19) {
    return { state, error: "Bank trades need four explicitly selected resources or gold and room for the received resource." };
  }
  const resources = { ...player.resources, [give]: player.resources[give] - (goldOnlyTrade ? 4 : resourceCost), [receive]: player.resources[receive] + 1 };
  if (!goldOnlyTrade) resources.gold -= goldToSpend;
  const players = state.players.map((candidate, index) => index === state.activePlayer ? { ...candidate, resources } : candidate);
  return { state: addLog({ ...state, players }, `${player.name} traded ${resourceCost} ${give} and ${goldCost} gold for 1 ${receive}.`) };
}

export function buyHexDevelopmentCard(state: HexSettlersState, goldPlan: HexGoldPlan = {}): HexActionResult {
  const player = state.players[state.activePlayer];
  if (state.phase !== "action" || state.developmentDeck.length === 0) return { state, error: "No development cards are available." };
  if (!canPayHexCost(player, HEX_BUILD_COSTS.development, goldPlan)) return { state, error: "A development card costs one sheep, one wheat, and one ore, with explicitly selected gold substitutions." };
  const [type, ...developmentDeck] = state.developmentDeck;
  const card: HexDevelopmentCard = { id: `${state.turn}-${player.id}-${player.developmentCards.length}-${state.nextLogId}`, type, boughtTurn: state.turn };
  const nextPlayer = chargeResources(player, HEX_BUILD_COSTS.development, goldPlan);
  nextPlayer.developmentCards = [...nextPlayer.developmentCards, card];
  const next = addLog({
    ...state,
    developmentDeck,
    players: state.players.map((candidate, index) => index === state.activePlayer ? nextPlayer : candidate),
  }, `${player.name} bought a development card.`);
  return { state: checkWin(next, state.activePlayer) };
}

export function playHexDevelopmentCard(
  state: HexSettlersState,
  cardId: string,
  choice?: HexResource,
  targetPlayer?: number,
): HexActionResult {
  const player = state.players[state.activePlayer];
  const card = player.developmentCards.find((candidate) => candidate.id === cardId);
  if (state.phase !== "action" || !card || card.type === "victoryPoint" || card.boughtTurn === state.turn || state.playedDevelopmentCard) {
    return { state, error: "That development card cannot be played now." };
  }
  let players = state.players.map((candidate) => ({ ...candidate, resources: { ...candidate.resources }, roads: [...candidate.roads], developmentCards: [...candidate.developmentCards] }));
  const active = players[state.activePlayer];
  const target = targetPlayer === undefined ? undefined : players[targetPlayer];
  if ((card.type === "yearOfPlenty" || card.type === "monopoly") && (!choice || !HEX_RESOURCES.includes(choice))) return { state, error: "Choose a resource for that card." };
  if (card.type === "knight" && (!target || target.id === state.activePlayer || !HEX_RESOURCES.some((resource) => target.resources[resource] > 0))) {
    return { state, error: "Choose an opponent with at least one resource." };
  }
  if (card.type === "roadBuilding" && getLegalRoadEdges(state).length === 0) return { state, error: "No legal road placement is available." };

  if (card.type === "knight" && target) {
    const held = HEX_RESOURCES.flatMap((resource) => Array.from({ length: target.resources[resource] }, () => resource));
    const random = randomStep(state.rngState);
    const stolen = held[Math.floor(random.value * held.length)];
    target.resources[stolen] -= 1;
    active.resources[stolen] += 1;
    state = { ...state, rngState: random.state };
  } else if (card.type === "yearOfPlenty" && choice) {
    active.resources[choice] = Math.min(19, active.resources[choice] + 2);
  } else if (card.type === "monopoly" && choice) {
    const taken = players.reduce((sum, candidate) => sum + (candidate.id === active.id ? 0 : candidate.resources[choice]), 0);
    players = players.map((candidate) => {
      if (candidate.id === active.id) return { ...candidate, resources: { ...candidate.resources, [choice]: Math.min(19, candidate.resources[choice] + taken) } };
      return { ...candidate, resources: { ...candidate.resources, [choice]: 0 } };
    });
  }
  active.developmentCards = active.developmentCards.filter((candidate) => candidate.id !== cardId);
  let next: HexSettlersState = {
    ...state,
    players,
    playedDevelopmentCard: true,
  };
  if (card.type === "roadBuilding") {
    const selected = getLegalRoadEdges(next).slice(0, 2);
    let roadState = next;
    for (const edgeId of selected) {
      const result = buildHexRoad(roadState, edgeId, true);
      roadState = result.state;
    }
    next = roadState;
  }
  next = addLog(next, `${player.name} played a ${card.type} development card.`);
  return { state: checkWin(next, state.activePlayer) };
}

export function endHexTurn(state: HexSettlersState): HexActionResult {
  if (state.phase !== "action") return { state, error: "Finish the current action before ending the turn." };
  const activePlayer = (state.activePlayer + 1) % state.players.length;
  const next = addLog({
    ...state,
    activePlayer,
    phase: "roll",
    dice: null,
    turn: state.turn + 1,
    playedDevelopmentCard: false,
  }, `${state.players[activePlayer].name}'s turn.`);
  return { state: next };
}

function scoreSetupNode(state: HexSettlersState, nodeId: string): number {
  const node = state.board.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return -1;
  return node.tileIds.reduce((score, tileId) => {
    const tile = state.board.tiles.find((candidate) => candidate.id === tileId);
    if (!tile || tile.terrain === "desert" || tile.number === null) return score;
    const probability = tile.number === 7 ? 0 : 6 - Math.abs(7 - tile.number);
    return score + probability + (tile.terrain === "ore" || tile.terrain === "wheat" || tile.terrain === "gold" ? 0.3 : 0);
  }, 0);
}

function planAiBuild(state: HexSettlersState): HexSettlersState {
  let next = state;
  const player = next.players[next.activePlayer];
  const settlementGold = getAutomaticHexGoldPlan(player, HEX_BUILD_COSTS.settlement);
  if (player.settlements.length < 5 && settlementGold) {
    const target = getLegalSettlementNodes(next).sort((a, b) => scoreSetupNode(next, b) - scoreSetupNode(next, a))[0];
    if (target) return buildHexSettlement(next, target, settlementGold).state;
  }
  const cityGold = getAutomaticHexGoldPlan(player, HEX_BUILD_COSTS.city);
  if (player.settlements.length > 0 && player.cities.length < 4 && cityGold) {
    const target = [...player.settlements].sort((a, b) => scoreSetupNode(next, b) - scoreSetupNode(next, a))[0];
    if (target) return buildHexCity(next, target, cityGold).state;
  }
  const roadGold = getAutomaticHexGoldPlan(player, HEX_BUILD_COSTS.road);
  if (player.roads.length < 15 && roadGold) {
    const candidates = getLegalRoadEdges(next);
    const target = candidates.find((edgeId) => {
      const edge = next.board.edges.find((candidate) => candidate.id === edgeId);
      return edge?.nodeIds.some((nodeId) => !playerHasNode(player, nodeId) && getLegalSettlementNodes(next).some((candidate) => {
        const node = next.board.nodes.find((entry) => entry.id === candidate);
        return node?.edgeIds.includes(edgeId);
      }));
    }) ?? candidates[0];
    if (target) return buildHexRoad(next, target, false, roadGold).state;
  }
  const developmentGold = getAutomaticHexGoldPlan(player, HEX_BUILD_COSTS.development);
  if (next.developmentDeck.length > 0 && developmentGold) return buyHexDevelopmentCard(next, developmentGold).state;
  return next;
}

function aiTradeTowardBuild(state: HexSettlersState): HexSettlersState {
  const player = state.players[state.activePlayer];
  const costs: Partial<HexResources>[] = [HEX_BUILD_COSTS.settlement, HEX_BUILD_COSTS.city, HEX_BUILD_COSTS.road, HEX_BUILD_COSTS.development];
  const targetCost = costs.find((cost) => getAutomaticHexGoldPlan(player, cost) === null);
  if (!targetCost) return state;
  const needed = HEX_BUILD_RESOURCES.find((resource) => (targetCost[resource] ?? 0) > player.resources[resource]);
  if (!needed) return state;
  for (const tradeResource of HEX_BUILD_RESOURCES.filter((resource) => resource !== needed && player.resources[resource] > 0)) {
    for (let goldToSpend = 0; goldToSpend <= 4; goldToSpend += 1) {
      const result = tradeHexWithBank(state, tradeResource, needed, goldToSpend);
      if (!result.error) return result.state;
    }
  }
  return state;
}

export function runHexSettlersAiTurn(state: HexSettlersState): HexSettlersState {
  if (state.players[state.activePlayer]?.kind !== "computer" || state.phase === "won") return state;
  let next = state;
  if (next.phase === "setup-settlement") {
    const nodeId = getSetupSettlementNodes(next).sort((a, b) => scoreSetupNode(next, b) - scoreSetupNode(next, a))[0];
    if (!nodeId) return next;
    next = placeSetupSettlement(next, nodeId).state;
  }
  if (next.phase === "setup-road") {
    const edgeId = getSetupRoadEdges(next)[0];
    if (!edgeId) return next;
    next = placeSetupRoad(next, edgeId).state;
  }
  if (next.phase === "roll") next = rollHexDiceRandomly(next);
  if (next.phase !== "action") return next;
  next = aiTradeTowardBuild(next);
  next = planAiBuild(next);
  return next.phase === "won" ? next : endHexTurn(next).state;
}

export function validateHexSettlersState(value: unknown): value is HexSettlersState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<HexSettlersState>;
  if (state.version !== 1 || !state.board || !Array.isArray(state.players) || !Array.isArray(state.board.tiles) ||
      !Array.isArray(state.board.nodes) || !Array.isArray(state.board.edges) || !Array.isArray(state.developmentDeck) ||
      !Array.isArray(state.setupOrder) || !Array.isArray(state.log)) return false;
  if (state.players.length < 2 || state.players.length > 4 || !Number.isInteger(state.activePlayer) ||
      state.activePlayer! < 0 || state.activePlayer! >= state.players.length || !Number.isInteger(state.turn) || state.turn! < 0) return false;
  if (!["computer", "local"].includes(state.mode ?? "") || !["setup-settlement", "setup-road", "roll", "action", "won"].includes(state.phase ?? "")) return false;
  const tileIds = new Set(state.board.tiles.map((tile) => tile.id));
  const nodeIds = new Set(state.board.nodes.map((node) => node.id));
  const edgeIds = new Set(state.board.edges.map((edge) => edge.id));
  const mapSize = state.board.mapSize;
  const layout = state.board.layout;
  if (!mapSize || !(mapSize in MAP_RADII) || !layout || !["island", "atoll"].includes(layout)) return false;
  const radius = MAP_RADII[mapSize];
  const sideLength = radius + 1;
  const expectedTileCount = radius * 3 * (radius + 1) + 1 - (layout === "atoll" ? 1 : 0);
  if (tileIds.size !== expectedTileCount || nodeIds.size !== 6 * sideLength ** 2 || edgeIds.size !== 9 * sideLength ** 2 - 3 * sideLength) return false;
  for (const tile of state.board.tiles) {
    if (tile.nodeIds.length !== 6 || tile.edgeIds.length !== 6 || !tile.nodeIds.every((id) => nodeIds.has(id)) ||
        !tile.edgeIds.every((id) => edgeIds.has(id)) || ![...HEX_RESOURCES, "desert"].includes(tile.terrain) ||
        (tile.terrain === "desert" ? tile.number !== null : !NUMBER_TOKENS.includes(tile.number ?? -1))) return false;
  }
  for (const edge of state.board.edges) if (edge.nodeIds.length !== 2 || !edge.nodeIds.every((id) => nodeIds.has(id))) return false;
  for (const player of state.players) {
    if (!player || !player.resources || HEX_RESOURCES.some((resource) => !Number.isInteger(player.resources[resource]) || player.resources[resource] < 0 || player.resources[resource] > 19)) return false;
    if (player.roads.length > 15 || player.settlements.length > 5 || player.cities.length > 4 ||
        !player.roads.every((id) => edgeIds.has(id)) || ![...player.settlements, ...player.cities].every((id) => nodeIds.has(id))) return false;
    if (player.developmentCards.some((card) => !DEVELOPMENT_CARDS.includes(card.type) || !Number.isInteger(card.boughtTurn) || card.boughtTurn < 0)) return false;
  }
  const ownedEdges = state.players.flatMap((player) => player.roads);
  const ownedNodes = state.players.flatMap((player) => [...player.settlements, ...player.cities]);
  return new Set(ownedEdges).size === ownedEdges.length && new Set(ownedNodes).size === ownedNodes.length &&
    state.setupOrder.length === state.players.length * 2 && state.setupOrder.every((index) => Number.isInteger(index) && index >= 0 && index < state.players!.length);
}

export function normalizeHexSettlersSave(value: unknown): HexSettlersState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<HexSettlersState>;
  if (!state.board || !Array.isArray(state.players)) return null;
  const players = state.players.map((player) => {
    if (!player || !player.resources || typeof player.resources !== "object") return player;
    const resources = player.resources as Partial<HexResources>;
    if (HEX_BUILD_RESOURCES.some((resource) => !Number.isInteger(resources[resource]) || (resources[resource] ?? -1) < 0)) return player;
    return { ...player, resources: { ...EMPTY_RESOURCES(), ...resources, gold: Number.isInteger(resources.gold) && (resources.gold ?? -1) >= 0 ? resources.gold : 0 } };
  });
  const normalized = {
    ...state,
    board: {
      ...state.board,
      mapSize: state.board.mapSize ?? "small",
      layout: state.board.layout ?? "island",
    },
    players,
  } as HexSettlersState;
  return validateHexSettlersState(normalized) ? normalized : null;
}
