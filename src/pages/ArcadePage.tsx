import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowUpRight, Gamepad2, Heart, Search, Trophy, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ArcadeThumbnail } from "../components/ArcadeThumbnail";
import { db, type ArcadeRecord } from "../data/db";
import { accentPalette, games, type GameCategory, type GameId } from "../data/arcade";
import { audioPreferencesKey, defaultAudioPreferences, parseAudioPreferences, setArcadeAudioPreferences, type ArcadeAudioPreferences, playArcadeSound } from "../data/arcade-audio";
import { useUiStore } from "../stores/ui-store";

const GameScreen = lazy(() => import("./ArcadeGames").then((module) => ({ default: module.GameScreen })));
const Phase2GameScreen = lazy(() => import("./Phase2Games").then((module) => ({ default: module.Phase2GameScreen })));
const Phase3GameScreen = lazy(() => import("./Phase3Games").then((module) => ({ default: module.Phase3GameScreen })));
const ChessGame = lazy(() => import("./ChessGame").then((module) => ({ default: module.ChessGame })));
const Phase5GameScreen = lazy(() => import("./Phase5Games").then((module) => ({ default: module.Phase5GameScreen })));
const Phase5BGameScreen = lazy(() => import("./Phase5BGames").then((module) => ({ default: module.Phase5BGameScreen })));
const Phase5CGameScreen = lazy(() => import("./Phase5CGames").then((module) => ({ default: module.Phase5CGameScreen })));
const PerfectStackGame = lazy(() => import("./Phase6PerfectStack").then((module) => ({ default: module.Phase6PerfectStack })));
const LaserMirrorsGame = lazy(() => import("./Phase6LaserMirrors").then((module) => ({ default: module.Phase6LaserMirrors })));
const PixelCrossingGame = lazy(() => import("./Phase6PixelCrossing").then((module) => ({ default: module.Phase6PixelCrossing })));
const CrosswordInfiniteGame = lazy(() => import("./CrosswordInfinite").then((module) => ({ default: module.CrosswordInfinite })));
const ColorLudoGame = lazy(() => import("./ColorLudo").then((module) => ({ default: module.ColorLudo })));
const HexSettlersGame = lazy(() => import("./HexSettlers").then((module) => ({ default: module.HexSettlers })));
const ColorClashGame = lazy(() => import("./ColorClash").then((module) => ({ default: module.ColorClash })));
const favoriteKey = "favorites";
const recentKey = "recent";
const recordKey = (id: string) => `best:${id}`;
const dashboardRecordKeys = [
  favoriteKey,
  recentKey,
  audioPreferencesKey,
  ...games.map((game) => recordKey(game.id)),
];

function parseList(record: ArcadeRecord | undefined): string[] {
  if (!record) return [];
  try {
    const value: unknown = JSON.parse(record.value);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

function parseNumber(record: ArcadeRecord | undefined): number | undefined {
  const number = Number(record?.value);
  return record && Number.isFinite(number) ? number : undefined;
}

async function saveRecord(id: string, value: string) {
  await db.arcadeData.put({ id, value, updatedAt: Date.now() });
}

function ArcadeAudioControls({ preferences, onChange, disabled }: {
  preferences: ArcadeAudioPreferences;
  onChange: (next: ArcadeAudioPreferences) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="arcade-audio-controls">
      <button
        aria-label={t(preferences.muted ? "arcade.audio.unmute" : "arcade.audio.mute")}
        aria-pressed={!preferences.muted}
        className="arcade-audio-controls__mute"
        disabled={disabled}
        onClick={() => onChange({ ...preferences, muted: !preferences.muted })}
        type="button"
      >
        {preferences.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <label>
        <span>{t("arcade.audio.volume")}</span>
        <input
          aria-label={t("arcade.audio.volume")}
          disabled={disabled}
          max={1}
          min={0}
          onChange={(event) => onChange({ ...preferences, volume: Number(event.target.value) })}
          step={0.05}
          type="range"
          value={preferences.volume}
        />
      </label>
    </div>
  );
}

export function ArcadePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const selectedId = params["*"]?.split("/")[0] as GameId | undefined;
  const selectedGame = games.find((game) => game.id === selectedId);
  const records = useLiveQuery(
    () => db.arcadeData.where("id").anyOf(selectedGame
      ? [audioPreferencesKey, recentKey, recordKey(selectedGame.id)]
      : dashboardRecordKeys).toArray(),
    [selectedGame?.id],
  );
  const appearance = useUiStore((state) => state.appearance);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GameCategory | "all" | "favorites">("all");
  const [error, setError] = useState("");
  const [audioPreferences, setAudioPreferences] = useState<ArcadeAudioPreferences>(defaultAudioPreferences);
  const audioReady = records !== undefined;
  const palette = accentPalette(appearance.accent);
  const recordMap = useMemo(() => new Map((records ?? []).map((record) => [record.id, record])), [records]);
  const audioRecord = recordMap.get(audioPreferencesKey);
  useEffect(() => {
    if (records === undefined) return;
    const parsed = audioRecord ? parseAudioPreferences(audioRecord.value) : { ...defaultAudioPreferences, mutedGames: [] };
    setAudioPreferences(parsed);
    setArcadeAudioPreferences(parsed);
  }, [audioRecord, records]);
  const favorites = parseList(recordMap.get(favoriteKey));
  const recent = parseList(recordMap.get(recentKey));
  const recentRecord = recordMap.get(recentKey);
  const filtered = games.filter((game) => {
    const matchesCategory = category === "all" || (category === "favorites" ? favorites.includes(game.id) : game.category === category);
    const matchesSearch = `${game.name} ${t(`arcade.games.${game.id}.description`)}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  useEffect(() => {
    if (!selectedGame || records === undefined) return;
    const next = [selectedGame.id, ...recent.filter((id) => id !== selectedGame.id)].slice(0, 5);
    if (JSON.stringify(next) === recentRecord?.value) return;
    void saveRecord(recentKey, JSON.stringify(next)).catch(() => setError(t("arcade.saveError")));
  }, [records, recentRecord?.value, selectedGame?.id, t]);

  async function toggleFavorite(id: GameId) {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    try {
      await saveRecord(favoriteKey, JSON.stringify(next));
      setError("");
    } catch {
      setError(t("arcade.saveError"));
    }
  }

  async function saveAudioPreferences(next: ArcadeAudioPreferences) {
    setAudioPreferences(next);
    setArcadeAudioPreferences(next);
    try {
      await saveRecord(audioPreferencesKey, JSON.stringify(next));
      setError("");
    } catch {
      setError(t("arcade.saveError"));
    }
  }

  function handleUiClick(event: React.MouseEvent<HTMLElement>) {
    if (audioReady && event.target instanceof Element && event.target.closest("button, a")) {
      playArcadeSound(selectedGame?.id ?? "2048", "click");
    }
  }

  async function saveBest(id: GameId, value: number) {
    const lowerIsBetter = id === "reaction" || id === "memory" || id === "sliding" || id === "minesweeper" || id === "sudoku";
    try {
      await db.transaction("rw", db.arcadeData, async () => {
        const previous = parseNumber(await db.arcadeData.get(recordKey(id)));
        if (previous !== undefined && (lowerIsBetter ? previous <= value : previous >= value)) return;
        await saveRecord(recordKey(id), String(value));
      });
      setError("");
    } catch {
      setError(t("arcade.saveError"));
    }
  }

  async function saveModeBest(id: GameId, mode: string, value: number) {
    const key = `best:${id}:${mode}`;
    const lowerIsBetter = id === "minesweeper" || id === "sudoku";
    try {
      await db.transaction("rw", db.arcadeData, async () => {
        const previous = parseNumber(await db.arcadeData.get(key));
        if (previous !== undefined && (lowerIsBetter ? previous <= value : previous >= value)) return;
        await saveRecord(key, String(value));
      });
      await saveBest(id, value);
      setError("");
    } catch {
      setError(t("arcade.saveError"));
    }
  }

  if (selectedGame) {
    const phase6Props = {
      best: parseNumber(recordMap.get(recordKey(selectedGame.id))),
      onBest: (value: number) => void saveBest(selectedGame.id, value),
    };
    return (
      <section className="feature-page arcade-page" onClickCapture={handleUiClick}>
        <header className="page-heading--compact feature-heading arcade-game-heading">
          <div>
            <button className="arcade-back" onClick={() => navigate("/minigames")} type="button"><ArrowLeft size={14} />{t("arcade.back")}</button>
            <h1>{t(`arcade.games.${selectedGame.id}.name`)}</h1>
            <p>{t(`arcade.games.${selectedGame.id}.description`)}</p>
          </div>
          <div className="arcade-heading-actions">
            <ArcadeAudioControls disabled={!audioReady} onChange={(next) => void saveAudioPreferences(next)} preferences={audioPreferences} />
            <Link className="button button--quiet arcade-return" to="/minigames"><Gamepad2 size={14} />{t("arcade.arcade")}</Link>
          </div>
        </header>
        {selectedGame.id === "perfect-stack" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <PerfectStackGame {...phase6Props} />
          </Suspense>
        ) : selectedGame.id === "laser-mirrors" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <LaserMirrorsGame {...phase6Props} />
          </Suspense>
        ) : selectedGame.id === "pixel-crossing" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <PixelCrossingGame {...phase6Props} />
          </Suspense>
        ) : selectedGame.id === "crossword-infinite" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <CrosswordInfiniteGame />
          </Suspense>
        ) : selectedGame.id === "color-ludo" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <ColorLudoGame />
          </Suspense>
        ) : selectedGame.id === "hex-settlers" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <HexSettlersGame />
          </Suspense>
        ) : selectedGame.id === "color-clash" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <ColorClashGame />
          </Suspense>
        ) : ["word-guess", "brick-breaker", "geometry-runner", "air-hockey", "aim-trainer"].includes(selectedGame.id) ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <Phase2GameScreen
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              game={selectedGame}
              language={i18n.language.startsWith("de") ? "de" : "en"}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              onModeBest={(mode, value) => void saveModeBest(selectedGame.id, mode, value)}
              palette={palette}
            />
          </Suspense>
        ) : ["simon-says", "line-rider", "idle-clicker"].includes(selectedGame.id) ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <Phase3GameScreen
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              gameId={selectedGame.id as "simon-says" | "line-rider" | "idle-clicker"}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              palette={palette}
            />
          </Suspense>
        ) : selectedGame.id === "chess" ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <ChessGame
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              language={i18n.language.startsWith("de") ? "de" : "en"}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              palette={palette}
            />
          </Suspense>
        ) : ["block-stack", "minesweeper", "pong", "sudoku"].includes(selectedGame.id) ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <Phase5GameScreen
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              game={selectedGame}
              language={i18n.language.startsWith("de") ? "de" : "en"}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              onModeBest={(mode, value) => void saveModeBest(selectedGame.id, mode, value)}
              palette={palette}
            />
          </Suspense>
        ) : ["flappy-cube", "connect-four", "maze-escape"].includes(selectedGame.id) ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <Phase5BGameScreen
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              gameId={selectedGame.id as "flappy-cube" | "connect-four" | "maze-escape"}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              onModeBest={(mode, value) => void saveModeBest(selectedGame.id, mode, value)}
              palette={palette}
            />
          </Suspense>
        ) : ["tower-defense", "rhythm-tiles", "mini-platformer"].includes(selectedGame.id) ? (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
            <Phase5CGameScreen
              best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
              game={selectedGame}
              onBest={(value) => void saveBest(selectedGame.id, value)}
              onModeBest={(mode, value) => void saveModeBest(selectedGame.id, mode, value)}
              palette={palette}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<p className="arcade-loading">{t("arcade.loading")}</p>}>
          <GameScreen
            best={parseNumber(recordMap.get(recordKey(selectedGame.id)))}
            game={selectedGame}
            onBest={(value) => void saveBest(selectedGame.id, value)}
            palette={palette}
          />
          </Suspense>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="feature-page arcade-page" onClickCapture={handleUiClick}>
      <header className="page-heading--compact feature-heading arcade-heading">
        <div><span className="arcade-kicker"><Gamepad2 size={14} />{t("arcade.kicker")}</span><h1>{t("nav.minigames")}</h1><p>{t("arcade.subtitle")}</p></div>
        <div className="arcade-heading-actions">
          <ArcadeAudioControls disabled={!audioReady} onChange={(next) => void saveAudioPreferences(next)} preferences={audioPreferences} />
          <div className="arcade-highscore"><Trophy size={15} /><span>{t("arcade.personalBests", { count: games.filter((game) => recordMap.has(recordKey(game.id))).length })}</span></div>
        </div>
      </header>

      {recent.length > 0 && (
        <div className="arcade-recent">
          <div className="arcade-section-title"><h2>{t("arcade.recent")}</h2></div>
          <div className="arcade-recent-list">
            {recent.map((id) => games.find((game) => game.id === id)).filter((game): game is (typeof games)[number] => Boolean(game)).map((game) => (
              <button key={game.id} onClick={() => navigate(`/minigames/${game.id}`)} type="button">{t(`arcade.games.${game.id}.name`)}<ArrowUpRight size={12} /></button>
            ))}
          </div>
        </div>
      )}

      <div className="arcade-toolbar">
        <div className="arcade-filters" role="group" aria-label={t("arcade.categories")}>
          {(["all", "puzzle", "arcade", "reaction", "precision", "strategy", "favorites"] as const).map((filter) => (
            <button aria-pressed={category === filter} className={category === filter ? "is-active" : ""} key={filter} onClick={() => setCategory(filter)} type="button">{t(`arcade.filters.${filter}`)}</button>
          ))}
        </div>
        <label className="arcade-search"><Search size={14} /><input aria-label={t("arcade.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("arcade.search")} value={query} /></label>
      </div>

      <div className="arcade-game-grid" style={{ "--game-accent": palette.accent, "--game-accent-soft": palette.soft, "--game-accent-strong": palette.strong } as React.CSSProperties}>
        {filtered.map((game) => {
          const best = parseNumber(recordMap.get(recordKey(game.id)));
          const gameName = t(`arcade.games.${game.id}.name`);
          return (
            <article className="arcade-card" key={game.id}>
              <div className="arcade-card__top"><ArcadeThumbnail gameId={game.id} label={t(`arcade.games.${game.id}.name`)} /><button aria-label={`${favorites.includes(game.id) ? t("arcade.removeFavorite") : t("arcade.addFavorite")} ${gameName}`} aria-pressed={favorites.includes(game.id)} className={`arcade-favorite${favorites.includes(game.id) ? " is-favorite" : ""}`} onClick={() => void toggleFavorite(game.id)} type="button"><Heart size={15} fill={favorites.includes(game.id) ? "currentColor" : "none"} /></button></div>
              <div className="arcade-card__copy"><span className="arcade-card__category">{t(`arcade.filters.${game.category}`)}</span><h2>{gameName}</h2><p>{t(`arcade.games.${game.id}.description`)}</p></div>
              <div className="arcade-card__footer"><span>{best === undefined ? t("arcade.noBest") : `${t("arcade.best")}: ${best}${game.id === "reaction" ? " ms" : game.id === "memory" ? ` ${t("arcade.moves")}` : ["sliding", "minesweeper", "sudoku"].includes(game.id) ? ` ${t("arcade.seconds")}` : ""}`}</span><button className="button button--primary" onClick={() => navigate(`/minigames/${game.id}`)} type="button">{t("arcade.play")}<ArrowUpRight size={13} /></button></div>
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="arcade-empty">{t("arcade.empty")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
