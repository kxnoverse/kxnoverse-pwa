import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleHelp, Layers2, RotateCcw, SkipForward } from "lucide-react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import {
  CLASH_COLORS,
  createColorClash,
  drawClashCard,
  getPlayableClashCards,
  passClashTurn,
  playClashCard,
  runColorClashAiTurn,
  takeClashPenalty,
  validateColorClashState,
  type ClashCard,
  type ClashColor,
  type ClashDifficulty,
  type ClashHistoryEntry,
  type ClashMode,
  type ColorClashState,
} from "../data/phase6d/color-clash";

const SAVE_KEY = "color-clash:session";
const COLOR_VALUES: Record<ClashColor, string> = {
  coral: "#cf665f",
  blue: "#4e83bc",
  green: "#51946e",
  gold: "#d2a83c",
};

function playerName(
  state: ColorClashState,
  index: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const player = state.players[index];
  if (player.kind === "computer") return t("arcade.phase6d.colorClash.aiPlayer", { number: index });
  if (state.mode === "computer") return t("arcade.phase6d.colorClash.you");
  return t("arcade.phase6d.colorClash.player", { number: index + 1 });
}

function cardTitle(
  card: ClashCard,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const type = card.type === "number" ? "numberCard" : card.type;
  return card.type === "number"
    ? t(`arcade.phase6d.colorClash.cards.${type}`, { value: card.value })
    : t(`arcade.phase6d.colorClash.cards.${type}`);
}

function cardGlyph(card: ClashCard): string {
  switch (card.type) {
    case "number": return String(card.value);
    case "skip": return "⊘";
    case "reverse": return "↻";
    case "drawTwo": return "+2";
    case "wild": return "✳";
  }
}

function historyText(
  entry: ClashHistoryEntry,
  state: ColorClashState,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return t(`arcade.phase6d.colorClash.log.${entry.type}`, {
    player: playerName(state, entry.player, t),
    card: entry.cardType
      ? t(`arcade.phase6d.colorClash.cards.${entry.cardType === "number" ? "numberCard" : entry.cardType}`, { value: entry.value })
      : "",
    color: entry.color ? t(`arcade.phase6d.colorClash.colors.${entry.color}`) : "",
    amount: entry.amount ?? 0,
  });
}

export function ColorClash() {
  const { t } = useTranslation();
  const [game, setGame] = useState<ColorClashState | null>(null);
  const [mode, setMode] = useState<ClashMode>("computer");
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const [difficulty, setDifficulty] = useState<ClashDifficulty>("normal");
  const [stackDrawCards, setStackDrawCards] = useState(false);
  const [handVisible, setHandVisible] = useState(true);
  const [pendingWildCardId, setPendingWildCardId] = useState("");
  const [failure, setFailure] = useState("");
  const [ready, setReady] = useState(false);
  const gameRef = useRef<ColorClashState | null>(null);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const translation = useRef(t);
  translation.current = t;

  const save = useCallback((next: ColorClashState) => {
    const write = writeQueue.current.then(async () => {
      await db.arcadeData.put({ id: SAVE_KEY, value: JSON.stringify(next), updatedAt: Date.now() });
    });
    writeQueue.current = write.catch((error: unknown) => {
      console.error("Could not save Color Clash game.", error);
      setFailure(translation.current("arcade.phase6d.colorClash.saveError"));
    });
  }, []);

  const commit = useCallback((next: ColorClashState) => {
    const previous = gameRef.current;
    if (next.mode === "local" && previous && next.activePlayer !== previous.activePlayer && next.phase === "play") {
      setHandVisible(false);
      setPendingWildCardId("");
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
        if (!validateColorClashState(parsed)) {
          setFailure(t("arcade.phase6d.colorClash.invalidSave"));
          setReady(true);
          return;
        }
        gameRef.current = parsed;
        setGame(parsed);
        setMode(parsed.mode);
        setPlayerCount(parsed.players.length as 2 | 3 | 4);
        setDifficulty(parsed.difficulty);
        setStackDrawCards(parsed.stackDrawCards);
        setHandVisible(parsed.mode !== "local");
        setReady(true);
        return;
      }
      const initial = createColorClash("computer", 2);
      gameRef.current = initial;
      setGame(initial);
      setReady(true);
      save(initial);
    }).catch((error: unknown) => {
      console.error("Could not load Color Clash game.", error);
      if (active) {
        setFailure(t("arcade.phase6d.colorClash.saveError"));
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [save, t]);

  useEffect(() => {
    if (!game || !ready || game.phase === "won" || game.players[game.activePlayer].kind !== "computer") return;
    const timer = window.setTimeout(() => {
      const next = runColorClashAiTurn(game);
      if (next !== game) commit(next);
    }, 560);
    return () => window.clearTimeout(timer);
  }, [commit, game, ready]);

  const apply = useCallback((result: { state: ColorClashState; error?: string }) => {
    if (result.error) {
      setFailure(result.error);
      return;
    }
    setFailure("");
    commit(result.state);
  }, [commit]);

  function startNewGame() {
    if (game && !window.confirm(t("arcade.phase6d.colorClash.confirmNew"))) return;
    const next = createColorClash(mode, playerCount, difficulty, stackDrawCards, Date.now());
    setFailure("");
    setPendingWildCardId("");
    setHandVisible(true);
    commit(next);
  }

  if (!ready) return <p className="arcade-loading">{t("arcade.loading")}</p>;
  if (!game) return <p className="form-error" role="alert">{failure || t("arcade.phase6d.colorClash.invalidSave")}</p>;

  const currentPlayer = game.players[game.activePlayer];
  const computerTurn = currentPlayer.kind === "computer";
  const playableCards = getPlayableClashCards(game);
  const playableIds = new Set(playableCards.map((card) => card.id));
  const topCard = game.discardPile[game.discardPile.length - 1];
  const pendingWildCard = currentPlayer.hand.find((card) => card.id === pendingWildCardId);
  const localHandoff = game.mode === "local" && !handVisible && game.phase === "play";
  const canDraw = !computerTurn && !localHandoff && game.phase === "play" &&
    (game.pendingDraw > 0 || (!game.hasDrawn && playableCards.length === 0));
  const canPass = !computerTurn && !localHandoff && game.phase === "play" && game.hasDrawn && game.pendingDraw === 0;
  const canTakePenalty = !computerTurn && !localHandoff && game.phase === "play" && game.pendingDraw > 0;
  const statusText = game.phase === "won"
    ? t("arcade.phase6d.colorClash.winner", { player: playerName(game, game.winner ?? game.activePlayer, t) })
    : localHandoff
      ? t("arcade.phase6d.colorClash.passDevice", { player: playerName(game, game.activePlayer, t) })
      : game.pendingDraw > 0
        ? t("arcade.phase6d.colorClash.penaltyPending", { amount: game.pendingDraw })
        : game.hasDrawn
          ? t("arcade.phase6d.colorClash.afterDraw")
          : t("arcade.phase6d.colorClash.turn", { player: playerName(game, game.activePlayer, t) });

  function playCard(card: ClashCard) {
    if (!game) return;
    if (!playableIds.has(card.id)) return;
    if (card.type === "wild") {
      setPendingWildCardId(card.id);
      return;
    }
    apply(playClashCard(game, card.id));
  }

  function chooseWildColor(color: ClashColor) {
    if (!game || !pendingWildCardId) return;
    apply(playClashCard(game, pendingWildCardId, color));
    setPendingWildCardId("");
  }

  return (
    <div className="phase6-game phase6d-clash" data-game="color-clash">
      <div className="phase6-game__toolbar phase6d-toolbar">
        <div className="phase6-game__stats">
          <span>{t("arcade.phase6d.colorClash.turnCounter", { turn: game.turn })}</span>
          <span>{t("arcade.phase6d.colorClash.cardsLeft", { count: game.drawPile.length })}</span>
        </div>
        <div className="phase6-game__actions phase6d-toolbar__actions">
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.colorClash.mode")}</span>
            <select onChange={(event) => {
              const nextMode = event.target.value as ClashMode;
              setMode(nextMode);
              if (nextMode === "computer") setPlayerCount(2);
            }} value={mode}>
              <option value="computer">{t("arcade.phase6d.colorClash.computer")}</option>
              <option value="local">{t("arcade.phase6d.colorClash.local")}</option>
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.colorClash.players")}</span>
            <select onChange={(event) => setPlayerCount(Number(event.target.value) as 2 | 3 | 4)} value={playerCount}>
              {[2, 3, 4].map((count) => <option key={count} value={count}>{t("arcade.phase6d.colorClash.playerCount", { count })}</option>)}
            </select>
          </label>
          <label className="phase6d-field">
            <span>{t("arcade.phase6d.colorClash.difficulty")}</span>
            <select disabled={mode !== "computer"} onChange={(event) => setDifficulty(event.target.value as ClashDifficulty)} value={difficulty}>
              {(["easy", "normal", "hard"] as const).map((level) => <option key={level} value={level}>{t(`arcade.phase6d.colorClash.${level}`)}</option>)}
            </select>
          </label>
          <label className="phase6d-clash__rule">
            <input checked={stackDrawCards} onChange={(event) => setStackDrawCards(event.target.checked)} type="checkbox" />
            <span>{t("arcade.phase6d.colorClash.stackDrawCards")}</span>
          </label>
          <button className="button button--quiet" onClick={startNewGame} type="button"><RotateCcw size={13} />{t("arcade.phase6d.colorClash.newGame")}</button>
        </div>
      </div>

      <div aria-live="polite" className={`phase6d-clash__status${game.phase === "won" ? " is-won" : ""}`} role="status">
        <strong>{statusText}</strong>
        {game.pendingDraw > 0 && <span>{t(game.stackDrawCards ? "arcade.phase6d.colorClash.stackHint" : "arcade.phase6d.colorClash.drawHint")}</span>}
        {currentPlayer.hand.length === 1 && game.phase === "play" && !localHandoff &&
          <span className="phase6d-clash__last-card"><CircleAlert size={13} />{t("arcade.phase6d.colorClash.lastCard", { player: playerName(game, game.activePlayer, t) })}</span>}
        {computerTurn && game.phase === "play" && <span>{t("arcade.phase6d.colorClash.computerTurn")}</span>}
      </div>

      <section aria-label={t("arcade.phase6d.colorClash.table")} className="phase6d-clash__table">
        <div className="phase6d-clash__players">
          {game.players.map((player) => (
            <div className={`phase6d-clash__player${player.id === game.activePlayer ? " is-current" : ""}${player.id === game.winner ? " is-winner" : ""}`} key={player.id}>
              <span className="phase6d-clash__player-dot" />
              <strong>{playerName(game, player.id, t)}</strong>
              {player.id === game.activePlayer && <span className="phase6d-clash__active-label">{t("arcade.phase6d.colorClash.active")}</span>}
              <span className="phase6d-clash__hand-count">{t("arcade.phase6d.colorClash.handCount", { count: player.hand.length })}</span>
              {player.hand.length === 1 && player.id !== game.winner && <span aria-label={t("arcade.phase6d.colorClash.oneCard")} className="phase6d-clash__one-card">1</span>}
            </div>
          ))}
        </div>

        <div className="phase6d-clash__play-area">
          <button
            aria-label={canDraw ? t(game.pendingDraw ? "arcade.phase6d.colorClash.takePenalty" : "arcade.phase6d.colorClash.drawCard") : t("arcade.phase6d.colorClash.drawPile")}
            className={`phase6d-clash__deck${canDraw ? " is-available" : ""}`}
            disabled={!canDraw}
            onClick={() => apply(game.pendingDraw > 0 ? takeClashPenalty(game) : drawClashCard(game))}
            type="button"
          >
            <span className="phase6d-clash__back-mark">K</span>
            <strong>{game.drawPile.length}</strong>
            <small>{t("arcade.phase6d.colorClash.drawPile")}</small>
          </button>
          <div className="phase6d-clash__center">
            <span className="phase6d-clash__current-color">
              <i style={{ backgroundColor: COLOR_VALUES[game.currentColor] }} />
              {t("arcade.phase6d.colorClash.currentColor", { color: t(`arcade.phase6d.colorClash.colors.${game.currentColor}`) })}
            </span>
            <div aria-label={t("arcade.phase6d.colorClash.discardPile")} className="phase6d-clash__discard">
              <CardFace card={topCard} t={t} />
            </div>
            {game.pendingDraw > 0 && <strong className="phase6d-clash__pending-draw">+{game.pendingDraw}</strong>}
          </div>
          <div aria-label={t("arcade.phase6d.colorClash.actionControls")} className="phase6d-clash__actions">
            {canPass && <button className="button button--quiet" onClick={() => apply(passClashTurn(game))} type="button"><SkipForward size={14} />{t("arcade.phase6d.colorClash.pass")}</button>}
            {canTakePenalty && <button className="button button--quiet" onClick={() => apply(takeClashPenalty(game))} type="button"><Layers2 size={14} />{t("arcade.phase6d.colorClash.takePenalty")}</button>}
          </div>
        </div>

        {pendingWildCard && (
          <div aria-label={t("arcade.phase6d.colorClash.chooseColor")} className="phase6d-clash__color-picker">
            <strong>{t("arcade.phase6d.colorClash.chooseColor")}</strong>
            {CLASH_COLORS.map((color) => (
              <button aria-label={t(`arcade.phase6d.colorClash.colors.${color}`)} key={color} onClick={() => chooseWildColor(color)} style={{ "--clash-color": COLOR_VALUES[color] } as React.CSSProperties} type="button">
                <i />{t(`arcade.phase6d.colorClash.colors.${color}`)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-label={t("arcade.phase6d.colorClash.hand")} className="phase6d-clash__hand-section">
        <div className="phase6d-clash__hand-heading">
          <div><span>{t("arcade.phase6d.colorClash.handLabel", { player: playerName(game, game.activePlayer, t) })}</span><strong>{t("arcade.phase6d.colorClash.handCount", { count: currentPlayer.hand.length })}</strong></div>
          {game.hasDrawn && !localHandoff && <span>{t("arcade.phase6d.colorClash.drawnCardHint")}</span>}
        </div>
        {localHandoff ? (
          <div className="phase6d-clash__handoff">
            <p>{t("arcade.phase6d.colorClash.passDevice", { player: playerName(game, game.activePlayer, t) })}</p>
            <button className="button button--primary" onClick={() => setHandVisible(true)} type="button">{t("arcade.phase6d.colorClash.ready")}</button>
          </div>
        ) : (
          <div className="phase6d-clash__hand" role="group" aria-label={t("arcade.phase6d.colorClash.hand")}>
            {currentPlayer.hand.map((card) => {
              const playable = playableIds.has(card.id) && !computerTurn && game.phase === "play";
              return (
                <button
                  aria-label={cardTitle(card, t)}
                  aria-pressed={pendingWildCardId === card.id}
                  className={`phase6d-clash__card${playable ? " is-playable" : ""}${pendingWildCardId === card.id ? " is-selected" : ""}`}
                  disabled={!playable || localHandoff}
                  key={card.id}
                  onClick={() => playCard(card)}
                  style={{ "--clash-color": card.color ? COLOR_VALUES[card.color] : undefined } as React.CSSProperties}
                  type="button"
                >
                  <CardFace card={card} t={t} />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="phase6d-clash__lower">
        <details className="phase6d-panel phase6d-clash__tutorial">
          <summary><CircleHelp size={13} />{t("arcade.phase6d.colorClash.tutorial")}</summary>
          <p>{t("arcade.phase6d.colorClash.tutorialText")}</p>
        </details>
        <section className="phase6d-panel phase6d-clash__history">
          <div className="phase6d-clash__history-heading"><h3>{t("arcade.phase6d.colorClash.history")}</h3><span>{game.stackDrawCards ? t("arcade.phase6d.colorClash.stackingOn") : t("arcade.phase6d.colorClash.stackingOff")}</span></div>
          <ol aria-live="polite">
            {[...game.history].reverse().slice(0, 8).map((entry) => <li key={entry.id}>{historyText(entry, game, t)}</li>)}
          </ol>
        </section>
      </div>
      {failure && <p className="form-error" role="alert">{failure}</p>}
    </div>
  );
}

function CardFace({ card, t }: {
  card: ClashCard;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <span className={`phase6d-clash__card-face${card.type === "wild" ? " is-wild" : ""}`} style={{ "--clash-color": card.color ? COLOR_VALUES[card.color] : undefined } as React.CSSProperties}>
      {card.type === "wild" && <span aria-hidden="true" className="phase6d-clash__wild-mark"><i /><i /><i /><i /></span>}
      <span className="phase6d-clash__card-corner">{card.type === "number" ? card.value : cardGlyph(card)}</span>
      <span className="phase6d-clash__card-glyph">{cardGlyph(card)}</span>
      <span className="phase6d-clash__card-name">{cardTitle(card, t)}</span>
    </span>
  );
}
