import { useCallback, useEffect, useRef, useState } from "react";
import { Dice5, RotateCcw, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  advanceColorLudoRandom,
  chooseColorLudoMove,
  createColorLudo,
  LUDO_COLORS,
  LUDO_FINISH_PROGRESS,
  LUDO_STARTS,
  LUDO_SAFE_SPACES,
  moveColorLudoToken,
  rollColorLudo,
  validateColorLudoState,
  type ColorLudoState,
  type LudoColor,
  type LudoDifficulty,
  type LudoHistoryEntry,
  type LudoMode,
} from "../data/phase6d/color-ludo";

const SAVE_KEY = "color-ludo:session";
const COLOR_VALUES: Record<LudoColor, string> = {
  coral: "#d78372",
  teal: "#78aaa0",
  gold: "#d2b164",
  violet: "#a38bbb",
};
const BOARD_CELL = 40;
const BOARD_SIZE = BOARD_CELL * 15;
const BOARD_CENTER = BOARD_SIZE / 2;
const BASE_INSET_OFFSET = BOARD_CELL / 2;
const BASE_INSET_SIZE = BOARD_CELL * 5;
const TOKEN_RADIUS = 16.5;
const TOKEN_BODY_PATH = "M-4-1C-4 3-8 7-11 11c-3 4-1 6 3 6H8c4 0 6-2 3-6C8 7 4 3 4-1Z";
const BASE_TOKEN_AXIS = [
  (BASE_INSET_SIZE - TOKEN_RADIUS) / 3,
  (BASE_INSET_SIZE * 2 + TOKEN_RADIUS) / 3,
] as const;
const RING_CELLS: ReadonlyArray<readonly [number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];
const HOME_CELLS: Record<LudoColor, ReadonlyArray<readonly [number, number]>> = {
  coral: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  teal: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  gold: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  violet: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};
const BASE_ORIGINS: Record<LudoColor, readonly [number, number]> = {
  coral: [0, 0],
  teal: [0, 9],
  gold: [9, 9],
  violet: [9, 0],
};
const STACK_OFFSETS = [
  [{ x: 0, y: 0 }],
  [{ x: -6, y: 0 }, { x: 6, y: 0 }],
  [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 0, y: 5 }],
  [{ x: -6, y: -5 }, { x: 6, y: -5 }, { x: -6, y: 5 }, { x: 6, y: 5 }],
];

function cellCenter([row, column]: readonly [number, number]): { x: number; y: number } {
  return { x: (column + 0.5) * BOARD_CELL, y: (row + 0.5) * BOARD_CELL };
}

function yardPoint(color: LudoColor, token: number): { x: number; y: number } {
  const [baseRow, baseColumn] = BASE_ORIGINS[color];
  return {
    x: baseColumn * BOARD_CELL + BASE_INSET_OFFSET + BASE_TOKEN_AXIS[token % 2],
    y: baseRow * BOARD_CELL + BASE_INSET_OFFSET + BASE_TOKEN_AXIS[Math.floor(token / 2)],
  };
}

function tokenCell(color: LudoColor, progress: number): readonly [number, number] | null {
  if (progress === -1) return null;
  if (progress === LUDO_FINISH_PROGRESS) return [7, 7];
  if (progress >= 52) return HOME_CELLS[color][progress - 52];
  const ringPosition = (LUDO_STARTS[color] + progress) % RING_CELLS.length;
  return RING_CELLS[ringPosition];
}

function tokenPoint(color: LudoColor, progress: number, token: number, stackIndex: number, stackSize: number): { x: number; y: number } {
  if (progress === -1) return yardPoint(color, token);
  const point = progress === LUDO_FINISH_PROGRESS
    ? { x: BOARD_CENTER, y: BOARD_CENTER }
    : cellCenter(tokenCell(color, progress) ?? [7, 7]);
  const offsets = STACK_OFFSETS[Math.min(stackSize, STACK_OFFSETS.length) - 1];
  const offset = offsets[stackIndex] ?? { x: 0, y: 0 };
  return { x: point.x + offset.x, y: point.y + offset.y };
}

const RING_POSITION_BY_CELL = new Map(RING_CELLS.map((cell, position) => [`${cell[0]},${cell[1]}`, position]));
const HOME_COLOR_BY_CELL = new Map(
  LUDO_COLORS.flatMap((color) => HOME_CELLS[color].map((cell) => [`${cell[0]},${cell[1]}`, color] as const)),
);

function localPlayerName(state: ColorLudoState, playerIndex: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const player = state.players[playerIndex];
  if (player.kind === "computer") return t("arcade.phase6d.ludo.computerPlayer");
  if (state.mode === "computer") return t("arcade.phase6d.ludo.you");
  return t("arcade.phase6d.ludo.player", { number: playerIndex + 1 });
}

function historyText(entry: LudoHistoryEntry, state: ColorLudoState, t: (key: string, options?: Record<string, unknown>) => string): string {
  const isYou = state.mode === "computer" && entry.player === 0;
  const eventType = entry.type === "move"
    ? entry.destination === 0 ? "moveStart"
      : entry.destination === LUDO_FINISH_PROGRESS ? "moveHome"
        : (entry.destination ?? 0) >= 52 ? "moveLane"
          : (entry.captured?.length ?? 0) > 0 ? "moveCapture"
            : "move"
    : entry.type;
  return t(`arcade.phase6d.ludo.log.${eventType}${isYou ? "You" : ""}`, {
    player: localPlayerName(state, entry.player, t),
    roll: entry.roll,
    token: entry.token === undefined ? "" : entry.token + 1,
    captured: entry.captured?.length ?? 0,
    destination: entry.destination,
  });
}

function statusLabel(state: ColorLudoState, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (state.phase === "won") {
    const winner = state.winner ?? state.activePlayer;
    return state.mode === "computer" && winner === 0
      ? t("arcade.phase6d.ludo.youWin")
      : t("arcade.phase6d.ludo.victory", { player: localPlayerName(state, winner, t) });
  }
  if (state.mode === "computer" && state.activePlayer === 0) return t("arcade.phase6d.ludo.youTurn");
  return t("arcade.phase6d.ludo.turn", { player: localPlayerName(state, state.activePlayer, t) });
}

export function ColorLudo() {
  const { t } = useTranslation();
  const [game, setGame] = useState<ColorLudoState | null>(null);
  const [mode, setMode] = useState<LudoMode>("computer");
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const [difficulty, setDifficulty] = useState<LudoDifficulty>("normal");
  const [ready, setReady] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [failure, setFailure] = useState("");
  const gameRef = useRef<ColorLudoState | null>(null);
  const rollLock = useRef(false);
  const rollTimer = useRef<number | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const translation = useRef(t);
  translation.current = t;

  const commit = useCallback((next: ColorLudoState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const save = useCallback((next: ColorLudoState) => {
    const operation = writeQueue.current.then(async () => {
      await db.arcadeData.put({ id: SAVE_KEY, value: JSON.stringify(next), updatedAt: Date.now() });
    });
    writeQueue.current = operation.catch(() => {
      setFailure(translation.current("arcade.phase6d.ludo.saveError"));
    });
  }, []);

  useEffect(() => {
    let active = true;
    void db.arcadeData.get(SAVE_KEY).then((record) => {
      if (!active) return;
      if (!record) {
        const initial = createColorLudo("computer", 2, "normal", Date.now());
        gameRef.current = initial;
        setGame(initial);
        setReady(true);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(record.value);
      } catch {
        parsed = null;
      }
      if (!validateColorLudoState(parsed)) {
        setFailure(translation.current("arcade.phase6d.ludo.invalidSave"));
        setReady(true);
        return;
      }
      const restored = parsed;
      gameRef.current = restored;
      setGame(restored);
      setMode(restored.mode);
      setPlayerCount(restored.players.length as 2 | 3 | 4);
      setDifficulty(restored.difficulty);
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setFailure(translation.current("arcade.phase6d.ludo.saveError"));
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !game) return;
    save(game);
  }, [game, ready, save]);

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
  }, []);

  const rollDice = useCallback(() => {
    const current = gameRef.current;
    if (!current || current.phase !== "roll" || current.players[current.activePlayer].kind === "computer" || rollLock.current) return;
    rollLock.current = true;
    setRolling(true);
    rollTimer.current = window.setTimeout(() => {
      const latest = gameRef.current;
      if (!latest || latest.phase !== "roll") {
        rollLock.current = false;
        setRolling(false);
        return;
      }
      const random = advanceColorLudoRandom(latest);
      commit(rollColorLudo(random.state, random.roll));
      rollLock.current = false;
      setRolling(false);
    }, 420);
  }, [commit]);

  const moveToken = useCallback((token: number) => {
    const current = gameRef.current;
    if (!current) return;
    const result = moveColorLudoToken(current, token);
    if (result.state !== current) commit(result.state);
  }, [commit]);

  useEffect(() => {
    if (!game || game.phase === "won" || rolling || game.players[game.activePlayer].kind !== "computer") return;
    const timer = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.phase === "won" || current.players[current.activePlayer].kind !== "computer") return;
      if (current.phase === "roll") {
        if (rollLock.current) return;
        rollLock.current = true;
        setRolling(true);
        rollTimer.current = window.setTimeout(() => {
          const latest = gameRef.current;
          if (!latest || latest.phase !== "roll" || latest.players[latest.activePlayer].kind !== "computer") {
            rollLock.current = false;
            setRolling(false);
            return;
          }
          const random = advanceColorLudoRandom(latest);
          commit(rollColorLudo(random.state, random.roll));
          rollLock.current = false;
          setRolling(false);
        }, 420);
        return;
      }
      let noise = (current.randomState ^ (current.turn * 0x45d9f3b)) >>> 0;
      const aiRandom = () => {
        noise = (Math.imul(noise ^ (noise >>> 16), 0x45d9f3b) + 0x27100001) >>> 0;
        return noise / 4294967296;
      };
      const token = chooseColorLudoMove(current, aiRandom);
      if (token !== null) moveToken(token);
    }, game.phase === "roll" ? 620 : 500);
    return () => window.clearTimeout(timer);
  }, [commit, game, moveToken, rolling]);

  function startNewGame() {
    if (game && !window.confirm(t("arcade.phase6d.ludo.confirmRestart"))) return;
    const count: 2 | 3 | 4 = mode === "computer" ? 2 : playerCount;
    const next = createColorLudo(mode, count, difficulty, Date.now());
    commit(next);
    setPlayerCount(count);
    setFailure("");
  }

  function renderToken(playerIndex: number, tokenIndex: number, progress: number) {
    const state = game;
    if (!state) return null;
    const player = state.players[playerIndex];
    const cell = tokenCell(player.color, progress);
    const occupants = state.players.flatMap((candidate, candidateIndex) => candidate.tokens.flatMap((candidateProgress, candidateToken) => {
      if (candidateProgress === -1) return [];
      const candidateCell = tokenCell(candidate.color, candidateProgress);
      return candidateCell?.[0] === cell?.[0] && candidateCell?.[1] === cell?.[1] ? [{ player: candidateIndex, token: candidateToken }] : [];
    }));
    const stackIndex = cell ? occupants.findIndex((occupant) => occupant.player === playerIndex && occupant.token === tokenIndex) : 0;
    const point = tokenPoint(player.color, progress, tokenIndex, stackIndex, cell ? occupants.length : 1);
    const legal = playerIndex === state.activePlayer && state.legalTokens.includes(tokenIndex);
    const colorName = t(`arcade.phase6d.ludo.${player.color}`);
    const label = t(legal ? "arcade.phase6d.ludo.legalToken" : "arcade.phase6d.ludo.token", { color: colorName, number: tokenIndex + 1 });
    return (
      <g
        aria-label={label}
        className={`phase6d-ludo__token${legal ? " is-legal" : ""}${playerIndex === state.activePlayer ? " is-current-player" : ""}`}
        key={`${playerIndex}-${tokenIndex}`}
        onClick={() => { if (legal && !rolling) moveToken(tokenIndex); }}
        onKeyDown={(event) => {
          if (legal && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            moveToken(tokenIndex);
          }
        }}
        role={legal ? "button" : "img"}
        tabIndex={legal ? 0 : undefined}
        transform={`translate(${point.x} ${point.y})`}
      >
        <title>{label}</title>
        <g className="phase6d-ludo__token-shadow" transform="translate(1 2)">
          <circle cx="0" cy="-7" r="8" />
          <path d={TOKEN_BODY_PATH} />
        </g>
        <circle className="phase6d-ludo__token-body" cx="0" cy="-7" r="8" fill={COLOR_VALUES[player.color]} />
        <path className="phase6d-ludo__token-body phase6d-ludo__token-piece" d={TOKEN_BODY_PATH} fill={COLOR_VALUES[player.color]} />
        <text className="phase6d-ludo__token-number" dominantBaseline="central" textAnchor="middle" y="9">{tokenIndex + 1}</text>
      </g>
    );
  }

  if (!ready) return <p className="arcade-loading">{t("arcade.loading")}</p>;

  const activePlayer = game?.players[game.activePlayer];
  const computerTurn = activePlayer?.kind === "computer";

  return (
    <div className="phase6-game phase6d-ludo" data-game="color-ludo">
      <div className="phase6-game__toolbar phase6d-toolbar">
        <div className="phase6-game__stats">
          <span>{game ? statusLabel(game, t) : ""}</span>
          <span>{t("arcade.phase6d.ludo.history")} <strong>{game?.turn ?? 0}</strong></span>
        </div>
        <div className="phase6-game__actions phase6d-toolbar__actions">
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.ludo.mode")}</span>
            <select onChange={(event) => {
              const nextMode = event.target.value as LudoMode;
              setMode(nextMode);
              if (nextMode === "computer") setPlayerCount(2);
            }} value={mode}>
              <option value="computer">{t("arcade.phase6d.ludo.computer")}</option>
              <option value="local">{t("arcade.phase6d.ludo.local")}</option>
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.ludo.players")}</span>
            <select disabled={mode === "computer"} onChange={(event) => setPlayerCount(Number(event.target.value) as 2 | 3 | 4)} value={playerCount}>
              {[2, 3, 4].map((count) => <option key={count} value={count}>{t("arcade.phase6d.ludo.playerCount", { count })}</option>)}
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.ludo.difficulty")}</span>
            <select onChange={(event) => setDifficulty(event.target.value as LudoDifficulty)} value={difficulty}>
              {(["easy", "normal", "hard"] as const).map((level) => <option key={level} value={level}>{t(`arcade.phase6d.ludo.${level}`)}</option>)}
            </select>
          </label>
          <button className="button button--quiet" onClick={startNewGame} type="button"><RotateCcw size={13} />{t("arcade.phase6d.ludo.restart")}</button>
        </div>
      </div>

      {game ? (
        <div className="phase6d-ludo__layout">
          <section aria-label={t("arcade.phase6d.ludo.board")} className="phase6d-panel phase6d-ludo__board-panel">
            <svg aria-label={t("arcade.phase6d.ludo.board")} className="phase6d-ludo__board" role="group" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}>
              <rect className="phase6d-ludo__board-surface" height={BOARD_SIZE} width={BOARD_SIZE} />
              {LUDO_COLORS.map((color) => {
                const [row, column] = BASE_ORIGINS[color];
                const x = column * BOARD_CELL;
                const y = row * BOARD_CELL;
                return (
                  <g className="phase6d-ludo__base" data-base={color} key={color}>
                    <rect fill={COLOR_VALUES[color]} height={BOARD_CELL * 6} stroke="#252525" strokeWidth="1" width={BOARD_CELL * 6} x={x} y={y} />
                    <rect className="phase6d-ludo__base-inset" height={BASE_INSET_SIZE} width={BASE_INSET_SIZE} x={x + BASE_INSET_OFFSET} y={y + BASE_INSET_OFFSET} />
                    {Array.from({ length: 4 }, (_, token) => {
                      const point = yardPoint(color, token);
                      return <circle className="phase6d-ludo__yard-slot" cx={point.x} cy={point.y} data-yard-slot={`${color}-${token}`} key={token} r="12" stroke={COLOR_VALUES[color]} />;
                    })}
                  </g>
                );
              })}
              {Array.from({ length: 15 * 15 }, (_, index) => {
                const row = Math.floor(index / 15);
                const column = index % 15;
                if (!((row >= 6 && row <= 8) || (column >= 6 && column <= 8))) return null;
                const x = column * BOARD_CELL;
                const y = row * BOARD_CELL;
                const ringPosition = RING_POSITION_BY_CELL.get(`${row},${column}`);
                const homeColor = HOME_COLOR_BY_CELL.get(`${row},${column}`);
                const safe = ringPosition !== undefined && LUDO_SAFE_SPACES.has(ringPosition);
                const startColor = ringPosition === undefined
                  ? undefined
                  : LUDO_COLORS.find((color) => LUDO_STARTS[color] === ringPosition);
                const center = row >= 6 && row <= 8 && column >= 6 && column <= 8;
                const cellClass = homeColor
                  ? "phase6d-ludo__home-cell"
                  : `phase6d-ludo__cell${startColor ? " is-start" : ""}${safe && !startColor ? " is-safe" : ""}${center ? " is-center" : ""}`;
                return (
                  <g
                    data-board-cell
                    data-board-column={column}
                    data-board-row={row}
                    data-home-lane={homeColor}
                    data-home-step={homeColor ? HOME_CELLS[homeColor].findIndex(([laneRow, laneColumn]) => laneRow === row && laneColumn === column) + 1 : undefined}
                    data-ring-position={ringPosition}
                    data-safe-space={safe ? ringPosition : undefined}
                    data-start-color={startColor}
                    key={`${row}-${column}`}
                  >
                    <rect
                      className={cellClass}
                      fill={startColor ? COLOR_VALUES[startColor] : homeColor ? COLOR_VALUES[homeColor] : "#fff"}
                      height={BOARD_CELL}
                      stroke="#303030"
                      strokeWidth="1"
                      width={BOARD_CELL}
                      x={x}
                      y={y}
                    />
                    {safe && <path className="phase6d-ludo__safe-mark" d={`M${x + 20} ${y + 14}l1.8 4 4.4.6-3.2 3.1.8 4.4-3.8-2.1-3.8 2.1.8-4.4-3.2-3.1 4.4-.6z`} fill={startColor ? "#fff" : "#555"} />}
                  </g>
                );
              })}
              <g className="phase6d-ludo__finish" data-finish-area="true">
                <rect fill="#fff" height={BOARD_CELL * 3} stroke="#303030" strokeWidth="1" width={BOARD_CELL * 3} x={BOARD_CELL * 6} y={BOARD_CELL * 6} />
                <path data-finish-section="teal" d={`M${BOARD_CELL * 6} ${BOARD_CELL * 6}H${BOARD_CELL * 9}L${BOARD_CENTER} ${BOARD_CENTER}Z`} fill={COLOR_VALUES.teal} />
                <path data-finish-section="gold" d={`M${BOARD_CELL * 9} ${BOARD_CELL * 6}V${BOARD_CELL * 9}L${BOARD_CENTER} ${BOARD_CENTER}Z`} fill={COLOR_VALUES.gold} />
                <path data-finish-section="violet" d={`M${BOARD_CELL * 9} ${BOARD_CELL * 9}H${BOARD_CELL * 6}L${BOARD_CENTER} ${BOARD_CENTER}Z`} fill={COLOR_VALUES.violet} />
                <path data-finish-section="coral" d={`M${BOARD_CELL * 6} ${BOARD_CELL * 9}V${BOARD_CELL * 6}L${BOARD_CENTER} ${BOARD_CENTER}Z`} fill={COLOR_VALUES.coral} />
              </g>
              {game.players.flatMap((player, playerIndex) => player.tokens.map((progress, tokenIndex) =>
                renderToken(playerIndex, tokenIndex, progress)))}
            </svg>
            <div className="phase6d-ludo__board-status" aria-live="polite">
              <span className="phase6d-ludo__die" data-rolling={rolling} aria-label={game.dice ? `${t("arcade.phase6d.ludo.rolling")} ${game.dice}` : t("arcade.phase6d.ludo.roll")}>
                {rolling ? <Dice5 size={22} /> : game.dice ?? <Dice5 size={22} />}
              </span>
              {game.phase === "won" ? (
                <strong>{statusLabel(game, t)}</strong>
              ) : game.phase === "move" ? (
                <strong>{computerTurn ? t("arcade.phase6d.ludo.thinking") : t("arcade.phase6d.ludo.chooseToken")}</strong>
              ) : computerTurn ? (
                <strong>{t("arcade.phase6d.ludo.thinking")}</strong>
              ) : (
                <button className="button button--primary" disabled={rolling} onClick={rollDice} type="button">
                  <Dice5 size={15} />{rolling ? t("arcade.phase6d.ludo.rolling") : t("arcade.phase6d.ludo.roll")}
                </button>
              )}
            </div>
          </section>

          <aside className="phase6d-ludo__side">
            <section className="phase6d-panel phase6d-ludo__players">
              <div className="phase6d-panel__heading"><div><span>{t("arcade.phase6d.ludo.players")}</span><h2><Users size={15} />{statusLabel(game, t)}</h2></div></div>
              {game.players.map((player, playerIndex) => (
                <div className={`phase6d-ludo__player${playerIndex === game.activePlayer ? " is-current" : ""}`} key={player.color}>
                  <i style={{ backgroundColor: COLOR_VALUES[player.color] }} />
                  <div><strong>{t(`arcade.phase6d.ludo.${player.color}`)}</strong><span>{localPlayerName(game, playerIndex, t)}</span></div>
                  <div className="phase6d-ludo__token-count" aria-label={`${player.tokens.filter((progress) => progress === LUDO_FINISH_PROGRESS).length} / 4`}>
                    {player.tokens.map((progress, tokenIndex) => {
                      const legal = playerIndex === game.activePlayer && game.legalTokens.includes(tokenIndex);
                      return <button aria-label={t(legal ? "arcade.phase6d.ludo.legalToken" : "arcade.phase6d.ludo.token", { color: t(`arcade.phase6d.ludo.${player.color}`), number: tokenIndex + 1 })} className={`${legal ? "is-legal" : ""}${progress === LUDO_FINISH_PROGRESS ? " is-home" : ""}`} disabled={!legal || rolling || computerTurn} key={tokenIndex} onClick={() => moveToken(tokenIndex)} style={{ "--token-color": COLOR_VALUES[player.color] } as React.CSSProperties} type="button">{progress === LUDO_FINISH_PROGRESS ? "✓" : tokenIndex + 1}</button>;
                    })}
                  </div>
                </div>
              ))}
              {game.phase === "move" && !computerTurn && <p className="phase6d-ludo__move-hint">{t("arcade.phase6d.ludo.chooseToken")}</p>}
              {game.phase === "roll" && !computerTurn && <p className="phase6d-ludo__move-hint">{t("arcade.phase6d.ludo.rollHint")}</p>}
            </section>

            <details className="phase6d-panel phase6d-ludo__rules">
              <summary>{t("arcade.phase6d.ludo.rules")}</summary>
              <p>{t("arcade.phase6d.ludo.rulesText")}</p>
            </details>

            <section aria-label={t("arcade.phase6d.ludo.history")} className="phase6d-panel phase6d-ludo__history">
              <h3>{t("arcade.phase6d.ludo.history")}</h3>
              <ol>{game.history.slice(-8).reverse().map((entry, index) => <li key={`${game.turn}-${index}-${entry.type}`}>{historyText(entry, game, t)}</li>)}</ol>
            </section>
          </aside>
        </div>
      ) : (
        <section className="phase6d-panel phase6d-invalid-save">
          <p>{t("arcade.phase6d.ludo.invalidSave")}</p>
          <button className="button button--primary" onClick={startNewGame} type="button">{t("arcade.phase6d.ludo.restart")}</button>
        </section>
      )}
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>
  );
}
