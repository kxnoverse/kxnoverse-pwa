import { describe, expect, it } from "vitest";
import {
  HEX_BUILD_COSTS,
  HEX_RESOURCES,
  canPayHexCost,
  buyHexDevelopmentCard,
  buildHexCity,
  buildHexRoad,
  buildHexSettlement,
  createHexSettlers,
  endHexTurn,
  getHexVictoryPoints,
  getAutomaticHexGoldPlan,
  getLegalRoadEdges,
  getLegalSettlementNodes,
  getSetupRoadEdges,
  getSetupSettlementNodes,
  placeSetupRoad,
  placeSetupSettlement,
  rollHexDice,
  runHexSettlersAiTurn,
  tradeHexWithBank,
  normalizeHexSettlersSave,
  validateHexSettlersState,
  type HexSettlersState,
} from "./phase6f/hex-settlers";

function completeSetup(initial: HexSettlersState): HexSettlersState {
  let state = initial;
  while (state.phase === "setup-settlement" || state.phase === "setup-road") {
    if (state.phase === "setup-settlement") {
      const result = placeSetupSettlement(state, getSetupSettlementNodes(state)[0]);
      expect(result.error).toBeUndefined();
      state = result.state;
    } else {
      const result = placeSetupRoad(state, getSetupRoadEdges(state)[0]);
      expect(result.error).toBeUndefined();
      state = result.state;
    }
  }
  return state;
}

describe("Hex Settlers board generation", () => {
  it("generates balanced, reproducible connected maps across every size and layout", () => {
    const sizes = [
      ["small", 19, 54, 72],
      ["medium", 37, 96, 132],
      ["large", 61, 150, 210],
      ["extraLarge", 91, 216, 306],
    ] as const;
    for (const [size, tileCount, nodeCount, edgeCount] of sizes) {
      for (const layout of ["island", "atoll"] as const) {
        for (let seed = 1; seed <= 12; seed += 1) {
          const state = createHexSettlers("local", 4, seed, size, layout);
          const expectedTiles = tileCount - (layout === "atoll" ? 1 : 0);
          expect(state.board.tiles).toHaveLength(expectedTiles);
          expect(state.board.nodes).toHaveLength(nodeCount);
          expect(state.board.edges).toHaveLength(edgeCount);
          expect(state.board.tiles.filter((tile) => tile.terrain === "desert")).toHaveLength(Math.max(1, Math.floor(expectedTiles / 50)));
          expect(state.board.tiles.filter((tile) => tile.terrain === "gold").length).toBeGreaterThanOrEqual(1);
          for (const terrain of ["wood", "brick", "sheep", "wheat", "ore"] as const) {
            expect(state.board.tiles.filter((tile) => tile.terrain === terrain).length).toBeGreaterThan(0);
          }
          expect(state.board.tiles.filter((tile) => tile.number === 6 || tile.number === 8).length).toBeGreaterThan(0);
          const expectedPips = state.board.tiles
            .filter((tile) => tile.number !== null)
            .reduce((sum, tile) => sum + 6 - Math.abs(7 - tile.number!), 0) /
            state.board.tiles.filter((tile) => tile.number !== null).length;
          for (const terrain of ["wood", "brick", "sheep", "wheat", "ore", "gold"] as const) {
            const tiles = state.board.tiles.filter((tile) => tile.terrain === terrain && tile.number !== null);
            if (tiles.length < 2) continue;
            const averagePips = tiles.reduce((sum, tile) => sum + 6 - Math.abs(7 - tile.number!), 0) / tiles.length;
            expect(Math.abs(averagePips - expectedPips)).toBeLessThan(1.8);
          }
          expect(createHexSettlers("local", 4, seed, size, layout).board.tiles).toEqual(state.board.tiles);
          for (const tile of state.board.tiles) {
            if (tile.number !== 6 && tile.number !== 8) continue;
            const [q, r] = tile.id.split(",").map(Number);
            for (const other of state.board.tiles) {
              const [otherQ, otherR] = other.id.split(",").map(Number);
              const adjacent = Math.max(Math.abs(q - otherQ), Math.abs(r - otherR), Math.abs(q + r - otherQ - otherR)) === 1;
              if (adjacent) expect([6, 8]).not.toContain(other.number);
            }
          }
          const visited = new Set([state.board.nodes[0].id]);
          const queue = [state.board.nodes[0].id];
          while (queue.length) {
            const nodeId = queue.shift()!;
            const node = state.board.nodes.find((candidate) => candidate.id === nodeId)!;
            for (const edgeId of node.edgeIds) {
              const edge = state.board.edges.find((candidate) => candidate.id === edgeId)!;
              const other = edge.nodeIds.find((candidate) => candidate !== nodeId)!;
              if (!visited.has(other)) {
                visited.add(other);
                queue.push(other);
              }
            }
          }
          expect(visited.size).toBe(nodeCount);
        }
      }
    }
  });

  it("validates newly created saves and gives second setup settlements their starting resources", () => {
    const state = completeSetup(createHexSettlers("local", 3, 812));
    expect(validateHexSettlersState(state)).toBe(true);
    expect(state.players.every((player) => player.settlements.length === 2 && player.roads.length === 2)).toBe(true);
    expect(state.players.every((player) => HEX_RESOURCES.some((resource) => player.resources[resource] > 0))).toBe(true);
    expect(validateHexSettlersState({ ...state, board: { ...state.board, nodes: [] } })).toBe(false);
  });

  it("migrates older saves by preserving progress and adding default map and gold data", () => {
    const state = completeSetup(createHexSettlers("local", 2, 812));
    const legacy = JSON.parse(JSON.stringify(state)) as HexSettlersState;
    delete (legacy.board as Partial<typeof legacy.board>).mapSize;
    delete (legacy.board as Partial<typeof legacy.board>).layout;
    for (const player of legacy.players) delete (player.resources as Partial<typeof player.resources>).gold;
    const migrated = normalizeHexSettlersSave(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated?.board).toMatchObject({ mapSize: "small", layout: "island" });
    expect(migrated?.players[0].resources.gold).toBe(0);
    expect(migrated?.players[0].settlements).toEqual(state.players[0].settlements);
  });
});

describe("Hex Settlers gameplay", () => {
  it("produces resources from matching number tokens and pays cities twice", () => {
    const setup = completeSetup(createHexSettlers("local", 2, 134));
    const player = setup.players[0];
    const nodeId = player.settlements.find((id) => setup.board.nodes.find((node) => node.id === id)?.tileIds.some((tileId) => {
      const tile = setup.board.tiles.find((candidate) => candidate.id === tileId);
      return tile?.terrain !== "desert" && tile?.number !== null;
    }));
    expect(nodeId).toBeDefined();
    const tile = setup.board.tiles.find((candidate) => candidate.nodeIds.includes(nodeId!));
    expect(tile?.number).not.toBeNull();
    const cityState = {
      ...setup,
      phase: "roll" as const,
      players: setup.players.map((candidate) => candidate.id === 0
        ? { ...candidate, settlements: candidate.settlements.filter((id) => id !== nodeId), cities: [...candidate.cities, nodeId!] }
        : candidate),
    };
    const before = cityState.players[0].resources[tile!.terrain as typeof HEX_RESOURCES[number]];
    const firstDie = Math.min(6, tile!.number! - 1);
    const result = rollHexDice(cityState, firstDie, tile!.number! - firstDie);
    expect(result.error).toBeUndefined();
    expect(result.state.players[0].resources[tile!.terrain as typeof HEX_RESOURCES[number]]).toBeGreaterThanOrEqual(before + 2);
  });

  it("trades 4:1 with the bank and rejects unaffordable or same-resource trades", () => {
    const setup = completeSetup(createHexSettlers("local", 2, 201));
    const state = {
      ...setup,
      phase: "action" as const,
      players: setup.players.map((player, index) => index === 0
        ? { ...player, resources: { ...player.resources, wood: 4, brick: 0, sheep: 0 } }
        : player),
    };
    const traded = tradeHexWithBank(state, "wood", "brick");
    expect(traded.error).toBeUndefined();
    expect(traded.state.players[0].resources).toMatchObject({ wood: 0, brick: 1 });
    expect(tradeHexWithBank(state, "wood", "wood").error).toBeDefined();
    expect(tradeHexWithBank(state, "brick", "ore").error).toBeDefined();
  });

  it("produces gold and only spends it on explicitly selected build and trade conversions", () => {
    const setup = completeSetup(createHexSettlers("local", 2, 701));
    const goldTile = setup.board.tiles.find((tile) => tile.terrain === "gold")!;
    const producer = {
      ...setup,
      phase: "roll" as const,
      players: setup.players.map((player, index) => index === 0
        ? { ...player, settlements: [goldTile.nodeIds[0]], cities: [], resources: { ...player.resources, gold: 0 } }
        : { ...player, settlements: [], cities: [], resources: { ...player.resources, gold: 0 } }),
    };
    const roll = goldTile.number!;
    const first = Math.min(6, roll - 1);
    const production = rollHexDice(producer, first, roll - first);
    expect(production.state.players[0].resources.gold).toBe(1);

    const roadState = {
      ...setup,
      phase: "action" as const,
      players: setup.players.map((player, index) => index === 0
        ? { ...player, resources: { ...player.resources, wood: 1, brick: 0, gold: 1 } }
        : player),
    };
    const edge = getLegalRoadEdges(roadState)[0];
    expect(canPayHexCost(roadState.players[0], HEX_BUILD_COSTS.road)).toBe(false);
    expect(getAutomaticHexGoldPlan(roadState.players[0], HEX_BUILD_COSTS.road)).toEqual({ brick: 1 });
    expect(buildHexRoad(roadState, edge).error).toBeDefined();
    const built = buildHexRoad(roadState, edge, false, { brick: 1 });
    expect(built.error).toBeUndefined();
    expect(built.state.players[0].resources).toMatchObject({ wood: 0, brick: 0, gold: 0 });

    const tradeState = {
      ...roadState,
      players: roadState.players.map((player, index) => index === 0
        ? { ...player, resources: { ...player.resources, wood: 3, gold: 1 } }
        : player),
    };
    expect(tradeHexWithBank(tradeState, "wood", "brick").error).toBeDefined();
    const trade = tradeHexWithBank(tradeState, "wood", "brick", 1);
    expect(trade.error).toBeUndefined();
    expect(trade.state.players[0].resources).toMatchObject({ wood: 0, brick: 1, gold: 0 });
    expect(tradeHexWithBank(tradeState, "wood", "brick", 2).error).toBeDefined();
  });

  it("charges building costs, enforces placement, and awards victory-point cards", () => {
    const setup = completeSetup(createHexSettlers("local", 2, 555));
    const wealthy = {
      ...setup,
      phase: "action" as const,
      players: setup.players.map((player, index) => index === 0
        ? { ...player, resources: { wood: 10, brick: 10, sheep: 10, wheat: 10, ore: 10, gold: 0 } }
        : player),
    };
    const roadId = getLegalRoadEdges(wealthy)[0];
    const road = buildHexRoad(wealthy, roadId);
    expect(road.error).toBeUndefined();
    expect(road.state.players[0].resources).toMatchObject({ wood: 9, brick: 9 });
    let expanded = road.state;
    for (let count = 0; count < 4 && getLegalSettlementNodes(expanded).length === 0; count += 1) {
      expanded = buildHexRoad(expanded, getLegalRoadEdges(expanded)[0]).state;
    }
    const settlementId = getLegalSettlementNodes(expanded)[0];
    const settlement = buildHexSettlement(expanded, settlementId);
    expect(settlement.error).toBeUndefined();
    expect(settlement.state.players[0].resources).toMatchObject({ sheep: 9, wheat: 9 });
    expect(buildHexCity(settlement.state, "not-owned").error).toBeDefined();

    const boardNodes = setup.board.nodes.map((node) => node.id);
    const nearWin = {
      ...wealthy,
      players: wealthy.players.map((player, index) => index === 0
        ? {
          ...player,
          settlements: boardNodes.slice(0, 5),
          cities: boardNodes.slice(5, 7),
          resources: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1, gold: 0 },
        }
        : player),
      developmentDeck: ["victoryPoint" as const],
    };
    expect(getHexVictoryPoints(nearWin.players[0])).toBe(9);
    const win = buyHexDevelopmentCard(nearWin);
    expect(win.state.phase).toBe("won");
    expect(win.state.winner).toBe(0);
    expect(getHexVictoryPoints(win.state.players[0])).toBe(10);
  });

  it("runs legal computer setup and full turns, then returns control to the human", () => {
    let state = createHexSettlers("computer", 2, 907);
    while (state.phase === "setup-settlement" || state.phase === "setup-road") {
      if (state.players[state.activePlayer].kind === "computer") state = runHexSettlersAiTurn(state);
      else if (state.phase === "setup-settlement") state = placeSetupSettlement(state, getSetupSettlementNodes(state)[0]).state;
      else state = placeSetupRoad(state, getSetupRoadEdges(state)[0]).state;
    }
    expect(state.activePlayer).toBe(0);
    const rolled = rollHexDice(state, 2, 3).state;
    const ended = endHexTurn(rolled).state;
    expect(ended.activePlayer).toBe(1);
    const afterAi = runHexSettlersAiTurn(ended);
    expect(afterAi.activePlayer).toBe(0);
    expect(afterAi.phase).toBe("roll");
    expect(validateHexSettlersState(afterAi)).toBe(true);
  });

  it("lets the computer explicitly substitute gold when building", () => {
    const setup = completeSetup(createHexSettlers("computer", 2, 918));
    const state = {
      ...setup,
      phase: "action" as const,
      activePlayer: 1,
      players: setup.players.map((player, index) => index === 1
        ? { ...player, resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, gold: 2 } }
        : player),
    };
    const beforeRoads = state.players[1].roads.length;
    const afterAi = runHexSettlersAiTurn(state);
    expect(afterAi.players[1].roads.length).toBe(beforeRoads + 1);
    expect(afterAi.players[1].resources.gold).toBe(0);
    expect(validateHexSettlersState(afterAi)).toBe(true);
  });

  it("limits the computer to one paid structure per turn", () => {
    const setup = completeSetup(createHexSettlers("computer", 2, 919));
    const state = {
      ...setup,
      phase: "action" as const,
      activePlayer: 1,
      players: setup.players.map((player, index) => index === 1
        ? { ...player, resources: { wood: 10, brick: 10, sheep: 10, wheat: 10, ore: 10, gold: 0 } }
        : player),
    };
    const before = state.players[1];
    const afterAi = runHexSettlersAiTurn(state);
    const after = afterAi.players[1];
    const builtActions = Math.max(0, after.roads.length - before.roads.length) +
      Math.max(0, after.settlements.length - before.settlements.length) +
      Math.max(0, after.cities.length - before.cities.length);
    expect(builtActions).toBe(1);
    expect(afterAi.activePlayer).toBe(0);
  });
});
