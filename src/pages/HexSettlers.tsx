import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Building2, Castle, House, Mountain, RotateCcw, Trees, Wheat, Footprints, Dice5, BookOpen, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  HEX_BUILD_COSTS,
  HEX_BUILD_RESOURCES,
  HEX_RESOURCES,
  canPayHexCost,
  buildHexCity,
  buildHexRoad,
  buildHexSettlement,
  buyHexDevelopmentCard,
  createHexSettlers,
  endHexTurn,
  getHexVictoryPoints,
  getAutomaticHexGoldPlan,
  getLegalCityNodes,
  getLegalRoadEdges,
  getLegalSettlementNodes,
  getSetupRoadEdges,
  getSetupSettlementNodes,
  placeSetupRoad,
  placeSetupSettlement,
  playHexDevelopmentCard,
  rollHexDiceRandomly,
  runHexSettlersAiTurn,
  tradeHexWithBank,
  normalizeHexSettlersSave,
  type HexDevelopmentCard,
  type HexDevelopmentType,
  type HexGameMode,
  type HexGoldPlan,
  type HexMapLayout,
  type HexMapSize,
  type HexResource,
  type HexSettlersState,
} from "../data/phase6f/hex-settlers";

const SAVE_KEY = "hex-settlers:session";
const TERRAIN_COLORS: Record<string, string> = {
  wood: "#4e765b",
  brick: "#a66e54",
  sheep: "#9baa70",
  wheat: "#c5a95f",
  ore: "#777b83",
  gold: "#b9953d",
  desert: "#d0b889",
};
const RESOURCE_ICONS = {
  wood: Trees,
  brick: Building2,
  sheep: House,
  wheat: Wheat,
  ore: Mountain,
  gold: Coins,
} satisfies Record<HexResource, typeof Trees>;
const RESOURCE_COLORS: Record<HexResource, string> = {
  wood: "#70a47a",
  brick: "#ca9070",
  sheep: "#a8bf79",
  wheat: "#dbbd69",
  ore: "#a5a9b1",
  gold: "#dfbb57",
};
type BuildTool = "none" | "road" | "settlement" | "city" | "development";

function hexPoints(x: number, y: number, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    return `${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`;
  }).join(" ");
}

function pointFor(x: number, y: number) {
  return { x: 320 + x * 50, y: 280 + y * 50 };
}

function boardViewBox(board: HexSettlersState["board"]): string {
  const xs = board.nodes.map((node) => 320 + node.x * 50);
  const ys = board.nodes.map((node) => 280 + node.y * 50);
  const padding = 22;
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  return `${minX} ${minY} ${Math.max(...xs) - minX + padding} ${Math.max(...ys) - minY + padding}`;
}

function developmentLabel(type: HexDevelopmentType, t: (key: string) => string): string {
  return t(`arcade.phase6d.hex.${type === "victoryPoint" ? "victoryPointCard" : type}`);
}

function localPlayerName(player: HexSettlersState["players"][number], t: (key: string) => string): string {
  if (player.kind === "computer") return `${t("arcade.phase6d.hex.colors." + ["coral", "teal", "gold", "violet"][player.id])} · AI`;
  return player.name;
}

function nodeOwner(state: HexSettlersState, nodeId: string): { player: number; city: boolean } | undefined {
  for (const player of state.players) {
    if (player.cities.includes(nodeId)) return { player: player.id, city: true };
    if (player.settlements.includes(nodeId)) return { player: player.id, city: false };
  }
  return undefined;
}

function edgeOwner(state: HexSettlersState, edgeId: string): number | undefined {
  return state.players.find((player) => player.roads.includes(edgeId))?.id;
}

export function HexSettlers() {
  const { t } = useTranslation();
  const [game, setGame] = useState<HexSettlersState | null>(null);
  const [mode, setMode] = useState<HexGameMode>("computer");
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const [mapSize, setMapSize] = useState<HexMapSize>("small");
  const [mapLayout, setMapLayout] = useState<HexMapLayout>("island");
  const [tool, setTool] = useState<BuildTool>("none");
  const [goldTarget, setGoldTarget] = useState<typeof HEX_BUILD_RESOURCES[number] | "">("");
  const [goldAmount, setGoldAmount] = useState(0);
  const [giveResource, setGiveResource] = useState<HexResource>("wood");
  const [receiveResource, setReceiveResource] = useState<HexResource>("brick");
  const [tradeGold, setTradeGold] = useState(0);
  const [cardId, setCardId] = useState("");
  const [cardResource, setCardResource] = useState<HexResource>("wood");
  const [targetPlayer, setTargetPlayer] = useState(1);
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const gameRef = useRef<HexSettlersState | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const noticeSequence = useRef(0);
  const noticeTimers = useRef(new Map<number, number>());
  const [resourceNotices, setResourceNotices] = useState<Array<{ id: number; player: string; resource: HexResource; amount: number }>>([]);
  const translation = useRef(t);
  translation.current = t;

  const save = useCallback((next: HexSettlersState) => {
    const write = writeQueue.current.then(async () => {
      await db.arcadeData.put({ id: SAVE_KEY, value: JSON.stringify(next), updatedAt: Date.now() });
    });
    writeQueue.current = write.catch((error: unknown) => {
      console.error("Could not save Hex Settlers game.", error);
      setFailure(translation.current("arcade.phase6d.hex.saveError"));
    });
  }, []);

  const commit = useCallback((next: HexSettlersState) => {
    const previous = gameRef.current;
    if (previous) {
      const gains = next.players.flatMap((player) => {
        const oldPlayer = previous.players.find((candidate) => candidate.id === player.id);
        if (!oldPlayer) return [];
        return HEX_RESOURCES.flatMap((resource) => {
          const amount = player.resources[resource] - oldPlayer.resources[resource];
          return amount > 0 ? [{ player: player.name, resource, amount }] : [];
        });
      });
      if (gains.length) {
        const notices = gains.map((gain) => ({ ...gain, id: ++noticeSequence.current }));
        setResourceNotices((current) => [...current, ...notices].slice(-18));
        for (const notice of notices) {
          const timer = window.setTimeout(() => {
            setResourceNotices((current) => current.filter((entry) => entry.id !== notice.id));
            noticeTimers.current.delete(notice.id);
          }, 2600);
          noticeTimers.current.set(notice.id, timer);
        }
      }
    }
    gameRef.current = next;
    setGame(next);
    save(next);
  }, [save]);

  useEffect(() => {
    let active = true;
    void db.arcadeData.get(SAVE_KEY).then((record) => {
      if (!active) return;
      if (record) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const normalized = normalizeHexSettlersSave(parsed);
        if (!normalized) {
          setFailure(t("arcade.phase6d.hex.invalidSave"));
          setReady(true);
          return;
        }
        gameRef.current = normalized;
        setGame(normalized);
        setMode(normalized.mode);
        setPlayerCount(normalized.players.length as 2 | 3 | 4);
        setMapSize(normalized.board.mapSize);
        setMapLayout(normalized.board.layout);
        if (JSON.stringify(parsed) !== JSON.stringify(normalized)) save(normalized);
        setReady(true);
        return;
      }
      const initial = createHexSettlers("computer", 2, Date.now());
      gameRef.current = initial;
      setGame(initial);
      setReady(true);
      save(initial);
    }).catch((error: unknown) => {
      console.error("Could not load Hex Settlers save.", error);
      if (active) {
        setFailure(t("arcade.phase6d.hex.saveError"));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [save, t]);

  useEffect(() => () => {
    for (const timer of noticeTimers.current.values()) window.clearTimeout(timer);
    noticeTimers.current.clear();
  }, []);

  useEffect(() => {
    if (!game || !ready || game.phase === "won" || game.players[game.activePlayer]?.kind !== "computer") return;
    const timer = window.setTimeout(() => {
      const next = runHexSettlersAiTurn(game);
      if (next !== game) commit(next);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [commit, game, ready]);

  const apply = useCallback((result: { state: HexSettlersState; error?: string }) => {
    if (result.error) {
      setFailure(result.error);
      return;
    }
    setFailure("");
    commit(result.state);
  }, [commit]);

  function startNewGame() {
    if (game && !window.confirm(t("arcade.phase6d.hex.confirmNew"))) return;
    const next = createHexSettlers(mode, mode === "computer" ? 2 : playerCount, Date.now(), mapSize, mapLayout);
    setTool("none");
    setGoldTarget("");
    setGoldAmount(0);
    setCardId("");
    setFailure("");
    commit(next);
  }

  const currentPlayer = game?.players[game.activePlayer];
  const computerTurn = currentPlayer?.kind === "computer";
  const legalRoads = useMemo(() => {
    if (!game || computerTurn) return new Set<string>();
    if (game.phase === "setup-road") return new Set(getSetupRoadEdges(game));
    if (game.phase === "action" && tool === "road") return new Set(getLegalRoadEdges(game));
    return new Set<string>();
  }, [computerTurn, game, tool]);
  const legalNodes = useMemo(() => {
    if (!game || computerTurn) return new Set<string>();
    if (game.phase === "setup-settlement") return new Set(getSetupSettlementNodes(game));
    if (game.phase === "action" && tool === "settlement") return new Set(getLegalSettlementNodes(game));
    if (game.phase === "action" && tool === "city") return new Set(getLegalCityNodes(game));
    return new Set<string>();
  }, [computerTurn, game, tool]);

  function clickNode(nodeId: string) {
    if (!game || computerTurn) return;
    if (game.phase === "setup-settlement") apply(placeSetupSettlement(game, nodeId));
    else if (game.phase === "action" && tool === "settlement") apply(buildHexSettlement(game, nodeId, selectedGoldPlan));
    else if (game.phase === "action" && tool === "city") apply(buildHexCity(game, nodeId, selectedGoldPlan));
  }

  function clickEdge(edgeId: string) {
    if (!game || computerTurn) return;
    if (game.phase === "setup-road") apply(placeSetupRoad(game, edgeId));
    else if (game.phase === "action" && tool === "road") apply(buildHexRoad(game, edgeId, false, selectedGoldPlan));
  }

  function keyActivate(event: React.KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  function playSelectedCard() {
    if (!game || !cardId) return;
    const card = currentPlayer?.developmentCards.find((candidate) => candidate.id === cardId);
    apply(playHexDevelopmentCard(game, cardId, cardResource, card?.type === "knight" ? targetPlayer : undefined));
    setCardId("");
  }

  if (!ready) return <p className="arcade-loading">{t("arcade.loading")}</p>;
  if (!game) return <p className="form-error" role="alert">{failure || t("arcade.phase6d.hex.invalidSave")}</p>;

  const canAct = !computerTurn && game.phase === "action";
  const mapChanged = game.board.mapSize !== mapSize || game.board.layout !== mapLayout;
  const selectedMapLabel = `${t(`arcade.phase6d.hex.mapSizes.${mapSize}`)} · ${t(`arcade.phase6d.hex.mapLayouts.${mapLayout}`)}`;
  const currentMapLabel = `${t(`arcade.phase6d.hex.mapSizes.${game.board.mapSize}`)} · ${t(`arcade.phase6d.hex.mapLayouts.${game.board.layout}`)}`;
  const toolCost: Partial<Record<HexResource, number>> | undefined =
    tool === "none" ? undefined : tool === "development" ? HEX_BUILD_COSTS.development : HEX_BUILD_COSTS[tool];
  const selectedGoldPlan: HexGoldPlan = goldTarget && goldAmount > 0 ? { [goldTarget]: goldAmount } : {};
  const canPaySelectedCost = (cost: Partial<Record<HexResource, number>>) =>
    Boolean(currentPlayer && canPayHexCost(currentPlayer, cost, selectedGoldPlan));
  const goldTargetOptions = toolCost
    ? HEX_BUILD_RESOURCES.filter((resource) => (toolCost[resource] ?? 0) > 0)
    : [];
  const maxGoldForTarget = goldTarget && toolCost
    ? Math.min(toolCost[goldTarget] ?? 0, currentPlayer?.resources.gold ?? 0)
    : 0;
  const canTrade = Boolean(currentPlayer && receiveResource !== giveResource &&
    (giveResource === "gold"
      ? currentPlayer.resources.gold >= 4
      : currentPlayer.resources[giveResource] >= 4 - tradeGold && currentPlayer.resources.gold >= tradeGold) &&
    currentPlayer.resources[receiveResource] < 19);

  function selectTool(nextTool: BuildTool) {
    setGoldTarget("");
    setGoldAmount(0);
    setTool(tool === nextTool ? "none" : nextTool);
  }
  const developmentOptions = currentPlayer?.developmentCards.filter((card) =>
    card.type !== "victoryPoint" && card.boughtTurn !== game.turn) ?? [];
  const instruction = game.phase === "setup-settlement"
    ? t("arcade.phase6d.hex.setupSettlement")
    : game.phase === "setup-road"
      ? t("arcade.phase6d.hex.setupRoad")
      : game.phase === "won"
        ? t("arcade.phase6d.hex.winner", { player: game.players[game.winner ?? game.activePlayer].name })
        : tool === "road"
          ? t("arcade.phase6d.hex.selectRoad")
          : tool === "settlement"
            ? t("arcade.phase6d.hex.selectSettlement")
            : tool === "city"
              ? t("arcade.phase6d.hex.selectCity")
              : t("arcade.phase6d.hex.actions");

  return (
    <div className="phase6-game phase6f-hex" data-game="hex-settlers">
      <div className="phase6-game__toolbar phase6d-toolbar">
        <div className="phase6-game__stats">
          <span>{t("arcade.phase6d.hex.turn", { player: currentPlayer?.name ?? "", turn: game.turn })}</span>
          <span>{t("arcade.phase6d.hex.victoryPoints")} <strong>{currentPlayer ? getHexVictoryPoints(currentPlayer) : 0} / 10</strong></span>
        </div>
        <div className="phase6-game__actions phase6d-toolbar__actions">
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.hex.mode")}</span>
            <select onChange={(event) => {
              const nextMode = event.target.value as HexGameMode;
              setMode(nextMode);
              if (nextMode === "computer") setPlayerCount(2);
            }} value={mode}>
              <option value="computer">{t("arcade.phase6d.hex.computer")}</option>
              <option value="local">{t("arcade.phase6d.hex.local")}</option>
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.hex.players")}</span>
            <select disabled={mode === "computer"} onChange={(event) => setPlayerCount(Number(event.target.value) as 2 | 3 | 4)} value={playerCount}>
              {[2, 3, 4].map((count) => <option key={count} value={count}>{t("arcade.phase6d.hex.playerCount", { count })}</option>)}
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.hex.mapSize")}</span>
            <select onChange={(event) => setMapSize(event.target.value as HexMapSize)} value={mapSize}>
              {(["small", "medium", "large", "extraLarge"] as const).map((size) => <option key={size} value={size}>{t(`arcade.phase6d.hex.mapSizes.${size}`)}</option>)}
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.hex.mapLayout")}</span>
            <select onChange={(event) => setMapLayout(event.target.value as HexMapLayout)} value={mapLayout}>
              {(["island", "atoll"] as const).map((layout) => <option key={layout} value={layout}>{t(`arcade.phase6d.hex.mapLayouts.${layout}`)}</option>)}
            </select>
          </label>
          <button className="button button--quiet" onClick={startNewGame} type="button"><RotateCcw size={13} />{mapChanged ? t("arcade.phase6d.hex.startSelectedMap") : t("arcade.phase6d.hex.newGame")}</button>
        </div>
      </div>
      {mapChanged && <p className="phase6f-hex__map-pending" role="status">{t("arcade.phase6d.hex.mapPending", { current: currentMapLabel, selected: selectedMapLabel })}</p>}

      <div className="phase6f-hex__layout">
        <section aria-label={t("arcade.phase6d.hex.board")} className="phase6d-panel phase6f-hex__board-panel">
          <svg aria-label={t("arcade.phase6d.hex.board")} className="phase6f-hex__board" role="group" viewBox={boardViewBox(game.board)}>
            {game.board.tiles.map((tile) => {
              const center = pointFor(tile.x, tile.y);
              return (
                <g data-terrain={tile.terrain} data-tile-id={tile.id} key={tile.id}>
                  <polygon className="phase6f-hex__tile" points={hexPoints(center.x, center.y, 50)} fill={TERRAIN_COLORS[tile.terrain]} />
                  <circle className={`phase6f-hex__number${tile.number === 6 || tile.number === 8 ? " is-hot" : ""}`} cx={center.x} cy={center.y} r="16" />
                  {tile.number !== null && <text className="phase6f-hex__number-text" x={center.x} y={center.y + 5} textAnchor="middle">{tile.number}</text>}
                  <text className="phase6f-hex__terrain-label" x={center.x} y={center.y + 31} textAnchor="middle">{t(`arcade.phase6d.hex.terrain.${tile.terrain}`)}</text>
                </g>
              );
            })}
            {game.board.edges.map((edge) => {
              const [first, second] = edge.nodeIds.map((id) => game.board.nodes.find((node) => node.id === id));
              if (!first || !second) return null;
              const a = pointFor(first.x, first.y);
              const b = pointFor(second.x, second.y);
              const owner = edgeOwner(game, edge.id);
              const isLegal = legalRoads.has(edge.id);
              const color = owner === undefined ? "transparent" : game.players[owner].color;
              return (
                <g data-edge-id={edge.id} data-legal-road={isLegal || undefined} key={edge.id}>
                  {owner !== undefined && <line className="phase6f-hex__road-outline" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                  {owner !== undefined && <line className="phase6f-hex__road" stroke={color} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                  {isLegal && <line className="phase6f-hex__road-hint" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />}
                  <line
                    aria-label={`${t("arcade.phase6d.hex.legal")} · ${edge.id}`}
                    className="phase6f-hex__edge-hit"
                    onClick={() => clickEdge(edge.id)}
                    onKeyDown={(event) => keyActivate(event, () => clickEdge(edge.id))}
                    role={isLegal ? "button" : undefined}
                    tabIndex={isLegal ? 0 : undefined}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  />
                </g>
              );
            })}
            {game.board.nodes.map((node, index) => {
              const point = pointFor(node.x, node.y);
              const owner = nodeOwner(game, node.id);
              const isLegal = legalNodes.has(node.id);
              const fill = owner === undefined ? "transparent" : game.players[owner.player].color;
              return (
                <g
                  aria-label={`${isLegal ? t("arcade.phase6d.hex.legal") : t("arcade.phase6d.hex.board")} · ${index + 1}`}
                  className={`phase6f-hex__node${isLegal ? " is-legal" : ""}`}
                  data-node-id={node.id}
                  data-legal-node={isLegal || undefined}
                  key={node.id}
                  onClick={() => clickNode(node.id)}
                  onKeyDown={(event) => keyActivate(event, () => clickNode(node.id))}
                  role={isLegal ? "button" : undefined}
                  tabIndex={isLegal ? 0 : undefined}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  {owner?.city ? (
                    <path className="phase6f-hex__building" d="M-12 8V-1L0-11 12-1V8H5V2H-5V8Z" fill={fill} />
                  ) : owner ? (
                    <path className="phase6f-hex__building" d="M-10 7V-1L0-10 10-1V7Z" fill={fill} />
                  ) : (
                    <circle className="phase6f-hex__node-target" cx="0" cy="0" r={isLegal ? 7 : 3.5} />
                  )}
                  {owner && <circle className="phase6f-hex__building-mark" cx="0" cy="1" r="2" />}
                </g>
              );
            })}
          </svg>
          <div className="phase6f-hex__board-footer">
            <span className="phase6f-hex__instruction" aria-live="polite">{instruction}</span>
            <span className="phase6f-hex__dice" aria-label={t("arcade.phase6d.hex.die")}>
              {game.dice ? <><b>{game.dice[0]}</b><Dice5 size={13} /><b>{game.dice[1]}</b><strong>{game.dice[0] + game.dice[1]}</strong></> : <Dice5 size={15} />}
            </span>
            {game.phase === "roll" && !computerTurn && <button className="button button--primary" onClick={() => commit(rollHexDiceRandomly(game))} type="button"><Dice5 size={14} />{t("arcade.phase6d.hex.roll")}</button>}
            {canAct && <button className="button button--primary" onClick={() => apply(endHexTurn(game))} type="button">{t("arcade.phase6d.hex.endTurn")}</button>}
          </div>
        </section>

        <aside className="phase6f-hex__side">
          <section className="phase6d-panel phase6f-hex__players">
            <div className="phase6d-panel__heading"><div><span>{t("arcade.phase6d.hex.players")}</span><h2>{currentPlayer?.name ?? ""}</h2></div><strong>{currentPlayer ? getHexVictoryPoints(currentPlayer) : 0} / 10</strong></div>
            <div className="phase6f-hex__player-list">
              {game.players.map((player) => (
                <div className={`phase6f-hex__player${player.id === game.activePlayer ? " is-current" : ""}`} key={player.id}>
                  <i style={{ background: player.color }} />
                  <strong>{localPlayerName(player, t)}</strong>
                  <span>{getHexVictoryPoints(player)} {t("arcade.phase6d.hex.victoryPoints")}</span>
                </div>
              ))}
            </div>
            <h3>{t("arcade.phase6d.hex.resources")}</h3>
            <div className="phase6f-hex__resources">
              {HEX_RESOURCES.map((resource) => {
                const Icon = RESOURCE_ICONS[resource];
                return <div key={resource}><Icon size={14} style={{ color: RESOURCE_COLORS[resource] }} /><span>{t(`arcade.phase6d.hex.resourceName.${resource}`)}</span><strong>{currentPlayer?.resources[resource] ?? 0}</strong></div>;
              })}
            </div>
          </section>

          <section className="phase6d-panel phase6f-hex__build">
            <div className="phase6d-panel__heading"><div><span>{t("arcade.phase6d.hex.build")}</span><h2><Footprints size={15} />{t("arcade.phase6d.hex.actions")}</h2></div></div>
            <div className="phase6f-hex__tools">
              {(["road", "settlement", "city"] as const).map((buildTool) => {
                const icon = buildTool === "road" ? <Footprints size={14} /> : buildTool === "city" ? <Castle size={14} /> : <House size={14} />;
                const label = t(`arcade.phase6d.hex.${buildTool}`);
                return <button aria-pressed={tool === buildTool} className={tool === buildTool ? "is-selected" : ""} disabled={!canAct || !currentPlayer || getAutomaticHexGoldPlan(currentPlayer, HEX_BUILD_COSTS[buildTool]) === null} key={buildTool} onClick={() => selectTool(buildTool)} type="button">{icon}<span>{label}</span></button>;
              })}
              <button aria-pressed={tool === "development"} className={tool === "development" ? "is-selected" : ""} disabled={!canAct || !currentPlayer || game.developmentDeck.length === 0 || getAutomaticHexGoldPlan(currentPlayer, HEX_BUILD_COSTS.development) === null} onClick={() => {
                if (tool !== "development") selectTool("development");
                else {
                  apply(buyHexDevelopmentCard(game, selectedGoldPlan));
                  setTool("none");
                  setGoldTarget("");
                  setGoldAmount(0);
                }
              }} type="button"><BookOpen size={14} /><span>{tool === "development" ? t("arcade.phase6d.hex.confirmBuyDevelopment") : t("arcade.phase6d.hex.buyDevelopment")}</span></button>
            </div>
            {toolCost && (
              <div className="phase6f-hex__gold-payment">
                <h3><Coins size={13} />{t("arcade.phase6d.hex.goldPayment")}</h3>
                <label>{t("arcade.phase6d.hex.goldReplaces")}
                  <select onChange={(event) => {
                    setGoldTarget(event.target.value as typeof goldTarget);
                    setGoldAmount(event.target.value ? 1 : 0);
                  }} value={goldTarget}>
                    <option value="">{t("arcade.phase6d.hex.noGold")}</option>
                    {goldTargetOptions.map((resource) => <option key={resource} value={resource}>{t(`arcade.phase6d.hex.resourceName.${resource}`)}</option>)}
                  </select>
                </label>
                {goldTarget && (
                  <label>{t("arcade.phase6d.hex.goldToSpend")}
                    <select onChange={(event) => setGoldAmount(Number(event.target.value))} value={Math.min(goldAmount, maxGoldForTarget)}>
                      {Array.from({ length: maxGoldForTarget + 1 }, (_, amount) => <option key={amount} value={amount}>{amount}</option>)}
                    </select>
                  </label>
                )}
                <p>{goldTarget && goldAmount > 0
                  ? t("arcade.phase6d.hex.goldReplacementSummary", { amount: goldAmount, resource: t(`arcade.phase6d.hex.resourceName.${goldTarget}`) })
                  : t("arcade.phase6d.hex.goldPaymentHint", { amount: currentPlayer?.resources.gold ?? 0 })}</p>
                {tool !== "development" && !canPaySelectedCost(toolCost) && <p className="form-error">{t("arcade.phase6d.hex.cannotPaySelectedCost")}</p>}
              </div>
            )}
            <div className="phase6f-hex__trade">
              <h3><ArrowDownUp size={13} />{t("arcade.phase6d.hex.bank")}</h3>
              <label>{t("arcade.phase6d.hex.give")}<select onChange={(event) => {
                const resource = event.target.value as HexResource;
                setGiveResource(resource);
                setTradeGold(0);
              }} value={giveResource}>{HEX_RESOURCES.map((resource) => <option key={resource} value={resource}>{t(`arcade.phase6d.hex.resourceName.${resource}`)} ({currentPlayer?.resources[resource] ?? 0})</option>)}</select></label>
              <label>{t("arcade.phase6d.hex.receive")}<select onChange={(event) => setReceiveResource(event.target.value as HexResource)} value={receiveResource}>{HEX_RESOURCES.map((resource) => <option key={resource} value={resource}>{t(`arcade.phase6d.hex.resourceName.${resource}`)}</option>)}</select></label>
              {giveResource !== "gold" && <label>{t("arcade.phase6d.hex.goldToTrade")}<select onChange={(event) => setTradeGold(Number(event.target.value))} value={tradeGold}>{[0, 1, 2, 3, 4].map((amount) => <option key={amount} value={amount}>{amount}</option>)}</select></label>}
              <button className="button button--quiet" disabled={!canAct || !canTrade} onClick={() => {
                apply(tradeHexWithBank(game, giveResource, receiveResource, tradeGold));
                setTradeGold(0);
              }} type="button"><Coins size={13} />{t("arcade.phase6d.hex.trade")}</button>
              <p>{t("arcade.phase6d.hex.tradeHint")}</p>
            </div>
            <div aria-label={t("arcade.phase6d.hex.resourceGains")} aria-live="polite" className="phase6f-hex__resource-notices" role="status">
              {resourceNotices.map((notice) => {
                const Icon = RESOURCE_ICONS[notice.resource];
                return <div className="phase6f-hex__resource-notice" key={notice.id}><Icon size={15} style={{ color: RESOURCE_COLORS[notice.resource] }} /><strong>+{notice.amount}</strong><span>{t(`arcade.phase6d.hex.resourceName.${notice.resource}`)}</span><small>{notice.player}</small></div>;
              })}
            </div>
          </section>

          <section className="phase6d-panel phase6f-hex__development">
            <h3>{t("arcade.phase6d.hex.playCard")}</h3>
            {developmentOptions.length ? (
              <>
                <select aria-label={t("arcade.phase6d.hex.chooseCard")} onChange={(event) => setCardId(event.target.value)} value={cardId}>
                  <option value="">{t("arcade.phase6d.hex.chooseCard")}</option>
                  {developmentOptions.map((card: HexDevelopmentCard) => <option key={card.id} value={card.id}>{developmentLabel(card.type, t)}</option>)}
                </select>
                {cardId && ["yearOfPlenty", "monopoly"].includes(currentPlayer?.developmentCards.find((card) => card.id === cardId)?.type ?? "") && (
                  <select aria-label={t("arcade.phase6d.hex.chooseResource")} onChange={(event) => setCardResource(event.target.value as HexResource)} value={cardResource}>{HEX_RESOURCES.map((resource) => <option key={resource} value={resource}>{t(`arcade.phase6d.hex.resourceName.${resource}`)}</option>)}</select>
                )}
                {cardId && currentPlayer?.developmentCards.find((card) => card.id === cardId)?.type === "knight" && (
                  <select aria-label={t("arcade.phase6d.hex.chooseOpponent")} onChange={(event) => setTargetPlayer(Number(event.target.value))} value={targetPlayer}>{game.players.filter((player) => player.id !== game.activePlayer).map((player) => <option key={player.id} value={player.id}>{localPlayerName(player, t)}</option>)}</select>
                )}
                <button className="button button--quiet" disabled={!canAct || !cardId || game.playedDevelopmentCard} onClick={playSelectedCard} type="button">{t("arcade.phase6d.hex.playCard")}</button>
              </>
            ) : <p>{t("arcade.phase6d.hex.noCards")}</p>}
            <small>{t("arcade.phase6d.hex.developmentHint")}</small>
          </section>
        </aside>

        <details className="phase6d-panel phase6f-hex__tutorial">
          <summary><BookOpen size={14} />{t("arcade.phase6d.hex.tutorial")}</summary>
          <p>{t("arcade.phase6d.hex.tutorialText")}</p>
        </details>
        <section aria-label={t("arcade.phase6d.hex.log")} className="phase6d-panel phase6f-hex__log">
          <h3>{t("arcade.phase6d.hex.log")}</h3>
          <ol>{game.log.slice(-10).reverse().map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>
        </section>
      </div>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>
  );
}
